// TPAR-02: one-time login that writes storage state to e2e/.auth/user.json.
// Every chromium-project spec inherits this state via dependencies: ["setup"]
// in playwright.config.ts. Selectors mirror e2e-prod/auth.setup.ts (the BMH
// /login form already proven against the live deployment).
import { test as setup } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

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
  await page.getByRole("button", { name: /continue with hugo/i }).waitFor();
  await page.getByLabel(/email/i).waitFor({ state: "detached" });
  await page.getByLabel(/password/i).waitFor({ state: "detached" });

  const url = process.env.TEST_SUPABASE_URL ?? "";
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    throw new Error("E2E auth setup requires the non-production test project.");
  }

  const authCookies = new Map<string, string>();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () =>
        [...authCookies].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) authCookies.set(name, value);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (error) throw error;

  await page.context().addCookies(
    [...authCookies].map(([name, value]) => ({
      name,
      value,
      url: "http://localhost:3200",
    })),
  );

  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
