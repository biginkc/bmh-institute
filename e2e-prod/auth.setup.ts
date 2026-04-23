import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const STORAGE_STATE = path.resolve(__dirname, ".auth/state.json");

setup("authenticate via the live /login form", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.test.local before running test:prod.",
    );
  }

  await page.goto("/login");
  // shadcn CardTitle renders as a <div>, not <h>. Match by data-slot + text.
  await expect(
    page.locator('[data-slot="card-title"]', { hasText: /sign in/i }),
  ).toBeVisible();

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // Supabase redirects into the app; wait for a dashboard surface.
  await page.waitForURL(/\/(dashboard|auth\/set-password)/, { timeout: 20_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
