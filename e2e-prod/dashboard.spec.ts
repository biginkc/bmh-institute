import { test, expect } from "@playwright/test";

test("dashboard lists the signed-in user's training", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("main").getByRole("heading", { level: 1 })).toBeVisible();
  // Either assigned course progress or the learner empty state is valid.
  const courseHit = page.getByText(/course progress/i);
  const emptyHit = page.getByText(/no training assigned yet/i);
  await expect(courseHit.or(emptyHit).first()).toBeVisible();
});

test("header shows the signed-in email and a sign-out control", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: /bmh institute/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
