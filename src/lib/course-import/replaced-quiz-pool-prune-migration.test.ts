import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722034500_prune_replaced_quiz_pools.sql",
  ),
  "utf8",
);

describe("replaced quiz-pool pruning migration", () => {
  it("is service-only and binds confirmation to the sorted retained IDs", () => {
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain("array_agg(id order by id)");
    expect(sql).toContain("pg_catalog.sha256");
    expect(sql).toContain("PRUNE-REPLACED-QUIZ-POOLS:");
    expect(sql).toMatch(
      /revoke all on function public\.fn_prune_replaced_quiz_pools_v1\(text, uuid\[\], uuid\[\], text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_prune_replaced_quiz_pools_v1\(text, uuid\[\], uuid\[\], text\)[\s\S]*to service_role/i,
    );
  });

  it("refuses publication, attempts, reviewer options, and retained graph drift", () => {
    expect(sql).toContain("content_import_release_records");
    expect(sql).toContain("program.is_published");
    expect(sql).toContain("course.is_published");
    expect(sql).toContain("retained graph contract mismatch");
    expect(sql).toContain("public.user_quiz_attempts");
    expect(sql).toContain("public.course_import_reviewer_answer_options_v1");
  });

  it("removes options before questions under the exact import marker", () => {
    expect(sql).toMatch(
      /set_config\('bmh\.rollback_import_id', p_import_id, true\)[\s\S]*delete from public\.answer_options[\s\S]*delete from public\.questions[\s\S]*set_config\('bmh\.rollback_import_id', '', true\)/i,
    );
    expect(sql).toContain("v_deleted_questions <> cardinality(v_extra_question_ids)");
    expect(sql).toContain("v_deleted_options <> cardinality(v_extra_option_ids)");
  });
});
