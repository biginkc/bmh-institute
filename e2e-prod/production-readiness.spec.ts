import { expect, test, type Page } from "@playwright/test";
import {
  cleanupProductionReadinessFixture,
  createProductionReadinessFixture,
  productionAdminClient,
  type ProductionReadinessFixture,
} from "./production-fixtures";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("production readiness lifecycle", () => {
  test("validates real production auth, DB writes, storage, review, certificates, and cleanup", async ({
    browser,
  }) => {
    const admin = productionAdminClient();
    let fixture: ProductionReadinessFixture | null = null;

    try {
      fixture = await createProductionReadinessFixture(admin);

      const learnerContext = await browser.newContext();
      const learner = await learnerContext.newPage();
      await signIn(learner, fixture.learner.email, fixture.password);

      await expect(
        learner.getByText(`${fixture.prefix} Program`),
      ).toBeVisible();
      await learner.goto(`/courses/${fixture.courseId}`);
      await expect(
        learner.getByRole("heading", { name: `${fixture.prefix} Course` }),
      ).toBeVisible();

      await learner.getByRole("link", { name: new RegExp(`${fixture.prefix} Content Lesson`) }).click();
      await expect(
        learner.getByRole("heading", { name: `${fixture.prefix} Content Lesson` }),
      ).toBeVisible();
      await learner.getByRole("button", { name: /mark lesson complete/i }).click();
      await expect(learner.getByText(/lesson complete/i)).toBeVisible();

      await learner.goto(`/lessons/${fixture.quizLessonId}`);
      await learner.getByText(fixture.correctOptionText).click();
      await learner.getByRole("button", { name: /submit quiz/i }).click();
      await expect(learner.getByText(/^Passed$/)).toBeVisible();

      await learner.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await learner.getByLabel(/response/i).fill(`${fixture.prefix} first response`);
      await learner.getByRole("button", { name: /^submit$/i }).click();
      await expect(
        learner.getByText(/submitted, awaiting review/i),
      ).toBeVisible();

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

      await learner.goto(`/lessons/${fixture.textAssignmentLessonId}`);
      await expect(
        learner.locator("div", { hasText: /^Needs revision$/ }).first(),
      ).toBeVisible();
      await learner.getByLabel(/response/i).fill(`${fixture.prefix} revised response`);
      await learner.getByRole("button", { name: /^submit$/i }).click();
      await expect(
        learner.getByText(/submitted, awaiting review/i),
      ).toBeVisible();

      await adminPage.goto("/admin/submissions");
      const revisedTextSubmissionCard = adminPage
        .locator('[data-slot="card"]')
        .filter({ hasText: `${fixture.prefix} Text Assignment` })
        .first();
      await expect(revisedTextSubmissionCard).toBeVisible();
      await revisedTextSubmissionCard
        .getByRole("button", { name: /^approve$/i })
        .click();
      await expect(adminPage.getByText(/approved/i)).toBeVisible();

      await learner.goto(`/lessons/${fixture.fileAssignmentLessonId}`);
      await learner
        .locator('input[type="file"]')
        .setInputFiles({
          name: "production-readiness-upload.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(`${fixture.prefix} production readiness upload`),
        });
      await expect(
        learner.getByText(/selected: production-readiness-upload.txt/i),
      ).toBeVisible();
      await learner.getByRole("button", { name: /^submit$/i }).click();
      await expect(
        learner.getByText(/submitted, awaiting review/i),
      ).toBeVisible();

      const uploadedPath = await findUploadedSubmissionPath(admin, fixture);
      expect(uploadedPath).toMatch(new RegExp(`^${fixture.learner.id}/`));
      const signed = await admin.storage
        .from("submissions")
        .createSignedUrl(uploadedPath, 60);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toContain("/storage/v1/object/sign/submissions/");

      await adminPage.goto("/admin/submissions");
      const fileSubmissionCard = adminPage
        .locator('[data-slot="card"]')
        .filter({ hasText: `${fixture.prefix} File Assignment` })
        .first();
      await expect(fileSubmissionCard).toBeVisible();
      await fileSubmissionCard
        .getByRole("button", { name: /^approve$/i })
        .click();
      await expect(adminPage.getByText(/approved/i)).toBeVisible();

      await expect
        .poll(() => hasCourseAndProgramCertificates(admin, fixture!), {
          timeout: 20_000,
        })
        .toBe(true);

      await learner.goto("/certificates");
      await expect(learner.getByText(`${fixture.prefix} Course`)).toBeVisible();
      await expect(learner.getByText(`${fixture.prefix} Program`)).toBeVisible();
      await learner.getByRole("link", { name: /view & print/i }).first().click();
      await expect(learner).toHaveURL(/\/certificates\/(course|program)\//);
      await expect(
        learner.getByRole("button", { name: /print \/ save pdf/i }),
      ).toBeVisible();

      const unassignedContext = await browser.newContext();
      const unassigned = await unassignedContext.newPage();
      await signIn(unassigned, fixture.unassigned.email, fixture.password);
      await expect(unassigned.getByText(/no training assigned yet/i)).toBeVisible();
      await unassigned.goto("/admin");
      await expect(unassigned).not.toHaveURL(/\/admin$/);
      await unassigned.goto(`/courses/${fixture.courseId}`);
      await expect(unassigned.getByText(`${fixture.prefix} Course`)).toHaveCount(0);

      await learnerContext.close();
      await adminContext.close();
      await unassignedContext.close();
    } finally {
      await cleanupProductionReadinessFixture(admin, fixture);
    }
  });
});

async function findUploadedSubmissionPath(
  admin: ReturnType<typeof productionAdminClient>,
  fixture: ProductionReadinessFixture,
): Promise<string> {
  const { data, error } = await admin
    .from("assignment_submissions")
    .select("submission_file_path")
    .eq("lesson_id", fixture.fileAssignmentLessonId)
    .eq("user_id", fixture.learner.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.submission_file_path) {
    throw error ?? new Error("File submission path was not recorded.");
  }
  return data.submission_file_path as string;
}

async function hasCourseAndProgramCertificates(
  admin: ReturnType<typeof productionAdminClient>,
  fixture: ProductionReadinessFixture,
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

test.describe("production readiness email links", () => {
  test("documents the current blocker for invite and reset-link validation", async () => {
    test.skip(
      !process.env.PROD_READINESS_EMAIL_INBOX,
      "PROD_READINESS_EMAIL_INBOX is required before real invite and password-reset link retrieval can be automated.",
    );
  });
});
