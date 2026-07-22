import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/052_set_based_learner_lesson_states.sql",
  ),
  "utf8",
);

describe("set-based learner lesson states migration", () => {
  it("derives the actor, bounds cardinality, and exposes no caller-selected user", () => {
    expect(sql).toMatch(
      /fn_learner_lesson_states_v1\(\s*p_course_id uuid,\s*p_lesson_ids uuid\[\]/i,
    );
    expect(sql).toMatch(/v_actor_id uuid := auth\.uid\(\)/i);
    expect(sql).not.toMatch(/p_user_id/i);
    expect(sql).toMatch(/cardinality\(p_lesson_ids\) > 500/i);
    expect(sql).toMatch(/set search_path = ''/i);
  });

  it("checks every requested course and import boundary before reading state", () => {
    expect(sql).toMatch(/course\.id is distinct from p_course_id/i);
    expect(sql).toMatch(
      /values \(lesson\.content_import_id\), \(course\.content_import_id\)/i,
    );
    expect(sql).toMatch(/content_import_release_records/i);
    expect(sql).toMatch(/course_import_reviewers_v1/i);
    expect(sql).toMatch(/profile\.status = 'active'/i);
    expect(sql).toMatch(
      /if not v_has_course_access then[\s\S]*errcode = '42501'/i,
    );
  });

  it("calculates content, quiz, assignment, prerequisite, and video-version state set-wise", () => {
    expect(sql).toMatch(/with requested as[\s\S]*completion as/i);
    expect(sql).toMatch(/public\.user_block_progress/i);
    expect(sql).toMatch(/public\.fn_video_asset_version/i);
    expect(sql).toMatch(/public\.user_quiz_attempts/i);
    expect(sql).toMatch(/public\.assignment_submissions/i);
    expect(sql).toMatch(/prerequisite_quiz_min_score/i);
  });

  it("grants only authenticated execution", () => {
    expect(sql).toMatch(
      /revoke all on function public\.fn_learner_lesson_states_v1\(uuid, uuid\[\]\)[\s\S]*from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_learner_lesson_states_v1\(uuid, uuid\[\]\)[\s\S]*to authenticated/i,
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*to anon/i);
  });
});
