import { expect, test, type Page } from "@playwright/test";

import {
  cleanupInviteAcceptanceFixture,
  cleanupWritePathFixture,
  createInviteAcceptanceFixture,
  createWritePathFixture,
  deleteRateLimitRows,
  writePathAdminClient,
  type InviteAcceptanceFixture,
  type WritePathFixture,
} from "./write-path-fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function approveSubmission(
  page: Page,
  fixture: WritePathFixture,
  assignmentTitle: string,
  assignmentId: string,
) {
  await page.goto("/admin/submissions");
  const card = page
    .locator('[data-slot="card"]')
    .filter({ hasText: assignmentTitle })
    .first();
  await expect(card).toBeVisible();
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

async function inviteWasAccepted(
  admin: ReturnType<typeof writePathAdminClient>,
  fixture: InviteAcceptanceFixture,
): Promise<boolean> {
  const [invite, profile, roleGroups] = await Promise.all([
    admin
      .from("invites")
      .select("accepted_at")
      .eq("id", fixture.inviteId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("system_role, status")
      .eq("id", fixture.invitee.id)
      .maybeSingle(),
    admin
      .from("user_role_groups")
      .select("role_group_id")
      .eq("user_id", fixture.invitee.id)
      .eq("role_group_id", fixture.roleGroupId),
  ]);
  if (invite.error || profile.error || roleGroups.error) return false;
  return Boolean(
    invite.data?.accepted_at &&
      profile.data?.system_role === "learner" &&
      profile.data?.status === "active" &&
      (roleGroups.data ?? []).length === 1,
  );
}

async function clearSetPasswordRateLimits(
  admin: ReturnType<typeof writePathAdminClient>,
  email: string,
): Promise<void> {
  await Promise.all([
    deleteRateLimitRows(admin, "email", email),
    deleteRateLimitRows(admin, "ip", "127.0.0.1"),
    deleteRateLimitRows(admin, "ip", "::1"),
    deleteRateLimitRows(admin, "ip", "::ffff:127.0.0.1"),
  ]);
}

test.describe("durable write-path coverage", () => {
  test.describe.configure({ timeout: 120_000 });

  test("accepts an invite and sets the first password without email capture", async ({
    browser,
  }) => {
    const admin = writePathAdminClient();
    let fixture: InviteAcceptanceFixture | null = null;
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    try {
      fixture = await createInviteAcceptanceFixture(admin);
      await clearSetPasswordRateLimits(admin, fixture.invitee.email);

      await page.goto(fixture.inviteLink);
      await page.waitForURL(/\/auth\/set-password/, { timeout: 30_000 });
      await expect(page.getByLabel(/email/i)).toHaveValue(fixture.invitee.email);

      await page.getByLabel(/^new password$/i).fill(fixture.password);
      await page.getByLabel(/^confirm password$/i).fill(fixture.password);
      await page.getByRole("button", { name: /finish setup/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      await expect(page.getByText(`${fixture.prefix} Invite Program`)).toBeVisible();

      await expect
        .poll(() => inviteWasAccepted(admin, fixture!), { timeout: 20_000 })
        .toBe(true);
    } finally {
      if (fixture) {
        await clearSetPasswordRateLimits(admin, fixture.invitee.email);
      }
      await context.close();
      await cleanupInviteAcceptanceFixture(admin, fixture);
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

      await signIn(page, fixture.learner.email, fixture.password);
      await expect(page.getByText(`${fixture.prefix} Program`)).toBeVisible();
      await page.goto(`/courses/${fixture.courseId}`);
      await expect(
        page.getByRole("heading", { name: `${fixture.prefix} Course` }),
      ).toBeVisible();

      await page.goto(`/lessons/${fixture.contentLessonId}`);
      await expect(page.getByText(`${fixture.prefix} Operating standard`)).toBeVisible();
      await page.getByRole("button", { name: /mark lesson complete/i }).click();
      await expect(page.getByText(/lesson complete/i)).toBeVisible();

      await page.goto(`/lessons/${fixture.quizLessonId}`);
      await page.getByText(fixture.incorrectOptionText).click();
      await page.getByRole("button", { name: /submit quiz/i }).click();
      await expect(page.getByText(/didn.t pass/i)).toBeVisible();
      await expect(page.getByText(/score: 0%/i)).toBeVisible();
      await page.goto(`/courses/${fixture.courseId}`);
      await expect(
        page
          .locator("li.cursor-not-allowed")
          .filter({ hasText: `${fixture.prefix} Text Assignment Lesson` }),
      ).toBeVisible();

      await page.goto(`/lessons/${fixture.quizLessonId}`);
      const retakeButton = page.getByRole("button", { name: /retake quiz/i });
      if (await retakeButton.isVisible()) {
        await retakeButton.click();
      }
      await page.getByText(fixture.correctOptionText).click();
      await page.getByRole("button", { name: /submit quiz/i }).click();
      await expect(page.getByText(/^Passed$/)).toBeVisible();
      await page.goto(`/courses/${fixture.courseId}`);
      await expect(
        page
          .locator("a")
          .filter({ hasText: `${fixture.prefix} Text Assignment Lesson` }),
      ).toBeVisible();

      await page.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await page.getByLabel(/response/i).fill(`${fixture.prefix} first response`);
      await page.getByRole("button", { name: /^submit$/i }).click();
      await expect(page.getByText(/submitted, awaiting review/i)).toBeVisible();

      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await signIn(adminPage, fixture.admin.email, fixture.password);

      await adminPage.goto("/admin/submissions");
      const textSubmissionCard = adminPage
        .locator('[data-slot="card"]')
        .filter({ hasText: `${fixture.prefix} Text Assignment` })
        .first();
      await expect(textSubmissionCard).toBeVisible();
      await textSubmissionCard
        .getByPlaceholder(/note to learner/i)
        .fill(`${fixture.prefix} revise this response`);
      await textSubmissionCard
        .getByRole("button", { name: /request revision/i })
        .click();
      await expect(adminPage.getByText(/sent back with note/i)).toBeVisible();

      await page.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await expect(page.getByText(/^Needs revision$/).first()).toBeVisible();
      await expect(page.getByText(`${fixture.prefix} revise this response`).first()).toBeVisible();
      await page.getByLabel(/response/i).fill(`${fixture.prefix} revised response`);
      await page.getByRole("button", { name: /^submit$/i }).click();
      await expect(page.getByText(/submitted, awaiting review/i)).toBeVisible();

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
      await page.getByRole("button", { name: /^submit$/i }).click();
      await expect(page.getByText(/submitted, awaiting review/i)).toBeVisible();

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
      await expect(page.locator(".print-cert")).toContainText(
        `${fixture.prefix} Course`,
      );
      await page.evaluate(() => {
        window.print = () => window.sessionStorage.setItem("print-called", "1");
      });
      await page.getByRole("button", { name: /print \/ save pdf/i }).click();
      await expect
        .poll(() => page.evaluate(() => window.sessionStorage.getItem("print-called")))
        .toBe("1");

      const unassignedContext = await browser.newContext();
      const unassigned = await unassignedContext.newPage();
      await signIn(unassigned, fixture.unassigned.email, fixture.password);
      await expect(unassigned.getByText(/no training assigned yet/i)).toBeVisible();
      await unassigned.goto(`/courses/${fixture.courseId}`);
      await expect(unassigned.getByText(`${fixture.prefix} Course`)).toHaveCount(0);

      await adminContext.close();
      await unassignedContext.close();
    } finally {
      await cleanupWritePathFixture(admin, fixture);
    }
  });

  test("forgot-password form keeps enumeration-safe success copy", async ({
    page,
  }) => {
    const admin = writePathAdminClient();
    const email = `e2e-reset-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@bmh-institute.test`;

    try {
      await deleteRateLimitRows(admin, "email", email);
      await page.goto("/forgot-password");
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(
        page.getByText(/check your inbox for a reset link/i),
      ).toBeVisible();
    } finally {
      await deleteRateLimitRows(admin, "email", email);
    }
  });
});
