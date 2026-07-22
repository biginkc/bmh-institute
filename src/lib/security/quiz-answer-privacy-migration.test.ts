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
    expect(sql).toMatch(/jsonb_build_object\(\s*'is_correct', v_is_correct/i);
    expect(sql).toMatch(/'points', v_points/i);
    expect(sql).toMatch(/'question_type', v_question_type/i);
    expect(sql).toMatch(
      /if v_is_correct then[\s\S]*jsonb_build_object\('explanation', v_explanation\)/i,
    );
    expect(sql).not.toMatch(/correct_option_ids|correct_options/i);
  });

  it("backfills legacy responses without disclosing a historical explanation", () => {
    expect(sql).toMatch(/update public\.user_quiz_attempts[\s\S]*answer_results[\s\S]*jsonb_each\(attempt\.responses\)/i);
    expect(sql).toMatch(/'explanation', null/i);
    expect(sql).toMatch(/This attempt has no stored grading result/i);
    expect(sql).toMatch(/grading_snapshot_state = 'legacy_backfilled'/i);
    expect(sql).toMatch(/grading_snapshot_state = 'legacy_summary_only'/i);
    expect(sql).toMatch(/completed_at is not null/i);
    expect(sql).toMatch(/unavailable questions; remediation is required before migration/i);
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

  it("reads explanation and the complete answer key from one statement snapshot", () => {
    expect(sql).toMatch(
      /select[\s\S]*question\.explanation[\s\S]*array_agg\([\s\S]*option\.is_correct[\s\S]*into\s+v_question_type,\s*v_explanation,\s*v_points,\s*v_correct_sorted/i,
    );
  });

  it("updates the guarded fixture-cleanup column fingerprint", () => {
    expect(sql).toMatch(
      /v_new_fields text\[\][\s\S]*'answer_results'[\s\S]*'grading_snapshot_state'[\s\S]*update private\.fixture_cleanup_boundary_v1[\s\S]*where table_name = 'user_quiz_attempts'/i,
    );
    expect(sql).toContain("84cd11f70007a28cbb0612f3d5ec34e3124a86377b7cda7d8e87ac6f1e587528");
    expect(sql).toMatch(/v_occurrences <> 2/i);
    expect(sql).toMatch(/contract_name = 'moved_destructive'/i);
    expect(sql).toMatch(/fixture_cleanup_controller_contract_attestation_v1/i);
  });

  it("denies direct learner reads after current catalog access is revoked", () => {
    expect(sql).toMatch(/drop policy if exists user_quiz_attempts_self_read/i);
    expect(sql).toMatch(
      /create policy user_quiz_attempts_self_read[\s\S]*user_id = auth\.uid\(\)[\s\S]*fn_actor_may_access_catalog_entity_v1\([\s\S]*'lessons'[\s\S]*lesson_id[\s\S]*fn_lesson_is_unlocked\(user_id, lesson_id\)/i,
    );
  });
});
