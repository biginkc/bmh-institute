import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/016_runtime_progress_security.sql"),
  "utf8",
);

describe("runtime progress security migration", () => {
  it("allows only one incomplete attempt per learner and quiz", () => {
    expect(sql).toMatch(/unique index[\s\S]*user_id, quiz_id[\s\S]*completed_at is null/i);
  });

  it("removes learner writes to completion-bearing tables", () => {
    for (const table of [
      "user_quiz_attempts",
      "user_block_progress",
      "role_play_results",
      "user_video_progress",
    ]) {
      expect(sql).toMatch(
        new RegExp(`revoke insert, update, delete on public\\.${table}`, "i"),
      );
    }
    expect(sql).toMatch(/revoke insert on public\.assignment_submissions/i);
  });

  it("prevents lesson-unlock checks for another learner", () => {
    expect(sql).toContain("p_user_id is distinct from auth.uid()");
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toMatch(/revoke all on function public\.fn_lesson_is_unlocked/i);
  });

  it("guards every user-state security-definer helper", () => {
    for (const name of [
      "is_admin",
      "fn_user_has_program_access",
      "fn_user_has_course_access",
      "fn_lesson_is_complete",
      "fn_course_is_complete",
      "fn_course_completion_percent",
      "fn_program_completion_percent",
    ]) {
      const definition = sql.slice(sql.indexOf(`function public.${name}`));
      expect(definition.slice(0, 5000)).toContain("fn_can_read_user_state");
      expect(sql).toContain(`revoke all on function public.${name}`);
    }
  });
});
