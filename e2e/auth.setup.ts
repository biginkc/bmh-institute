// TPAR-02: one-time login that writes storage state to e2e/.auth/user.json.
// Every chromium-project spec inherits this state via dependencies: ["setup"]
// in playwright.config.ts. Selectors mirror e2e-prod/auth.setup.ts (the BMH
// /login form already proven against the live deployment).
import { test as setup } from "@playwright/test";

import {
  adminClient,
  ensureTestUser,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from "./fixtures";

const AUTH_FILE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const admin = adminClient();
  await ensureTestUser(admin);

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await page.waitForURL(/\/(dashboard|auth\/set-password)/, { timeout: 20_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
