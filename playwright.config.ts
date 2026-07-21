import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { assertCanonicalSupabaseProjectUrl } from "./src/lib/supabase/canonical-project-url";

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

const INSTITUTE_TEST_PROJECT_REF = "jvaabkchkihkjllehmft";
const CLOSER_TEST_PROJECT_REF = "moocmsisaopnznppqvsq";

const supabaseUrl = env.TEST_SUPABASE_URL ?? process.env.TEST_SUPABASE_URL ?? "";
const supabaseAnonKey =
  env.TEST_SUPABASE_ANON_KEY ?? process.env.TEST_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey =
  env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "";
const closerSupabaseUrl =
  env.CLOSER_TEST_SUPABASE_URL ?? process.env.CLOSER_TEST_SUPABASE_URL ?? "";
const closerSupabaseAnonKey =
  env.CLOSER_TEST_SUPABASE_ANON_KEY ??
  process.env.CLOSER_TEST_SUPABASE_ANON_KEY ??
  "";
const closerSupabaseServiceRoleKey =
  env.CLOSER_TEST_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.CLOSER_TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "";
const rolePlayEmbedSigningSecret =
  env.ROLE_PLAY_EMBED_SIGNING_SECRET ??
  process.env.ROLE_PLAY_EMBED_SIGNING_SECRET ??
  "";
const rolePlayCompletionVerifySecret =
  env.ROLE_PLAY_COMPLETION_VERIFY_SECRET ??
  process.env.ROLE_PLAY_COMPLETION_VERIFY_SECRET ??
  "";
const rolePlayBaseUrl =
  env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL ??
  process.env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL ??
  "http://localhost:3458";

function assertCredentialTarget(
  label: string,
  url: string,
  keys: readonly string[],
  expectedProjectRef: string,
): void {
  if (!url && keys.every((key) => !key)) return;
  try {
    assertCanonicalSupabaseProjectUrl(url, [expectedProjectRef]);
  } catch {
    throw new Error(
      `${label} credentials require exact test origin https://${expectedProjectRef}.supabase.co.`,
    );
  }
}

// Fail during config loading, before either service-role key is copied into
// the dev server environment or made available to a seeded browser spec.
assertCredentialTarget(
  "Institute E2E",
  supabaseUrl,
  [supabaseAnonKey, supabaseServiceRoleKey],
  INSTITUTE_TEST_PROJECT_REF,
);
assertCredentialTarget(
  "Closer cross-app E2E",
  closerSupabaseUrl,
  [closerSupabaseAnonKey, closerSupabaseServiceRoleKey],
  CLOSER_TEST_PROJECT_REF,
);

process.env.TEST_SUPABASE_URL = supabaseUrl;
process.env.TEST_SUPABASE_ANON_KEY = supabaseAnonKey;
process.env.TEST_SUPABASE_SERVICE_ROLE_KEY = supabaseServiceRoleKey;
process.env.CLOSER_TEST_SUPABASE_URL = closerSupabaseUrl;
process.env.CLOSER_TEST_SUPABASE_ANON_KEY = closerSupabaseAnonKey;
process.env.CLOSER_TEST_SUPABASE_SERVICE_ROLE_KEY = closerSupabaseServiceRoleKey;
process.env.ROLE_PLAY_EMBED_SIGNING_SECRET = rolePlayEmbedSigningSecret;
process.env.ROLE_PLAY_COMPLETION_VERIFY_SECRET = rolePlayCompletionVerifySecret;
process.env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL = rolePlayBaseUrl;

const webServerEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
  ADMIN_EMAILS: "claude@test.com,jarrad@bmhgroupkc.com",
  NODE_ENV: "development",
  ROLE_PLAY_EMBED_SIGNING_SECRET: rolePlayEmbedSigningSecret,
  ROLE_PLAY_COMPLETION_VERIFY_SECRET: rolePlayCompletionVerifySecret,
  NEXT_PUBLIC_ROLE_PLAY_BASE_URL: rolePlayBaseUrl,
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
    // Auth setup creates a test-project session out of band. Trace archives can
    // retain cookies, so the seeded suite must never create an auth trace.
    trace: "off",
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
        permissions: ["microphone", "camera"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
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
