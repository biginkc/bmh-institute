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
      /hugo-institute-user-lifecycle:[\s\S]*?legacy_20260730[\s\S]*?return v_receipt/i,
    );
    expect(migration).not.toContain("pg_get_functiondef");
    expect(migration).toContain("rename to hugo_apply_access_unhashed_legacy_20260730");
  });

  it("reactivation snapshots the locked Institute role and memberships", () => {
    expect(migration).toContain("v_grant_status = 'suspended'");
    expect(migration).toContain("v_effective_role := v_current_role");
    expect(migration).toContain("from public.user_role_groups");
    expect(migration).toContain("role_group_ids");
  });

  it("revokes access without deleting Institute-owned role or memberships", () => {
    expect(migration).toContain(
      "Terminal revocation denies Hugo access but does not delete Institute's",
    );
    expect(migration).toContain("delete from public.user_role_groups");
    expect(migration).toContain("from unnest(v_current_groups)");
  });
});
