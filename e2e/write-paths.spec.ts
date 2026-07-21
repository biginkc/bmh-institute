import { expect, test, type Page } from "@playwright/test";

import {
  cleanupWritePathFixture,
  createWritePathFixture,
  writePathAdminClient,
  type WritePathFixture,
} from "./write-path-fixtures";
import { bootstrapTestSession, expectHugoOnlyLogin } from "./session-bootstrap";

async function approveSubmission(
  page: Page,
  fixture: WritePathFixture,
  assignmentTitle: string,
  assignmentId: string,
) {
  await page.goto("/admin/submissions");
  const card = page
    .locator(`[data-assignment-id="${assignmentId}"]`)
    .first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: assignmentTitle })).toBeVisible();
  await card.getByRole("button", { name: /^approve$/i }).click();
  await expect
    .poll(() => submissionIsApproved(writePathAdminClient(), fixture, assignmentId), {
      timeout: 20_000,
    })
    .toBe(true);
}

async function submissionIsApproved(
  admin: ReturnType<typeof writePathAdminClient>,
  fixture: WritePathFixture,
  assignmentId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("assignment_submissions")
    .select("status")
    .eq("user_id", fixture.learner.id)
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return data?.status === "approved";
}

async function hasCourseAndProgramCertificates(
  admin: ReturnType<typeof writePathAdminClient>,
  fixture: WritePathFixture,
): Promise<boolean> {
  const [course, program] = await Promise.all([
    admin
      .from("certificates")
      .select("id")
      .eq("user_id", fixture.learner.id)
      .eq("course_id", fixture.courseId)
      .maybeSingle(),
    admin
      .from("program_certificates")
      .select("id")
      .eq("user_id", fixture.learner.id)
      .eq("program_id", fixture.programId)
      .maybeSingle(),
  ]);
  if (course.error || program.error) return false;
  return Boolean(course.data?.id && program.data?.id);
}

async function issuedCertificateRefs(
  admin: ReturnType<typeof writePathAdminClient>,
  fixture: WritePathFixture,
): Promise<{
  courseId: string;
  coursePdfPath: string | null;
  programId: string;
  programPdfPath: string | null;
} | null> {
  const [course, program] = await Promise.all([
    admin
      .from("certificates")
      .select("id, certificate_number, pdf_path")
      .eq("user_id", fixture.learner.id)
      .eq("course_id", fixture.courseId)
      .maybeSingle(),
    admin
      .from("program_certificates")
      .select("id, certificate_number, pdf_path")
      .eq("user_id", fixture.learner.id)
      .eq("program_id", fixture.programId)
      .maybeSingle(),
  ]);
  if (course.error || program.error || !course.data || !program.data) {
    return null;
  }
  return {
    courseId: course.data.id as string,
    coursePdfPath: course.data.pdf_path as string | null,
    programId: program.data.id as string,
    programPdfPath: program.data.pdf_path as string | null,
  };
}

