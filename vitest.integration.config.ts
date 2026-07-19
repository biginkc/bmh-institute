import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

import {
  assertIntegrationTestEnvironment,
  verifyIntegrationTestKeys,
} from "./src/lib/testing/integration-environment";

/**
 * Integration suite — hits a real Supabase Postgres so coverage includes
 * RLS, Realtime publications, pg_* extensions, and SECURITY DEFINER
 * functions. Runs only via `npm run test:integration`, not on the
 * pre-commit hook (too slow, requires network + creds).
 *
 * Env is loaded from `.env.test.local` via a minimal parser so we don't
 * pull in `dotenv` just for this. Populate that file with a dedicated
 * test project's keys before running.
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
const testSupabaseUrl =
  process.env.TEST_SUPABASE_URL ?? env.TEST_SUPABASE_URL ?? "";
const testSupabaseAnonKey =
  process.env.TEST_SUPABASE_ANON_KEY ?? env.TEST_SUPABASE_ANON_KEY ?? "";
const testSupabaseServiceRoleKey =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "";
const testSupabaseDatabaseUrl =
  process.env.TEST_SUPABASE_DB_URL ?? env.TEST_SUPABASE_DB_URL ?? "";

// Fail during config loading, before Vitest can expose a service-role key to
// destructive server-action tests under the application's normal env names.
const guardedIntegrationEnvironment = {
  TEST_SUPABASE_URL: testSupabaseUrl,
  TEST_SUPABASE_ANON_KEY: testSupabaseAnonKey,
  TEST_SUPABASE_SERVICE_ROLE_KEY: testSupabaseServiceRoleKey,
  TEST_SUPABASE_DB_URL: testSupabaseDatabaseUrl,
};
assertIntegrationTestEnvironment(guardedIntegrationEnvironment);

export default defineConfig(async () => {
  await verifyIntegrationTestKeys(guardedIntegrationEnvironment);
  return {
    test: {
      include: ["src/**/*.integration.test.ts"],
      environment: "node",
      reporters: ["default"],
      // Real DB calls — 30s per test covers a reset + a few inserts + a query with headroom.
      testTimeout: 30000,
      // Sequential — tests TRUNCATE shared tables in beforeEach; parallel would race.
      fileParallelism: false,
      env: {
        TEST_SUPABASE_URL: testSupabaseUrl,
        TEST_SUPABASE_ANON_KEY: testSupabaseAnonKey,
        TEST_SUPABASE_SERVICE_ROLE_KEY: testSupabaseServiceRoleKey,
        TEST_SUPABASE_DB_URL: testSupabaseDatabaseUrl,
        // Server actions exercise the application's normal environment contract.
        // Bind those names to the same guarded TEST_* target so an integration
        // run cannot fall through to a developer's production env.
        NEXT_PUBLIC_SUPABASE_URL: testSupabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: testSupabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: testSupabaseServiceRoleKey,
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@tests": path.resolve(__dirname, "./tests"),
      },
    },
  };
});
