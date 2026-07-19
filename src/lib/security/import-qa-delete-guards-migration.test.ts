import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/033_import_qa_access_and_delete_guards.sql",
  ),
  "utf8",
);
const provenanceMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/020_catalog_artwork_provenance.sql"),
  "utf8",
);

describe("private import QA access and deletion guards", () => {
  it("opens only the sole unreleased imported QA program path", () => {
    expect(migration).toMatch(
      /fn_user_has_unreleased_import_qa_program_access[\s\S]*content_import_id is not null[\s\S]*is_published = false[\s\S]*content_import_release_records[\s\S]*count\(\*\)[\s\S]*= 1/i,
    );
    expect(migration).toMatch(
      /fn_user_has_unreleased_import_qa_course_access[\s\S]*course\.content_import_id = program\.content_import_id[\s\S]*program\.is_published = false[\s\S]*course\.is_published = false/i,
    );
    expect(migration).toMatch(
      /create policy programs_unreleased_import_qa_read on public\.programs[\s\S]*for select to authenticated[\s\S]*fn_user_has_unreleased_import_qa_program_access\(auth\.uid\(\), id\)/i,
    );
    expect(migration).toMatch(
      /create policy courses_unreleased_import_qa_read on public\.courses[\s\S]*for select to authenticated[\s\S]*fn_user_has_unreleased_import_qa_course_access\(auth\.uid\(\), id\)/i,
    );
  });

  it("preserves prerequisite and sequential-course enforcement for QA learners", () => {
    expect(migration).toMatch(
      /fn_lesson_is_unlocked[\s\S]*course_order_mode = 'free'[\s\S]*prior_course\.sort_order < current_course\.sort_order[\s\S]*fn_course_is_complete/i,
    );
    expect(migration).toMatch(
      /fn_lesson_is_unlocked[\s\S]*fn_lesson_is_complete\(p_user_id, v_prereq_id\)/i,
    );
  });

  it("blocks every imported catalog delete surface for normal admin sessions", () => {
    for (const table of [
      "answer_options", "questions", "content_blocks", "lessons",
      "assignments", "quizzes", "modules", "program_access",
      "program_courses", "courses", "programs", "role_groups",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toMatch(
      /Imported catalog graph deletion requires the exact course-import rollback operation/i,
    );
    expect(migration).toMatch(
      /set_config\('bmh\.rollback_import_id', p_import_id, true\)[\s\S]*fn_rollback_course_import_v019_without_video_history_guard[\s\S]*set_config\('bmh\.rollback_import_id', '', true\)/i,
    );
    expect(migration).toMatch(
      /auth\.role\(\)[\s\S]*current_setting\('bmh\.rollback_import_id', true\)[\s\S]*= v_import_id/i,
    );
    expect(migration).not.toMatch(
      /auth\.role\(\)[^;]*= 'service_role' then return old/i,
    );
  });

  it("retains the pre-existing immutable content_import_id boundary", () => {
    expect(provenanceMigration).toMatch(
      /old\.content_import_id is not null[\s\S]*new\.content_import_id is distinct from old\.content_import_id[\s\S]*immutable/i,
    );
    expect(provenanceMigration).toMatch(
      /update of content_import_id[\s\S]*on public\.programs/i,
    );
    expect(provenanceMigration).toMatch(
      /update of content_import_id[\s\S]*on public\.courses/i,
    );
  });

  it("prevents imported descendants from being reparented around delete guards", () => {
    expect(migration).toMatch(
      /fn_guard_imported_catalog_reparent[\s\S]*v_old_import_id is not null or v_new_import_id is not null[\s\S]*ownership edges are immutable/i,
    );
    for (const [table, columns] of [
      ["modules", "course_id"],
      ["lessons", "module_id, quiz_id, assignment_id, prerequisite_lesson_id"],
      ["content_blocks", "lesson_id"],
      ["program_courses", "program_id, course_id"],
      ["program_access", "program_id, role_group_id"],
      ["questions", "quiz_id"],
      ["answer_options", "question_id"],
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `before update of ${columns} on public\\.${table}[\\s\\S]*fn_guard_imported_catalog_reparent`,
          "i",
        ),
      );
    }
    expect(migration).toMatch(
      /when 'questions'[\s\S]*lesson\.quiz_id = old\.quiz_id[\s\S]*lesson\.quiz_id = new\.quiz_id/i,
    );
    expect(migration).toMatch(
      /when 'answer_options'[\s\S]*question\.id = old\.question_id[\s\S]*question\.id = new\.question_id/i,
    );
    expect(migration).toMatch(
      /when 'questions'[\s\S]*select max\(coalesce\(lesson\.content_import_id, course\.content_import_id\)\)[\s\S]*lesson\.quiz_id = old\.quiz_id/i,
    );
    expect(migration).toMatch(
      /when 'answer_options'[\s\S]*select max\(coalesce\(lesson\.content_import_id, course\.content_import_id\)\)[\s\S]*question\.id = old\.question_id/i,
    );
  });

  it("binds every imported descendant insert to the exact apply transaction", () => {
    expect(migration).toMatch(
      /fn_guard_imported_catalog_insert[\s\S]*v_apply_import_id[\s\S]*bmh\.apply_import_id[\s\S]*v_release_import_id[\s\S]*bmh\.release_import_id/i,
    );
    expect(migration).toMatch(
      /when 'lessons'[\s\S]*new\.content_import_id[\s\S]*lesson\.quiz_id = new\.quiz_id[\s\S]*lesson\.assignment_id = new\.assignment_id[\s\S]*prerequisite\.id = new\.prerequisite_lesson_id/i,
    );
    expect(migration).toMatch(
      /fn_guard_catalog_artwork_provenance[\s\S]*bmh\.apply_import_id[\s\S]*new\.content_import_id[\s\S]*exact course-import apply operation/i,
    );
    expect(migration).toMatch(
      /alter function public\.fn_apply_course_import\(text, jsonb\) set schema private[\s\S]*rename to fn_apply_course_import_v023_without_insert_guard[\s\S]*revoke all[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /create function public\.fn_apply_course_import[\s\S]*set_config\('bmh\.apply_import_id', p_import_id, true\)[\s\S]*private\.fn_apply_course_import_v023_without_insert_guard[\s\S]*set_config\('bmh\.apply_import_id', '', true\)/i,
    );
    for (const table of [
      "programs",
      "courses",
      "modules",
      "lessons",
      "content_blocks",
      "program_courses",
      "program_access",
      "questions",
      "answer_options",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `before insert on public\\.${table}[\\s\\S]*fn_guard_imported_catalog_insert`,
          "i",
        ),
      );
    }
    expect(migration).toMatch(
      /cardinality\(v_import_ids\) = 1[\s\S]*v_import_ids\[1\] = v_apply_import_id/i,
    );
    expect(migration).toMatch(
      /when 'program_access'[\s\S]*program\.is_published[\s\S]*content_import_release_records[\s\S]*release\.program_id = program\.id/i,
    );
    expect(migration).toMatch(
      /fn_rollback_course_import[\s\S]*p_owned -> 'courses'[\s\S]*sandra_course_completion_deliveries[\s\S]*durable Sandra completion delivery evidence exists/i,
    );
  });

  it("keeps reconciliation cleanup explicit, unreleased, and dependency-free", () => {
    expect(migration).toMatch(
      /fn_remove_unreleased_import_reconciliation_drift[\s\S]*auth\.role\(\)[\s\S]*<> 'service_role'[\s\S]*content_import_release_records/i,
    );
    expect(migration).toMatch(
      /lesson\.content_import_id is not null[\s\S]*course\.content_import_id is distinct from p_import_id[\s\S]*content_blocks[\s\S]*user_lesson_completions/i,
    );
    expect(migration).toMatch(
      /course\.content_import_id is distinct from p_import_id[\s\S]*program_courses[\s\S]*course_access[\s\S]*modules[\s\S]*certificates[\s\S]*sandra_course_completion_deliveries/i,
    );
    expect(migration).toMatch(
      /fn_remove_unreleased_import_reconciliation_drift[\s\S]*set_config\('bmh\.rollback_import_id', p_import_id, true\)[\s\S]*delete from public\.lessons[\s\S]*delete from public\.courses[\s\S]*set_config\('bmh\.rollback_import_id', '', true\)/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.fn_remove_unreleased_import_reconciliation_drift\(text, uuid\[\], uuid\[\]\)[\s\S]*to service_role/i,
    );
  });
});
