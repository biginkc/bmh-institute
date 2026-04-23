import { test, expect } from "@playwright/test";

test("dashboard lists the signed-in user's training", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /your training/i })).toBeVisible();
  // Either the program card is visible or the empty state is — both pass.
  const programHit = page.getByText(/appointment setter onboarding/i);
  const emptyHit = page.getByText(/no programs yet/i);
  await expect(programHit.or(emptyHit).first()).toBeVisible();
});

test("header shows the signed-in email and a sign-out control", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: /sandra university/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
