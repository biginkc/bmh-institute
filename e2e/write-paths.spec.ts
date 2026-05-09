import { expect, test, type Page } from "@playwright/test";

import {
  cleanupWritePathFixture,
  createWritePathFixture,
  deleteRateLimitRows,
  writePathAdminClient,
  type WritePathFixture,
} from "./write-path-fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function approveSubmission(
  page: Page,
  fixture: WritePathFixture,
  assignmentTitle: string,
) {
  await page.goto("/admin/submissions");
  const card = page
    .locator('[data-slot="card"]')
    .filter({ hasText: assignmentTitle })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^approve$/i }).click();
  await expect(page.getByText(/approved/i)).toBeVisible();
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

test.describe("durable write-path coverage", () => {
  test.describe.configure({ timeout: 120_000 });

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
      await page.getByText(fixture.correctOptionText).click();
      await page.getByRole("button", { name: /submit quiz/i }).click();
      await expect(page.getByText(/^Passed$/)).toBeVisible();

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

      await approveSubmission(adminPage, fixture, `${fixture.prefix} Text Assignment`);

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

      await approveSubmission(adminPage, fixture, `${fixture.prefix} File Assignment`);
      await expect
        .poll(() => hasCourseAndProgramCertificates(admin, fixture!), {
          timeout: 20_000,
        })
        .toBe(true);

      await page.goto("/certificates");
      await expect(page.getByText(`${fixture.prefix} Course`)).toBeVisible();
      await expect(page.getByText(`${fixture.prefix} Program`)).toBeVisible();

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
