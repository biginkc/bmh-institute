import { expect, test } from "@playwright/test";

import {
  cleanupWritePathFixture,
  createWritePathFixture,
  writePathAdminClient,
  type WritePathFixture,
} from "./write-path-fixtures";
import { bootstrapTestSession } from "./session-bootstrap";

test.describe("learner onboarding", () => {
  test.describe.configure({ timeout: 90_000 });

  test("shows the first learner action and Hugo-managed profile path", async ({ page }) => {
    const admin = writePathAdminClient();
    let fixture: WritePathFixture | null = null;

    try {
      fixture = await createWritePathFixture(admin);

      await bootstrapTestSession(page, {
        email: fixture.learner.email,
        password: fixture.password,
      });

      await expect(page.getByText("In progress")).toBeVisible();
      await expect(page.getByText(`${fixture.prefix} Content Lesson`).first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: /^resume$/i }),
      ).toHaveAttribute("href", `/lessons/${fixture.contentLessonId}?part=quiz`);
      await expect(page.getByText("3 lessons · 0 complete")).toBeVisible();
      await expect(page.getByRole("link", { name: /^profile$/i })).toHaveAttribute(
        "href",
        "/profile",
      );
      await page.getByRole("link", { name: /^profile$/i }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(
        page.getByText(/hugo manages your sign-in and password/i),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /forgot|reset|set password/i }),
      ).toHaveCount(0);
    } finally {
      await cleanupWritePathFixture(admin, fixture);
    }
  });
});
