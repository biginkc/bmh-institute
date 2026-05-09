import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

function loadEnvFile(filename: string): Record<string, string> {
  const filepath = path.resolve(__dirname, filename);
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

const env = {
  ...loadEnvFile(".env.local"),
  ...loadEnvFile(".env.test.local"),
};

const baseURL =
  process.env.E2E_PROD_BASE_URL ??
  env.E2E_PROD_BASE_URL ??
  "https://bmh-institute.vercel.app";

process.env.E2E_PROD_BASE_URL = baseURL;
process.env.TEST_SUPABASE_URL =
  process.env.TEST_SUPABASE_URL ??
  process.env.PROD_SUPABASE_URL ??
  env.PROD_SUPABASE_URL ??
  env.TEST_SUPABASE_URL ??
  env.NEXT_PUBLIC_SUPABASE_URL ??
  "";
process.env.TEST_SUPABASE_ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ??
  process.env.PROD_SUPABASE_ANON_KEY ??
  env.PROD_SUPABASE_ANON_KEY ??
  env.TEST_SUPABASE_ANON_KEY ??
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
process.env.TEST_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.PROD_SUPABASE_SERVICE_ROLE_KEY ??
  env.PROD_SUPABASE_SERVICE_ROLE_KEY ??
  env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  env.SUPABASE_SERVICE_ROLE_KEY ??
  "";
process.env.PROD_READINESS_TEST_PASSWORD =
  process.env.PROD_READINESS_TEST_PASSWORD ??
  env.PROD_READINESS_TEST_PASSWORD ??
  "";
process.env.PROD_READINESS_EMAIL_INBOX =
  process.env.PROD_READINESS_EMAIL_INBOX ??
  env.PROD_READINESS_EMAIL_INBOX ??
  "";

export default defineConfig({
  testDir: "./e2e-prod",
  testMatch: /production-readiness\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
