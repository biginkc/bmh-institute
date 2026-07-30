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

describe("Institute app-owned role access", () => {
  it("keeps an active Hugo grant usable after Institute changes the role", () => {
    expect(migration).toContain(
      "create or replace function public.fn_hugo_grant_row_is_active",
    );
    expect(migration).toContain("grant_row.role is not null");
    expect(migration).not.toContain(
      "grant_row.role = profile.system_role",
    );
    expect(migration).toMatch(
      /create or replace function public\.fn_hugo_access_is_active[\s\S]*public\.fn_hugo_grant_row_is_active\(profile\.id\)/,
    );
  });

  it("preserves the exact identity and lifecycle checks", () => {
    expect(migration).toContain(
      "lower(btrim(grant_row.email)) = lower(btrim(profile.email))",
    );
    expect(migration).toContain(
      "grant_row.app_user_id = profile.id::text",
    );
    expect(migration).toContain("grant_row.desired_status = 'active'");
    expect(migration).toContain("not grant_row.prepared_for_delete");
    expect(migration).toContain(
      "grant_row.access_expires_at > now()",
    );
  });

  it("serializes lifecycle and role/group changes per Institute identity", () => {
    expect(provisionerMigration).toContain(
      "hugo-institute-user-lifecycle:' || v_profile.id::text",
    );
    expect(provisionerMigration).toMatch(
      /select system_role\s+into v_current_role\s+from public\.profiles/,
    );
    expect(provisionerMigration).toMatch(
      /select coalesce\(\s*jsonb_agg\(role_group_id order by role_group_id\),\s*'\[\]'::jsonb\s*\)\s+into v_current_groups/,
    );
  });

  it("treats suspension as a Hugo status transition, not a role/group overwrite", () => {
    expect(provisionerMigration).toMatch(
      /if v_status = 'suspended' then[\s\S]*select system_role\s+into v_current_role[\s\S]*v_config := jsonb_build_object\('role_group_ids', v_current_groups\)/,
    );
    expect(provisionerMigration).toMatch(
      /if v_status = 'active' and found and v_grant\.desired_status = 'suspended'[\s\S]*v_config := v_current_config[\s\S]*p_access_expires_at := v_grant\.access_expires_at/,
    );
    expect(provisionerMigration).toMatch(
      /if v_status <> 'suspended'[\s\S]*if v_status = 'suspended' then\s+v_config := '\{\}'::jsonb/,
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
