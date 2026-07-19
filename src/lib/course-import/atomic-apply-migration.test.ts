import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/023_atomic_course_import_apply.sql"),
  "utf8",
);

describe("atomic course import apply migration", () => {
  it("is service-role only and validates deterministic exact operation contracts", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain("deterministic ID mismatch");
    expect(sql).toContain("operation row keys do not match the table contract");
    expect(sql).toContain("operation IDs and source_keys must be globally unique");
    expect(sql).toContain("catalog provenance must match import_id");
    expect(sql).toContain("imported catalog must remain unpublished");
    expect(sql).toContain("relationship escapes the closed import graph");
    expect(sql).toContain("payload contains a disconnected import row");
    expect(sql).toContain("same-import rerun would strand rows from the prior manifest");
    expect(sql).toMatch(/revoke all on function public\.fn_apply_course_import\(text, jsonb\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.fn_apply_course_import\(text, jsonb\) to service_role/i);
  });

  it("owns every importer table and returns an exact commit confirmation", () => {
    for (const table of [
      "role_groups", "programs", "courses", "program_courses", "modules",
      "quizzes", "assignments", "lessons", "content_blocks", "questions",
      "answer_options", "program_access",
    ]) {
      expect(sql).toContain(`insert into public.${table}`);
    }
    expect(sql).toContain("'status', 'applied'");
    expect(sql).toContain("'operation_count', v_operation_count");
  });
});
