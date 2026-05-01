// TPAR-02: shared helpers for local-dev e2e specs. Runs OUT OF BAND from
// Playwright's browser context. Path A scope (Plan 2): exposes only
// adminClient + ensureTestUser + prod-ref guard. Write-path helpers for
// the destructive Phase 01 HUMAN-UAT items (HARDEN-02 invite-expiry,
// HARDEN-03 deleted-user re-auth via UI) require Jarrad's lock on Path B
// (Supabase ephemeral branches) or Path C (prod-with-prefix-cleanup).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TEST_USER_EMAIL = "claude@test.com";
export const TEST_USER_PASSWORD = "test12345";

export function adminClient(): SupabaseClient {
  const url =
    process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!url || !key) {
    throw new Error(
      "E2E fixtures need TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }
  // BMH Institute has ONE Supabase project, the prod project
  // (dhvfsyteqsxagokoerrx). Refusing to construct an admin client against
  // it prevents specs from trashing prod data.
  if (url.includes("dhvfsyteqsxagokoerrx")) {
    throw new Error(
      "E2E fixtures refusing to run against the prod project (dhvfsyteqsxagokoerrx). Point TEST_SUPABASE_URL at a non-prod project.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Ensure the well-known test user exists and can sign in with the shared
 * password. Idempotent: returns the existing user id if already present,
 * otherwise creates and confirms the user.
 */
export async function ensureTestUser(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === TEST_USER_EMAIL);
  if (existing) return existing.id;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw createErr ?? new Error("Failed to create test user");
  }
  return created.user.id;
}
