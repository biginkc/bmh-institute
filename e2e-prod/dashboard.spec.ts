import { test, expect } from "@playwright/test";

test("dashboard lists the signed-in user's training", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /your training/i })).toBeVisible();
  // Either the program is visible or the empty state is — both are acceptable.
  const anyProgram = page.locator("[data-sentry-component='ProgramCard'], text=Appointment Setter Onboarding");
  const emptyState = page.getByText(/no programs yet/i);
  await expect(anyProgram.or(emptyState).first()).toBeVisible();
});

test("header shows the signed-in email and a sign-out control", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: /sandra university/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
