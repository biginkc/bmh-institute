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
    expect(lockBlock).toMatch(/user_video_completion_history[\s\S]*for update/);
  });
});
