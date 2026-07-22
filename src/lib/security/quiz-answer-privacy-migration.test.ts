import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/051_quiz_answer_privacy_snapshots.sql",
  ),
  "utf8",
);

describe("quiz answer privacy snapshot migration", () => {
  it("stores an immutable per-question grading result without answer keys", () => {
    expect(sql).toMatch(
      /alter table public\.user_quiz_attempts[\s\S]*add column if not exists answer_results jsonb not null default '\{\}'::jsonb/i,
    );
    expect(sql).toMatch(/jsonb_build_object\('is_correct', v_is_correct\)/i);
    expect(sql).toMatch(
      /if v_is_correct then[\s\S]*jsonb_build_object\('explanation', v_explanation\)/i,
    );
    expect(sql).not.toMatch(/correct_option_ids|correct_options/i);
  });

  it("checks current catalog access inside the atomic recording boundary", () => {
    expect(sql).toMatch(
      /fn_actor_may_access_catalog_entity_v1\(\s*auth\.uid\(\),\s*'lessons',\s*v_attempt\.lesson_id\s*\)/i,
    );
    expect(sql).toMatch(
      /fn_lesson_is_unlocked\(\s*v_attempt\.user_id,\s*v_attempt\.lesson_id\s*\)/i,
    );
  });

  it("returns the stored snapshot with idempotent retries", () => {
    expect(sql).toMatch(
      /returns table \([\s\S]*answer_results jsonb[\s\S]*already_answered boolean/i,
    );
    expect(sql).toMatch(
      /select\s+v_attempt\.responses,\s*v_attempt\.answer_results,\s*v_attempt\.completed_at,\s*true/i,
    );
  });
});
