import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/039_private_import_reviewer_access.sql",
  ),
  "utf8",
);

describe("private imported-catalog reviewer migration", () => {
  it("binds reviewer grants to the exact program and exposes only a service setter", () => {
    expect(sql).toMatch(
      /create table public\.course_import_reviewers_v1[\s\S]*program_id uuid not null references public\.programs\(id\) on delete cascade[\s\S]*primary key \(program_id, user_id\)/i,
    );
    expect(sql).toMatch(
      /alter table public\.course_import_reviewers_v1 enable row level security[\s\S]*revoke all on table public\.course_import_reviewers_v1[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(sql).toMatch(
      /fixture_cleanup_references_v1[\s\S]*'course_import_reviewers_v1'[\s\S]*'program_id'[\s\S]*'programs'[\s\S]*'scalar'/i,
    );
    expect(sql).toMatch(
      /create function public\.fn_set_unreleased_import_reviewer_v1[\s\S]*auth\.role\(\)[\s\S]*<> 'service_role'[\s\S]*course-import-catalog-mutation/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.fn_set_unreleased_import_reviewer_v1\(uuid, uuid, boolean\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_set_unreleased_import_reviewer_v1\(uuid, uuid, boolean\)[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /profile\.status = 'active'[\s\S]*profile\.system_role = 'owner'/i,
    );
  });

  it("resolves every catalog table through a fail-closed import predicate", () => {
    for (const table of [
      "programs",
      "courses",
      "program_courses",
      "program_access",
      "course_access",
      "modules",
      "lessons",
      "content_blocks",
      "quizzes",
      "questions",
      "answer_options",
      "assignments",
    ]) {
      expect(sql).toContain(`p_entity_type = '${table}'`);
    }
    expect(sql).toMatch(
      /fn_user_may_access_catalog_entity_v1[\s\S]*content_import_release_records[\s\S]*course_import_reviewers_v1/i,
    );
    expect(sql).toMatch(
      /fn_actor_may_access_catalog_entity_v1[\s\S]*p_actor_id is distinct from auth\.uid\(\)/i,
    );
  });

  it("replaces every permissive catalog admin policy with the reviewer predicate", () => {
    for (const [policy, table] of [
      ["programs_admin_all", "programs"],
      ["courses_admin_all", "courses"],
      ["program_courses_admin_all", "program_courses"],
      ["program_access_admin_all", "program_access"],
      ["course_access_admin_all", "course_access"],
      ["modules_admin_all", "modules"],
      ["lessons_admin_all", "lessons"],
      ["content_blocks_admin_all", "content_blocks"],
      ["quizzes_admin_all", "quizzes"],
      ["questions_admin_all", "questions"],
      ["answer_options_admin_all", "answer_options"],
      ["assignments_admin_all", "assignments"],
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `drop policy if exists ${policy} on public\\.${table};[\\s\\S]*create policy ${policy} on public\\.${table}[\\s\\S]*fn_actor_may_access_catalog_entity_v1`,
          "i",
        ),
      );
    }
  });

  it("moves the old definer bodies private and guards every public runtime entry point", () => {
    for (const name of [
      "fn_lesson_is_complete",
      "fn_course_is_complete",
      "fn_course_completion_percent",
      "fn_lesson_is_unlocked",
      "fn_lesson_states",
      "fn_admin_lesson_completion_states",
      "fn_program_completion_percent",
      "fn_course_completed_at",
      "fn_move_module",
      "fn_update_assignment_for_lesson",
    ]) {
      expect(sql).toContain(`alter function public.${name}`);
      expect(sql).toMatch(
        new RegExp(
          `create function public\\.${name}[\\s\\S]*?fn_actor_may_access_catalog_entity_v1`,
          "i",
        ),
      );
    }
  });

  it("replaces QA membership reads with the explicit reviewer allowlist", () => {
    expect(sql).toMatch(
      /create or replace function public\.fn_user_has_unreleased_import_qa_program_access[\s\S]*course_import_reviewers_v1/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.fn_user_has_unreleased_import_qa_course_access[\s\S]*course_import_reviewers_v1/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.fn_user_has_program_access[\s\S]*fn_user_may_access_catalog_entity_v1/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.fn_user_has_course_access[\s\S]*fn_user_may_access_catalog_entity_v1/i,
    );
  });
});
