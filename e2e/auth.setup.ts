// TPAR-02: one-time test-project session bootstrap that writes storage state
// to e2e/.auth/user.json.
// Every chromium-project spec inherits this state via dependencies: ["setup"]
// in playwright.config.ts. The setup first proves the login page is Hugo-only,
// then creates a nonproduction session without using product password UI.
import { test as setup } from "@playwright/test";
import {
  adminClient,
  ensureTestUser,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from "./fixtures";
import { bootstrapTestSession, expectHugoOnlyLogin } from "./session-bootstrap";

const AUTH_FILE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const admin = adminClient();
  await ensureTestUser(admin);

  await expectHugoOnlyLogin(page);
  await bootstrapTestSession(page, {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  await page.context().storageState({ path: AUTH_FILE });
});
