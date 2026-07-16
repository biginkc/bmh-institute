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
  });

  it("locks every mutation surface and checks catalog plus learner dependents", () => {
    for (const table of [
      "role_groups", "programs", "courses", "program_courses", "program_access",
      "course_access", "modules", "quizzes", "assignments", "lessons",
      "content_blocks", "questions", "answer_options", "user_role_groups",
      "assignment_submissions", "user_block_progress", "user_video_progress",
      "user_lesson_completions", "user_quiz_attempts", "role_play_results",
      "user_course_resume", "certificates", "program_certificates",
    ]) {
      expect(sql).toMatch(new RegExp(`public\\.${table}`, "i"));
    }
    expect(sql).toMatch(/lock table[\s\S]*in share row exclusive mode/i);
    expect(sql).toMatch(/external modules/i);
    expect(sql).toMatch(/external lessons/i);
    expect(sql).toMatch(/external questions/i);
    expect(sql).toMatch(/external answer options/i);
    expect(sql).toMatch(/external content blocks/i);
  });
});
