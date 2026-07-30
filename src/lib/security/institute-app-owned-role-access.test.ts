import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729205000_institute_app_owned_role_access.sql",
  ),
  "utf8",
);
const authorizationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728230000_hugo_access_authorization_hardening.sql",
  ),
  "utf8",
);
const provisionerMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728091000_hugo_access_provisioner.sql",
  ),
  "utf8",
);
const roleAction = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/admin/users/[userId]/edit/actions.ts",
  ),
  "utf8",
);
const roleLockMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729210000_institute_role_group_lifecycle_lock.sql",
  ),
  "utf8",
);
const lifecycleMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260730200000_hugo_institute_lifecycle_contract.sql",
  ),
  "utf8",
);

describe("Institute app-owned role access", () => {
  it("keeps an active Hugo grant usable after Institute changes the role", () => {
    expect(authorizationMigration).toContain(
      "create or replace function public.fn_hugo_grant_row_is_active",
    );
    expect(authorizationMigration).toContain("grant_row.role is not null");
    expect(lifecycleMigration).not.toContain(
      "grant_row.role = profile.system_role",
    );
    expect(authorizationMigration).toMatch(
      /create or replace function public\.fn_hugo_access_is_active[\s\S]*public\.fn_hugo_grant_row_is_active\(profile\.id\)/,
    );
    expect(lifecycleMigration).toContain(
      "create or replace function public.fn_hugo_grant_row_is_active",
    );
  });

  it("preserves the exact identity and lifecycle checks", () => {
    expect(authorizationMigration).toContain(
      "lower(btrim(grant_row.email)) = lower(btrim(profile.email))",
    );
    expect(authorizationMigration).toContain(
      "grant_row.app_user_id = profile.id::text",
    );
    expect(authorizationMigration).toContain("grant_row.desired_status = 'active'");
    expect(authorizationMigration).toContain("not grant_row.prepared_for_delete");
    expect(authorizationMigration).toContain(
      "grant_row.access_expires_at > now()",
    );
  });

  it("serializes lifecycle and role/group changes per Institute identity", () => {
    expect(lifecycleMigration).toContain(
      "hugo-institute-user-lifecycle:' || v_lock_user_id::text",
    );
    expect(lifecycleMigration).toMatch(
      /select profile\.system_role[\s\S]*?from public\.profiles profile[\s\S]*?where profile\.id = v_lock_user_id/,
    );
    expect(lifecycleMigration).toContain("hugo_apply_access_unhashed_legacy_20260730");
    expect(lifecycleMigration).not.toContain("pg_get_functiondef");
    expect(provisionerMigration).not.toContain(
      "hugo-institute-user-lifecycle:' || v_profile.id::text",
    );
  });

  it("treats suspension as a Hugo status transition, not a role/group overwrite", () => {
    expect(lifecycleMigration).toMatch(
      /if p_status = 'suspended' then[\s\S]*v_effective_role := v_current_role[\s\S]*role_group_ids[\s\S]*to_jsonb\(v_current_groups\)/,
    );
    expect(lifecycleMigration).toMatch(
      /if v_grant_status = 'suspended' then[\s\S]*v_effective_role := v_current_role[\s\S]*role_group_ids/,
    );
    expect(lifecycleMigration).toContain(
      "Terminal revocation denies Hugo access but does not delete Institute's",
    );
  });

  it("keeps suspended RLS denied and revoked grants terminal", () => {
    expect(authorizationMigration).toContain(
      "grant_row.desired_status = 'active'",
    );
    expect(provisionerMigration).toContain(
      "grant_revoked",
    );
    expect(authorizationMigration).toContain(
      "create policy hugo_active_authenticated_gate",
    );
  });

  it("does not turn group-less Institute profiles into Hugo grants", () => {
    expect(migration).not.toMatch(
      /insert into public\.hugo_access_grants[\s\S]*from public\.profiles profile[\s\S]*where[\s\S]*not exists[\s\S]*user_role_groups/,
    );
  });

  it("keeps the historical migrations unchanged", () => {
    expect(migration).not.toContain("hugo-institute-user-lifecycle");
    expect(migration).not.toContain("fn_hugo_access_is_active(p_user_id)");
  });

  it("lets Institute change role/groups without changing Hugo lifecycle status", () => {
    expect(roleAction).toContain('rpc("fn_set_user_role_and_groups"');
    expect(roleAction).toContain("p_system_role: input.system_role");
    expect(roleAction).not.toContain("confirmSystemRoleIsUnchanged");
    expect(roleLockMigration).toContain("set system_role = p_system_role");
    expect(roleLockMigration).not.toContain("set status =");
    expect(roleLockMigration).toContain(
      "hugo-institute-user-lifecycle:' || p_user_id::text",
    );
  });
});
