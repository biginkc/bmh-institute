import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import {
  CREDENTIAL_SAFE_PLAYWRIGHT_USE,
} from "./src/lib/testing/credential-artifact-policy";
import { requireInstituteProductionBaseUrl } from "./src/lib/testing/production-base-url";

/**
 * Playwright config for smoke-testing the live bmh-institute deployment.
 *
 * Use: `npm run test:prod` — always proves the public Hugo-only boundary.
 * Read-only authenticated specs run only when E2E_HUGO_STORAGE_STATE points
 * to a user-supplied state artifact captured after a real Hugo login.
 *
 * This is how Claude verifies post-deploy without bouncing screenshots
 * back to Jarrad. Keep specs read-only to avoid polluting production
 * data. For write coverage we'd need a separate bmh-institute-test
 * Supabase project.
 */

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

const baseURL = requireInstituteProductionBaseUrl(
  process.env.E2E_PROD_BASE_URL ??
  env.E2E_PROD_BASE_URL,
);

process.env.E2E_PROD_BASE_URL = baseURL;
const suppliedStorageState =
  process.env.E2E_HUGO_STORAGE_STATE ?? env.E2E_HUGO_STORAGE_STATE ?? "";
const storageStatePath = suppliedStorageState
  ? path.resolve(__dirname, suppliedStorageState)
  : "";
if (storageStatePath && !fs.existsSync(storageStatePath)) {
  throw new Error(
    `E2E_HUGO_STORAGE_STATE does not exist: ${storageStatePath}`,
  );
}
process.env.E2E_HUGO_STORAGE_STATE = storageStatePath;

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
    ...CREDENTIAL_SAFE_PLAYWRIGHT_USE,
  },
  projects: [
    {
      name: "public-auth",
      testMatch: /\/(?:hugo-auth-surface|admin-route-guard-learner)\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "authenticated-chromium",
      testMatch: /\/(?:admin|dashboard|shell-navigation)\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageStatePath || { cookies: [], origins: [] },
      },
    },
  ],
});
