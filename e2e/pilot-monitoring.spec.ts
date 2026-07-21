import { expect, test } from "@playwright/test";

import {
  cleanupWritePathFixture,
  createWritePathFixture,
  writePathAdminClient,
  type WritePathFixture,
} from "./write-path-fixtures";
import { bootstrapTestSession } from "./session-bootstrap";

test.describe("pilot monitoring", () => {
  test.describe.configure({ timeout: 90_000 });

  test("shows pilot blockers, review actions, and export link", async ({ page }) => {
    const admin = writePathAdminClient();
    let fixture: WritePathFixture | null = null;

    try {
      fixture = await createWritePathFixture(admin);
      await admin
        .from("assignment_submissions")
        .insert({
          user_id: fixture.learner.id,
          lesson_id: fixture.textAssignmentLessonId,
          assignment_id: fixture.textAssignmentId,
          status: "submitted",
          submission_text: "Ready for review.",
        })
        .throwOnError();

      await bootstrapTestSession(page, {
        email: fixture.admin.email,
        password: fixture.password,
      });
      await page.goto("/admin/reports");

      await expect(page.getByRole("heading", { name: "Learner monitoring" })).toBeVisible();
      await expect(page.getByText("Needs access").first()).toBeVisible();
      await expect(page.getByText("Needs review").first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: /^export csv$/i }),
      ).toHaveAttribute("href", "/admin/reports/learners/export");

      const reviewRow = page
        .getByRole("row")
        .filter({ hasText: fixture.learner.email });
      await expect(reviewRow).toContainText("Needs review");
      await expect(
        reviewRow.getByRole("link", { name: /^review submissions$/i }),
      ).toHaveAttribute("href", "/admin/submissions");

      const blockedRow = page
        .getByRole("row")
        .filter({ hasText: fixture.unassigned.email });
      await expect(blockedRow).toContainText("Needs access");
      await expect(
        blockedRow.getByRole("link", { name: /^review access$/i }),
      ).toHaveAttribute("href", `/admin/users/${fixture.unassigned.id}/edit`);
    } finally {
      await cleanupWritePathFixture(admin, fixture);
    }
  });
});
