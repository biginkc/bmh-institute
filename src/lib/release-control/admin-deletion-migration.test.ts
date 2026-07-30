import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260730100000_transactional_admin_deletions.sql", import.meta.url),
  "utf8",
);

describe("transactional admin deletion contract", () => {
  it("exposes bounded preview and delete result codes for every editor target", () => {
    expect(migration).toMatch(/fn_admin_preview_deletion_v1/);
    expect(migration).toMatch(/fn_admin_delete_catalog_entity_v1/);
    for (const code of [
      "deleted",
      "not_found",
      "imported_protected",
      "activity_protected",
      "race_conflict",
      "invalid_target",
      "database_rejected",
    ]) {
      expect(migration).toContain(`'${code}'`);
    }
  });

  it("locks and re-verifies imported ownership/activity before deleting backing rows", () => {
    expect(migration).toMatch(/pg_advisory_xact_lock/);
    expect(migration).toMatch(/for update/);
    expect(migration).toMatch(/content_import_id/);
    expect(migration).toMatch(/user_lesson_completions/);
    expect(migration).toMatch(/assignment_submissions/);
    expect(migration).toMatch(/user_quiz_attempts/);
    expect(migration).toMatch(/delete from public\.quizzes/);
    expect(migration).toMatch(/delete from public\.assignments/);
    expect(migration).toMatch(/delete from public\.user_role_groups/);
    expect(migration).toMatch(/immutable/);
    expect(migration).toMatch(/course_access access[\s\S]*courses course[\s\S]*course\.content_import_id/);
    const lockBlock = migration.slice(migration.indexOf("-- Lock the target"));
    expect(lockBlock.indexOf("for update")).toBeGreaterThanOrEqual(0);
    expect(lockBlock.indexOf("for update")).toBeLessThan(lockBlock.indexOf("v_preview :="));
    expect(lockBlock).toMatch(/user_lesson_completions[\s\S]*for update/);
    expect(lockBlock).toMatch(/assignment_submissions[\s\S]*for update/);
    expect(lockBlock).toMatch(/user_quiz_attempts[\s\S]*for update/);
    expect(lockBlock).toMatch(/user_block_progress[\s\S]*for update/);
    expect(lockBlock).toMatch(/user_video_progress[\s\S]*for update/);
    expect(lockBlock).toMatch(/role_play_results[\s\S]*for update/);
    expect(lockBlock).toMatch(/user_video_completion_history[\s\S]*for update/);
    expect(lockBlock).toMatch(/user_course_resume[\s\S]*for update/);
  });

  it("takes the shared catalog lock before target locks and serializes quiz ownership", () => {
    const deleteBody = migration.slice(migration.indexOf("create or replace function public.fn_admin_delete_catalog_entity_v1"));
    expect(deleteBody.indexOf("course-import-catalog-mutation")).toBeLessThan(deleteBody.indexOf("admin-delete:"));
    expect(deleteBody).toMatch(/public\.quizzes[\s\S]*where id = \(select quiz_id from public\.questions[\s\S]*for update/);
    expect(deleteBody).toMatch(/public\.questions[\s\S]*where id = \(select question\.id[\s\S]*for update/);
    expect(deleteBody).toMatch(/public\.user_quiz_attempts[\s\S]*for update/);
  });

  it("protects a module when any child lesson carries import provenance", () => {
    const modulePreview = migration.slice(
      migration.indexOf("if p_entity_type = 'module' then"),
      migration.indexOf("elsif p_entity_type = 'lesson' then"),
    );

    expect(modulePreview).toMatch(
      /from public\.lessons lesson[\s\S]*join public\.modules module[\s\S]*join public\.courses course[\s\S]*where module\.id = p_entity_id[\s\S]*course\.content_import_id is not null or lesson\.content_import_id is not null/i,
    );
  });

  it("locks descendant content blocks before module and lesson activity rechecks", () => {
    const deleteBody = migration.slice(
      migration.indexOf("-- Lock the target"),
      migration.indexOf("v_preview :="),
    );
    const moduleLocks = deleteBody.slice(
      deleteBody.indexOf("if p_entity_type = 'module' then"),
      deleteBody.indexOf("elsif p_entity_type = 'lesson' then"),
    );
    const lessonLocks = deleteBody.slice(
      deleteBody.indexOf("elsif p_entity_type = 'lesson' then"),
      deleteBody.indexOf("elsif p_entity_type = 'role_group' then"),
    );

    expect(moduleLocks).toMatch(/public\.content_blocks where lesson_id in \(select id from public\.lessons where module_id = p_entity_id\) for update/);
    expect(lessonLocks).toMatch(/public\.content_blocks where lesson_id = p_entity_id for update/);
    expect(moduleLocks.indexOf("public.content_blocks")).toBeLessThan(moduleLocks.indexOf("user_lesson_completions"));
    expect(lessonLocks.indexOf("public.content_blocks")).toBeLessThan(lessonLocks.indexOf("user_lesson_completions"));
  });
});
