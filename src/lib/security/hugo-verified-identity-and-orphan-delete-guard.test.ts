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

  it("persists a bound failure instead of claiming an ambiguous deletion", () => {
    expect(migration).toContain("public.fn_hugo_identity_cardinality_state");
    expect(migration).toContain("identity_profile_missing");
    expect(migration).toContain("ambiguous_identity");
    expect(migration).toContain(
      "Institute identity deletion left matching Auth or profile state.",
    );
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
    expect(migration).toContain(
      "operation_superseded_by_access_reduction",
    );
    expect(migration).toContain(
      "when p_status in ('suspended', 'revoked')",
    );
  });

  it("binds invalid requests and filters unsafe group state on access reduction", () => {
    expect(migration).toMatch(
      /p_status = 'active'[\s\S]*fn_hugo_apply_config_is_valid\(v_effective_config\)/,
    );
    expect(migration).toContain(
      "then public.fn_hugo_existing_apply_config(v_config)",
    );
    expect(migration).toContain(
      "from public.role_groups role_group",
    );
    expect(migration).toContain(
      "'The Institute access request is invalid.'",
    );
  });

  it("restores valid groups for minimal and stale-payload reactivation only", () => {
    expect(migration).toContain(
      "public.fn_hugo_reactivation_apply_config",
    );
    expect(migration).toMatch(
      /v_effective_config := case[\s\S]*then public\.fn_hugo_reactivation_apply_config\(p_config, v_email\)/,
    );
    expect(migration).toMatch(
      /p_status = 'active'[\s\S]*fn_hugo_apply_config_is_valid\(v_effective_config\)/,
    );
    expect(migration).toContain(
      "grant_row.desired_status = 'suspended'",
    );
    expect(migration).toMatch(
      /if public\.fn_hugo_apply_config_is_valid\(v_config\)[\s\S]*return public\.fn_hugo_existing_apply_config\(v_suspended_config\)/,
    );
    expect(migration).toContain(
      "public.fn_hugo_reactivation_access_expires_at",
    );
    expect(migration).toMatch(
      /v_effective_access_expires_at := case[\s\S]*v_effective_access_expires_at,[\s\S]*p_app_user_id/,
    );
  });

  it("serializes deletes and denies application-role truncation without a truncate trigger", () => {
    expect(migration).toContain(
      "public.fn_hugo_serialize_role_group_delete",
    );
    expect(migration).toMatch(
      /before delete[\s\S]*on public\.role_groups[\s\S]*for each statement/i,
    );
    expect(migration).not.toContain("before delete or truncate");
    expect(migration).toMatch(
      /revoke truncate[\s\S]*on public\.role_groups[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(migration).toContain(
      "hugo-institute-grant-mutation-rpc-v1",
    );
  });

  it("keeps all new helpers private and public RPCs service-role-only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_active_identity_is_unverified[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_identity_cardinality_state[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_apply_config_is_valid\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_existing_apply_config\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_reactivation_apply_config\(jsonb, text\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_reactivation_access_expires_at\([\s\S]*?text, timestamptz[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_hugo_serialize_role_group_delete\(\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.hugo_delete_identity\(uuid, text\)[\s\S]*?to service_role;/,
    );
  });
});
