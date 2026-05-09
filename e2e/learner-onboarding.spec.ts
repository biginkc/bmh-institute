import { expect, test, type Page } from "@playwright/test";

import {
  cleanupWritePathFixture,
  createWritePathFixture,
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

test.describe("learner onboarding", () => {
  test.describe.configure({ timeout: 90_000 });

  test("shows the first learner action and recovery paths", async ({ page }) => {
    const admin = writePathAdminClient();
    let fixture: WritePathFixture | null = null;

    try {
      fixture = await createWritePathFixture(admin);

      await signIn(page, fixture.learner.email, fixture.password);

      await expect(page.getByText("First step")).toBeVisible();
      await expect(page.getByText(`${fixture.prefix} Content Lesson`)).toBeVisible();
      await expect(
        page.getByRole("link", { name: /^start next lesson$/i }),
      ).toHaveAttribute("href", `/lessons/${fixture.contentLessonId}`);
      await expect(page.getByText("Complete required lessons")).toBeVisible();
      await expect(page.getByRole("link", { name: /^profile$/i })).toHaveAttribute(
        "href",
        "/profile",
      );
      await expect(
        page.getByRole("link", { name: /^password help$/i }),
      ).toHaveAttribute("href", "/forgot-password");
    } finally {
      await cleanupWritePathFixture(admin, fixture);
    }
  });
});
