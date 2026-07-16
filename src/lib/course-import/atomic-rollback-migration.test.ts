import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/019_atomic_course_import_rollback.sql"),
  "utf8",
);

describe("atomic course import rollback migration", () => {
  it("is service-role-only and validates the complete owned-ID payload", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql).toMatch(/revoke all on function public\.fn_rollback_course_import[\s\S]*from public/i);
    expect(sql).toMatch(/revoke all on function public\.fn_rollback_course_import[\s\S]*from anon/i);
    expect(sql).toMatch(/revoke all on function public\.fn_rollback_course_import[\s\S]*from authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.fn_rollback_course_import[\s\S]*to service_role/i);
    expect(sql).toMatch(/jsonb_object_keys/i);
    expect(sql).toMatch(/duplicate owned UUID/i);
    expect(sql).toMatch(/invalid import_id/i);
    expect(sql).toMatch(/owned ID does not match import_id and source_key/i);
    expect(sql).toMatch(/unknown [a-z_]+ ID/i);
    expect(sql.match(/get diagnostics v_deleted = row_count/gi)).toHaveLength(12);
    expect(sql).toMatch(/v_actual_delete_count <> v_item_count/i);
  });

  it("locks every mutation surface and checks catalog plus learner dependents", () => {
    const lockStatement = sql.match(/lock table([\s\S]*?)in share row exclusive mode/i)?.[1];
    expect(lockStatement).toBeTruthy();
    for (const table of [
      "role_groups", "programs", "courses", "program_courses", "program_access",
      "course_access", "invites", "modules", "quizzes", "assignments", "lessons",
      "content_blocks", "questions", "answer_options", "user_role_groups",
      "assignment_submissions", "user_block_progress", "user_video_progress",
      "user_lesson_completions", "user_quiz_attempts", "role_play_results",
      "user_course_resume", "certificates", "program_certificates",
    ]) {
      expect(lockStatement).toMatch(new RegExp(`public\\.${table}(?:,|\\s)`, "i"));
    }
    expect(sql).toMatch(/lock table[\s\S]*in share row exclusive mode/i);
    expect(sql).toMatch(/external modules/i);
    expect(sql).toMatch(/external lessons/i);
    expect(sql).toMatch(/external questions/i);
    expect(sql).toMatch(/external answer options/i);
    expect(sql).toMatch(/external content blocks/i);
    expect(sql).toMatch(/role_group_ids && v_role_groups/i);
  });
});
