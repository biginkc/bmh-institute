import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { exactReconciliationContractFingerprint } from "../course-import/exact-reconciliation";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/032_exact_import_reconciliation.sql"), "utf8");

describe("exact import reconciliation migration", () => {
  it("returns every managed table and is service-role only", () => {
    for (const table of ["role_groups", "programs", "courses", "program_courses", "modules", "quizzes", "assignments", "lessons", "content_blocks", "questions", "answer_options", "program_access", "course_access"]) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toMatch(/revoke all on function public\.fn_course_import_managed_ids\(text\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.fn_course_import_managed_ids\(text\) to service_role/i);
    expect(sql).toMatch(/owned_role_groups as \([\s\S]*from public\.program_access access[\s\S]*access\.program_id in \(select id from owned_programs\)/i);
    expect(sql).toMatch(/'program_access'[\s\S]*from public\.program_access where program_id in \(select id from owned_programs\) or role_group_id in \(select id from owned_role_groups\)/i);
    expect(sql).toMatch(/'course_access'[\s\S]*from public\.course_access where course_id in \(select id from owned_courses\) or role_group_id in \(select id from owned_role_groups\)/i);
    expect(sql).toMatch(/owned_lessons as \([\s\S]*content_import_id = p_import_id[\s\S]*or module_id in \(select id from owned_modules\)/i);
    expect(sql).toMatch(/owned_lessons as \([\s\S]*lesson\.quiz_id in \(select id from owned_quizzes\)[\s\S]*lesson\.assignment_id in \(select id from owned_assignments\)[\s\S]*lesson\.prerequisite_lesson_id in \(select id from base_owned_lessons\)/i);
    expect(sql).toMatch(/create or replace function public\.fn_course_import_catalog_sha256\(p_import_id text\)[\s\S]*lesson\.module_id in \(select id from owned_modules\)/i);
    expect(sql).toMatch(/fn_course_import_catalog_sha256[\s\S]*owned_lessons as \([\s\S]*lesson\.quiz_id in \(select id from owned_quizzes\)[\s\S]*lesson\.assignment_id in \(select id from owned_assignments\)[\s\S]*lesson\.prerequisite_lesson_id in \(select id from base_owned_lessons\)/i);
    expect(sql).toMatch(/fn_course_import_catalog_sha256[\s\S]*'program_access'[\s\S]*item\.program_id in \(select id from owned_programs\) or item\.role_group_id in \(select id from owned_role_groups\)/i);
    expect(sql).toMatch(/fn_course_import_catalog_sha256[\s\S]*'course_access'[\s\S]*item\.course_id in \(select id from owned_courses\) or item\.role_group_id in \(select id from owned_role_groups\)/i);
    expect(sql).toMatch(/grant execute on function public\.fn_course_import_catalog_sha256\(text\) to service_role/i);
    expect(exactReconciliationContractFingerprint(sql)).toBe("67d265048c2897ee0c6fc4a89965a7679681617cf163bcd20ec31d34cbcb9d83");
    expect(sql).toMatch(/revoke all on function public\.fn_course_import_exact_reconciliation_contract\(\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.fn_course_import_exact_reconciliation_contract\(\) to service_role/i);
  });

  it("uses a unique migration version after the existing versioned completion migration", () => {
    const migrations = readFileSync(join(process.cwd(), "supabase/migrations/031_versioned_video_completion_and_submission_evidence.sql"), "utf8");
    expect(migrations.length).toBeGreaterThan(0);
    expect(sql.length).toBeGreaterThan(0);
    const versions = readdirSync(join(process.cwd(), "supabase/migrations"))
      .map((name) => /^(\d+)_/.exec(name)?.[1])
      .filter(Boolean);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
