import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260729050000_hugo_verified_identity_and_orphan_delete_guard.sql",
  ),
  "utf8",
);

describe("Hugo verified identity and orphan deletion guard", () => {
  it("requires a matching confirmed Auth email before active access", () => {
    expect(migration).toContain("auth_user.email_confirmed_at is not null");
    expect(migration).toContain("identity_unverified");
    expect(migration).toContain(
      "public.fn_hugo_active_identity_is_unverified",
    );
  });

  it("persists a bound failure instead of claiming an Auth-only deletion", () => {
    expect(migration).toContain("public.fn_hugo_auth_identity_has_no_profile");
    expect(migration).toContain("identity_profile_missing");
    expect(migration).toContain("public.fn_hugo_store_guard_failure");
    expect(migration).toContain("public.fn_hugo_bound_operation_receipt");
  });

  it("reserves the canonical request before identity creation", () => {
    expect(migration).toContain("public.hugo_preflight_access_operation");
    expect(migration).toContain("hugo_access_operation_claims");
    expect(migration).toContain(
      "jsonb_build_object('proceed', true, 'request_hash', v_hash)",
    );
    expect(migration).toContain("identity_provision_in_progress");
  });

  it("keeps all new helpers private and public RPCs service-role-only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_active_identity_is_unverified[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_auth_identity_has_no_profile[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_apply_config_is_valid\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.hugo_delete_identity\(uuid, text\)[\s\S]*?to service_role;/,
    );
  });
});
