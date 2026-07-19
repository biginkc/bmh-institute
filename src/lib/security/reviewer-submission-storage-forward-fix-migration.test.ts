import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/045_fix_submission_self_storage_policy.sql",
  ),
  "utf8",
);

describe("reviewer submission Storage policy forward fix", () => {
  it("replaces the effective relational helper without a Storage SQL delete", () => {
    const helper = migration.match(
      /create or replace function private\.fn_cleanup_reviewer_evidence_v040[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(helper).toMatch(/delete from public\.assignment_submissions/i);
    expect(helper).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(helper).not.toContain("storage.allow_delete_query");
  });

  it("resolves linked and unlinked objects inside one security definer helper", () => {
    const helper = migration.match(
      /create function public\.fn_actor_may_access_submission_storage_object_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(helper).toMatch(/security definer/i);
    expect(helper).toMatch(
      /not exists \([\s\S]*public\.assignment_submissions[\s\S]*submission_file_path = p_file_path/i,
    );
    expect(helper).toMatch(/fn_actor_may_access_submission_file_v1/i);
  });

  it("makes the owner read policy rely only on the definer decision", () => {
    const policy = migration.match(
      /create policy "submissions_self_read"[\s\S]*?\n  \);/i,
    )?.[0] ?? "";
    expect(policy).toMatch(
      /fn_actor_may_access_submission_storage_object_v1\(\s*auth\.uid\(\),\s*name/i,
    );
    expect(policy).not.toContain("assignment_submissions");
  });

  it("does not restore owner deletion of submitted evidence", () => {
    expect(migration).toMatch(
      /drop policy if exists "submissions_self_delete" on storage\.objects/i,
    );
    expect(migration).not.toMatch(
      /create policy "submissions_self_delete"/i,
    );
  });
});
