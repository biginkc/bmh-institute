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
  });
});
