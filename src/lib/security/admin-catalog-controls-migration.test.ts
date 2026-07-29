import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260729123000_fix_role_group_access_rls_boundary.sql"),
  "utf8",
);
const privateSchemaBoundaryMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260729130000_fix_role_group_access_private_schema_boundary.sql"),
  "utf8",
);

describe("admin catalog access RLS boundary migration", () => {
  it("uses the security-definer importer guard without exposing the release ledger", () => {
    expect(migration).toMatch(/security invoker/i);
    expect(migration).toContain("private.fn_is_unreleased_import_qa_role_group(p_role_group_id)");
    expect(migration).not.toMatch(/from public\.content_import_release_records/i);
    expect(migration).toMatch(/grant execute on function public\.fn_set_role_group_access[\s\S]*to authenticated/i);
  });

  it("keeps the private helper behind an authenticated-only public wrapper", () => {
    expect(privateSchemaBoundaryMigration).toMatch(/create or replace function public\.fn_is_unreleased_import_qa_role_group/i);
    expect(privateSchemaBoundaryMigration).toMatch(/security definer/i);
    expect(privateSchemaBoundaryMigration).toMatch(/revoke all on function public\.fn_is_unreleased_import_qa_role_group\(uuid\)[\s\S]*from public, anon/i);
    expect(privateSchemaBoundaryMigration).toMatch(/grant execute on function public\.fn_is_unreleased_import_qa_role_group\(uuid\)[\s\S]*to authenticated/i);
    expect(privateSchemaBoundaryMigration).toContain("public.fn_is_unreleased_import_qa_role_group(p_role_group_id)");
  });
});
