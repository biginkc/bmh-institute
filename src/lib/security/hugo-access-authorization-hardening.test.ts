import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260728230000_hugo_access_authorization_hardening.sql",
  ),
  "utf8",
);

describe("Hugo access authorization hardening", () => {
  it("adds a dormant, audited, service-role-only strict cutover", () => {
    expect(migration).toContain("create table public.hugo_access_settings");
    expect(migration).toContain("enforce_grants boolean not null default false");
    expect(migration).toContain("create table public.hugo_access_enforcement_changes");
    expect(migration).toContain("public.hugo_set_access_enforcement");
    expect(migration).toContain("Hugo grant backfill is incomplete");
    expect(migration).toMatch(
      /revoke all on function public\.hugo_set_access_enforcement[\s\S]*grant execute on function public\.hugo_set_access_enforcement[\s\S]*to service_role;/,
    );
  });

  it("installs one restrictive active-access gate on every current RLS table", () => {
    expect(migration).toContain("as restrictive");
    expect(migration).toContain("hugo_active_authenticated_gate");
    expect(migration).toContain("public.fn_hugo_access_is_active(auth.uid())");
    expect(migration).toContain("where namespace.nspname = 'public'");
    expect(migration).toContain(
      "hugo_active_authenticated_gate on storage.objects",
    );
  });

  it("guards direct, concurrent, and truncate removal of usable owner grants", () => {
    expect(migration).toContain("fn_hugo_prevent_last_usable_owner_grant");
    expect(migration).toContain(
      "hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)",
    );
    expect(migration).toContain("before delete or update of");
    expect(migration).toContain("before truncate on public.hugo_access_grants");
    expect(migration).toContain("from pg_catalog.pg_locks held_lock");
    expect(migration).toContain(
      "Hugo owner grants must be changed through a lifecycle RPC.",
    );
    expect(migration).toContain("Cannot remove the final usable Institute owner grant.");
  });

  it("treats sign-in and every non-entitlement profile reference as durable", () => {
    expect(migration).toContain("from auth.users auth_user");
    expect(migration).toContain("last_sign_in_at is not null");
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("user_role_groups.user_id");
    expect(migration).toContain("hugo_access_grants.user_id");
    expect(migration).toContain("fn_hugo_profile_reference_inventory");
  });
});
