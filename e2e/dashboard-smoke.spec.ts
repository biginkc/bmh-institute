// TPAR-02: smoke spec proving the local-dev e2e harness is wired. Mirrors
// e2e-prod/dashboard.spec.ts but runs against the dev server on :3200.
// Inherits storage state from e2e/auth.setup.ts via the chromium project's
// `dependencies: ["setup"]` declaration in playwright.config.ts.
import { test, expect } from "@playwright/test";

test("dashboard renders for the authenticated test user", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: /your training/i }),
  ).toBeVisible();
});
