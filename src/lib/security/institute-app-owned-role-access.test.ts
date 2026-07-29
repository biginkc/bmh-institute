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

describe("Institute app-owned role access", () => {
  it("keeps an active Hugo grant usable after Institute changes the role", () => {
    expect(migration).toContain(
      "create or replace function public.fn_hugo_grant_row_is_active",
    );
    expect(migration).toContain("grant_row.role is not null");
    expect(migration).not.toContain(
      "grant_row.role = profile.system_role",
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
});
