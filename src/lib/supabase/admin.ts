import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Service-role Supabase client — bypasses RLS and unlocks auth.admin.*
 * methods (createUser, listUsers, deleteUser) used for team
 * management and trigger-equivalent server-side operations.
 *
 * NEVER return this from a server component rendered for an untrusted
 * user. Only call from server actions that have already verified the
 * caller is an admin, or from cron/webhook contexts with no user session.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
