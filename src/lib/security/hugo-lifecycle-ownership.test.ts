import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260730200000_hugo_institute_lifecycle_contract.sql"),
  "utf8",
);

describe("Hugo and Institute lifecycle ownership contract", () => {
  it("takes the per-user lock before profile and grant row locks", () => {
    expect(migration).toContain("hugo-institute-user-lifecycle:");
    expect(migration).toMatch(
      /hugo-institute-user-lifecycle:[\s\S]*?select \* into v_profile[\s\S]*?for update[\s\S]*?select \* into v_grant[\s\S]*?for update/i,
    );
    expect(migration).toContain("v_grant_found := found");
  });

  it("reactivation snapshots the locked Institute role and memberships", () => {
    expect(migration).toContain("v_grant_found boolean");
    expect(migration).toContain("v_grant_found\n     and v_grant.desired_status = 'suspended'");
    expect(migration).toContain("v_role := v_current_role");
    expect(migration).toContain("from public.user_role_groups");
    expect(migration).toContain("role_group_ids");
  });

  it("revokes access without deleting Institute-owned role or memberships", () => {
    const revoke = migration.match(
      /v_new := \$new\$\n\s+-- Institute retains role and memberships[\s\S]*?\$new\$/i,
    )?.[0];
    expect(revoke).toBeDefined();
    expect(revoke).not.toContain("delete from public.user_role_groups");
    expect(revoke).toContain("revoked grant and suspended profile");
  });
});
