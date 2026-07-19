import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/040_private_import_review_evidence.sql",
  ),
  "utf8",
);

describe("private imported submission reviewer boundary", () => {
  it("replaces admin-wide submission reads and updates with catalog-aware policies", () => {
    expect(sql).toMatch(
      /drop policy if exists assignment_submissions_admin_read on public\.assignment_submissions[\s\S]*create policy assignment_submissions_admin_read[\s\S]*fn_actor_may_access_submission_v1\(auth\.uid\(\), id\)/i,
    );
    expect(sql).toMatch(
      /drop policy if exists assignment_submissions_admin_update on public\.assignment_submissions[\s\S]*create policy assignment_submissions_admin_update[\s\S]*using \([\s\S]*fn_actor_may_access_submission_v1\(auth\.uid\(\), id\)[\s\S]*with check \([\s\S]*fn_actor_may_access_submission_v1\(auth\.uid\(\), id\)/i,
    );
  });

  it("derives submission access from both the assignment and lesson catalog boundary", () => {
    expect(sql).toMatch(
      /create function public\.fn_actor_may_access_submission_v1[\s\S]*assignment_submissions[\s\S]*fn_actor_may_access_catalog_entity_v1[\s\S]*'assignments'[\s\S]*fn_actor_may_access_catalog_entity_v1[\s\S]*'lessons'/i,
    );
    expect(sql).toMatch(
      /p_actor_id is distinct from auth\.uid\(\)[\s\S]*service_role/i,
    );
  });

  it("allows admin file reads only when a visible submission owns the exact storage path", () => {
    expect(sql).toMatch(
      /create function public\.fn_actor_may_access_submission_file_v1[\s\S]*submission_file_path = p_file_path[\s\S]*fn_actor_may_access_submission_v1/i,
    );
    expect(sql).toMatch(
      /drop policy if exists "submissions_admin_read" on storage\.objects[\s\S]*create policy "submissions_admin_read"[\s\S]*bucket_id = 'submissions'[\s\S]*fn_actor_may_access_submission_file_v1\(auth\.uid\(\), name\)/i,
    );
  });

  it("keeps the submission helper callable only by authenticated actors and service role", () => {
    for (const signature of [
      "fn_actor_may_access_submission_v1(uuid, uuid)",
      "fn_actor_may_access_submission_file_v1(uuid, text)",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]*from public, anon`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]*to authenticated, service_role`,
          "i",
        ),
      );
    }
  });
});
