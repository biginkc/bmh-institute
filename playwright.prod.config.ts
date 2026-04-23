import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for smoke-testing the live sandra-university deployment.
 *
 * Use: `npm run test:prod` — reads creds from `.env.test.local`, logs into
 * the real production URL, saves auth state, then runs read-only specs
 * against the authenticated surface (dashboard, admin pages).
 *
 * This is how Claude verifies post-deploy without bouncing screenshots
 * back to Jarrad. Keep specs read-only to avoid polluting production
 * data. For write coverage we'd need a separate sandra-university-test
 * Supabase project.
 */

function loadTestEnv(): Record<string, string> {
  const filepath = path.resolve(__dirname, ".env.test.local");
  if (!fs.existsSync(filepath)) return {};
  const raw = fs.readFileSync(filepath, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = loadTestEnv();

const baseURL =
  env.E2E_PROD_BASE_URL ??
  process.env.E2E_PROD_BASE_URL ??
  "https://sandra-university.vercel.app";

// Publish for the setup project so it can read creds.
process.env.E2E_TEST_EMAIL = env.E2E_TEST_EMAIL ?? process.env.E2E_TEST_EMAIL ?? "";
process.env.E2E_TEST_PASSWORD =
  env.E2E_TEST_PASSWORD ?? process.env.E2E_TEST_PASSWORD ?? "";
process.env.E2E_PROD_BASE_URL = baseURL;

export default defineConfig({
  testDir: "./e2e-prod",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e-prod/.auth/state.json",
      },
      dependencies: ["setup"],
    },
  ],
});
