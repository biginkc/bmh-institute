import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the BMH Institute E2E safety net.
 *
 * Tests run against a dedicated Supabase test project (populate
 * `.env.test.local` with its keys) and boot the real Next dev server
 * on a dedicated port so the browser exercises the full stack.
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

const supabaseUrl = env.TEST_SUPABASE_URL ?? process.env.TEST_SUPABASE_URL ?? "";
const supabaseAnonKey =
  env.TEST_SUPABASE_ANON_KEY ?? process.env.TEST_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey =
  env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "";

process.env.TEST_SUPABASE_URL = supabaseUrl;
process.env.TEST_SUPABASE_ANON_KEY = supabaseAnonKey;
process.env.TEST_SUPABASE_SERVICE_ROLE_KEY = supabaseServiceRoleKey;

const webServerEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
  ADMIN_EMAILS: "claude@test.com,jarrad@bmhgroup.com",
  NODE_ENV: "development",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://localhost:3200",
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
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npx next dev -p 3200",
    url: "http://localhost:3200/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: webServerEnv,
  },
});