test.describe("durable write-path coverage", () => {
  test.describe.configure({ timeout: 120_000 });

  test("retires app password, recovery, and invite-acceptance entrypoints", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    try {
      await expectHugoOnlyLogin(page);

      for (const legacyPath of ["/forgot-password", "/auth/set-password"]) {
        await page.goto(legacyPath);
        await expect(page).toHaveURL(/\/login$/);
        await expect(
          page.getByRole("button", { name: /^continue with hugo$/i }),
        ).toHaveCount(1);
        await expect(page.getByLabel(/email|password/i)).toHaveCount(0);
      }

      const removedResetRoute = await page.goto("/reset-password");
      expect(removedResetRoute?.status()).toBe(404);
      await expect(page.getByLabel(/email|password/i)).toHaveCount(0);

      const response = await context.request.post("/auth/apply-invite");
      expect(response.status()).toBe(410);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "legacy_invites_disabled",
      });
    } finally {
      await context.close();
    }
  });

  test("drives learner/admin LMS write paths against non-production data", async ({
    browser,
    page,
  }) => {
    const admin = writePathAdminClient();
    let fixture: WritePathFixture | null = null;

    try {
      fixture = await createWritePathFixture(admin);

      await bootstrapTestSession(page, {
        email: fixture.learner.email,
        password: fixture.password,
      });
      await expect(
        page.getByRole("heading", { name: `${fixture.prefix} Course` }),
      ).toBeVisible();
      await page.goto(`/courses/${fixture.courseId}`);
      await expect(
        page.getByRole("heading", { name: `${fixture.prefix} Course` }),
      ).toBeVisible();

      await page.goto(`/lessons/${fixture.contentLessonId}?part=lesson`);
      await expect(page).toHaveURL(
        new RegExp(`/lessons/${fixture.contentLessonId}\\?part=lesson$`),
      );
      await expect(page.getByText(`${fixture.prefix} Operating standard`)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /mark lesson complete/i }),
      ).toHaveCount(0);

      await page.goto(`/lessons/${fixture.quizLessonId}`);
      await expect(page).toHaveURL(
        new RegExp(`/lessons/${fixture.contentLessonId}\\?part=quiz$`),
      );
      await page.getByRole("button", { name: /start quiz/i }).click();
      await page.getByText(fixture.incorrectOptionText).click();
      await page.getByRole("button", { name: /check answer/i }).click();
      await expect(page.getByText(/^Incorrect$/)).toBeVisible();
      await page.getByRole("button", { name: /^finish$/i }).click();
      await expect(page.getByRole("heading", { name: "Keep going" })).toBeVisible();
      await expect(page.getByText(/0% score/i)).toBeVisible();
      await page.goto(`/courses/${fixture.courseId}`);
      await expect(
        page.getByText(`${fixture.prefix} Text Assignment Lesson`).first(),
      ).toBeVisible();
      await expect(
        page
          .locator("[data-learner-tile-grid] li")
          .filter({ hasText: `${fixture.prefix} Text Assignment Lesson` })
          .locator("a"),
      ).toHaveCount(0);

      await page.goto(`/lessons/${fixture.quizLessonId}`);
      await expect(page).toHaveURL(
        new RegExp(`/lessons/${fixture.contentLessonId}\\?part=quiz$`),
      );
      await page
        .getByRole("button", { name: /start quiz|retake quiz/i })
        .click();
      await page.getByText(fixture.correctOptionText).click();
      await page.getByRole("button", { name: /check answer/i }).click();
      await expect(page.getByText(/^Correct$/)).toBeVisible();
      const finalizeResponsePromise = page.waitForResponse(async (response) => {
        const request = response.request();
        return request.method() === "POST" &&
          (await request.headerValue("next-action")) !== null;
      });
      await page.getByRole("button", { name: /^finish$/i }).click();
      const finalizeResponse = await finalizeResponsePromise;
      expect(finalizeResponse.ok()).toBe(true);
      expect(await finalizeResponse.finished()).toBeNull();
      await expect(page.getByText(/On to the next lesson/i)).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Passed" }),
      ).toBeFocused();
      await page.getByRole("link", { name: "Back to course" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/courses/${fixture.courseId}$`),
      );
      await expect(
        page
          .locator("[data-learner-tile-grid] a")
          .filter({ hasText: `${fixture.prefix} Text Assignment Lesson` }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to dashboard" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(
        page.getByRole("heading", { name: `${fixture.prefix} Course` }),
      ).toBeVisible();
      await expect(
        page
          .locator("[data-learner-tile-grid] a")
          .filter({ hasText: `${fixture.prefix} Text Assignment Lesson` }),
      ).toBeVisible();

      await page.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await page.getByLabel(/response/i).fill(`${fixture.prefix} first response`);
      await page.getByRole("button", { name: /^submit for review$/i }).click();
      await expect(
        page.getByRole("heading", { name: "Submitted, awaiting review" }),
      ).toBeVisible();

      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await bootstrapTestSession(adminPage, {
        email: fixture.admin.email,
        password: fixture.password,
      });

      await adminPage.goto("/admin/submissions");
      const textSubmissionCard = adminPage
        .locator(`[data-assignment-id="${fixture.textAssignmentId}"]`)
        .first();
      await expect(textSubmissionCard).toBeVisible();
      await textSubmissionCard
        .getByLabel(/note to learner/i)
        .fill(`${fixture.prefix} revise this response`);
      await textSubmissionCard
        .getByRole("button", { name: /request revision/i })
        .click();
      await expect(adminPage.getByText(/sent back with note/i)).toBeVisible();

      await page.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await expect(page.getByText(/^Needs revision$/).first()).toBeVisible();
      await expect(page.getByText(`${fixture.prefix} revise this response`).first()).toBeVisible();
      await page.getByLabel(/response/i).fill(`${fixture.prefix} revised response`);
      await page.getByRole("button", { name: /^resubmit for review$/i }).click();
      await expect(
        page.getByRole("heading", { name: "Submitted, awaiting review" }),
      ).toBeVisible();

      await approveSubmission(
        adminPage,
        fixture,
        `${fixture.prefix} Text Assignment`,
        fixture.textAssignmentId,
      );

      await page.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await expect(page.getByText(/^Approved$/).first()).toBeVisible();

      await page.goto(`/lessons/${fixture.fileAssignmentLessonId}`);
      await page.locator('input[type="file"]').setInputFiles({
        name: "write-path-upload.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(`${fixture.prefix} file upload`),
      });
      await expect(page.getByText(/selected: write-path-upload.txt/i)).toBeVisible();
      await page.getByRole("button", { name: /^submit for review$/i }).click();
      await expect(
        page.getByRole("heading", { name: "Submitted, awaiting review" }),
      ).toBeVisible();

      await approveSubmission(
        adminPage,
        fixture,
        `${fixture.prefix} File Assignment`,
        fixture.fileAssignmentId,
      );
      await expect
        .poll(() => hasCourseAndProgramCertificates(admin, fixture!), {
          timeout: 20_000,
        })
        .toBe(true);
      const certificateRefs = await issuedCertificateRefs(admin, fixture);
      expect(certificateRefs).not.toBeNull();
      expect(certificateRefs?.coursePdfPath).toBe("pending");
      expect(certificateRefs?.programPdfPath).toBe("pending");

      await page.goto("/certificates");
      await expect(page.getByText(`${fixture.prefix} Course`)).toBeVisible();
      await expect(page.getByText(`${fixture.prefix} Program`)).toBeVisible();
      await page.goto(`/certificates/course/${certificateRefs!.courseId}`);
      await expect(
        page.getByRole("heading", { name: "Certificate of Completion" }),
      ).toBeVisible();
      await expect(page.getByText(`${fixture.prefix} Course`, { exact: false })).toBeVisible();
      await page.evaluate(() => {
        window.print = () => window.sessionStorage.setItem("print-called", "1");
      });
      await page.getByRole("button", { name: /print \/ save pdf/i }).click();
      await expect
        .poll(() => page.evaluate(() => window.sessionStorage.getItem("print-called")))
        .toBe("1");

      const unassignedContext = await browser.newContext();
      const unassigned = await unassignedContext.newPage();
      await bootstrapTestSession(unassigned, {
        email: fixture.unassigned.email,
        password: fixture.password,
      });
      await expect(unassigned.getByText(/no training assigned yet/i)).toBeVisible();
      await unassigned.goto(`/courses/${fixture.courseId}`);
      await expect(unassigned.getByText(`${fixture.prefix} Course`)).toHaveCount(0);

      await adminContext.close();
      await unassignedContext.close();
    } finally {
      await cleanupWritePathFixture(admin, fixture);
    }
  });

});
