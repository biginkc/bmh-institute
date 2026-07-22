import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260722130000_versioned_released_quiz_revisions.sql"),
  "utf8",
);
const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/db-migrate-test.yml"), "utf8");
const rehearsal = readFileSync(
  resolve(process.cwd(), "scripts/course-content/build-released-quiz-revision-rehearsal-sql.ts"),
  "utf8",
);

describe("versioned released quiz revision migration", () => {
  it("keeps the v1 receipt immutable and records append-only revisions", () => {
    expect(sql).toContain("content_import_release_records");
    expect(sql).toContain("content_import_release_revisions");
    expect(sql).toMatch(/primary key \(import_id, revision\)/i);
    expect(sql).toMatch(/if tg_op <> 'INSERT'/i);
    expect(sql).toMatch(/content import release revisions are immutable/i);
    expect(sql).toContain("content_import_active_release_v1");
  });

  it("is service-only, checksum-bound, and serialized with all catalog mutation paths", () => {
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
    expect(sql).toContain("REVISE-RELEASED-QUIZZES:");
    expect(sql).toContain("p_expected_prior_manifest_sha256");
    expect(sql).toContain("p_manifest_sha256");
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]*course-import-catalog-mutation/i);
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]*course-import-release:/i);
    expect(sql).toMatch(/live catalog changed after the active release receipt/i);
    expect(sql).toMatch(/question_bank_sha256' is distinct from p_evidence/i);
    expect(sql).toMatch(/approval_request_sha256' is distinct from p_evidence/i);
    expect(sql).toMatch(/approval_ledger_sha256' is distinct from p_evidence/i);
  });

  it("accepts only the exact 19-quiz exhaustive graph and reconciles options before questions", () => {
    expect(sql).toMatch(/jsonb_array_length\(p_quizzes\) <> 19/i);
    expect(sql).toMatch(/jsonb_array_length\(p_questions\) <> 920/i);
    expect(sql).toContain("questions_per_attempt is not null");
    expect(sql).toMatch(/delete from public\.answer_options[\s\S]*delete from public\.questions/i);
    expect(sql).toMatch(/insert into public\.questions[\s\S]*on conflict \(id\) do update/i);
    expect(sql).toMatch(/insert into public\.answer_options[\s\S]*on conflict \(id\) do update/i);
  });

  it("archives the prior graph, refuses completed activity, and invalidates only incomplete attempts", () => {
    expect(sql).toContain("prior_quiz_graph");
    expect(sql).toContain("invalidated_incomplete_attempts");
    expect(sql).toMatch(/where attempt\.quiz_id = any\(v_quiz_ids\) and attempt\.completed_at is null/i);
    expect(sql).toMatch(/delete from public\.user_quiz_attempts[\s\S]*completed_at is null/i);
    const attemptDeletes = sql.split(";").filter((statement) =>
      /delete from public\.user_quiz_attempts/i.test(statement),
    );
    expect(attemptDeletes.length).toBeGreaterThan(0);
    expect(attemptDeletes.every((statement) => /completed_at is null/i.test(statement))).toBe(true);
    expect(sql).toMatch(/completed quiz activity exists/i);
    expect(sql).toMatch(/live legacy graph no longer matches the archived 19\/342\/1292 capped release/i);
    expect(sql).toMatch(/row\.questions_per_attempt is distinct from 10/i);
  });

  it("does not make the generic released import apply or release receipt mutable", () => {
    expect(sql).not.toMatch(/create or replace function public\.fn_apply_course_import/i);
    expect(sql).not.toMatch(/alter table public\.content_import_release_records/i);
    expect(sql).not.toMatch(/update public\.content_import_release_records/i);
    expect(sql).toMatch(/revoke all on function public\.fn_revise_released_quizzes_v1/i);
    expect(sql).toMatch(/grant execute on function public\.fn_revise_released_quizzes_v1[\s\S]*to service_role/i);
  });

  it("provides a compare-and-swap rollback to the archived prior graph", () => {
    expect(sql).toContain("fn_rollback_released_quiz_revision_v1");
    expect(sql).toContain("ROLLBACK-RELEASED-QUIZZES:");
    expect(sql).toMatch(/v_latest\.prior_quiz_graph -> 'quizzes'/i);
    expect(sql).toMatch(/v_latest\.prior_quiz_graph -> 'questions'/i);
    expect(sql).toMatch(/v_latest\.prior_quiz_graph -> 'answer_options'/i);
    expect(sql).toMatch(/v_latest\.question_count <> 920/i);
    expect(sql).toMatch(/jsonb_array_length\(v_questions\) <> 342/i);
    expect(sql).toMatch(/p_evidence ->> 'rollback_sha256' is distinct from v_latest\.evidence ->> 'rollback_sha256'/i);
    expect(sql).toMatch(/failed to restore the exact prior catalog checksum/i);
    expect(sql).toMatch(/completed quiz activity now exists; automatic rollback is unsafe/i);
    expect(sql).toMatch(/grant execute on function public\.fn_rollback_released_quiz_revision_v1[\s\S]*to service_role/i);
  });

  it("executes the behavioral rehearsal in the PostgreSQL 15/16/17 CI matrix", () => {
    expect(workflow).toContain("build-released-quiz-revision-rehearsal-sql.ts");
    expect(workflow).toMatch(/psql --set ON_ERROR_STOP=1 --file/i);
    expect(workflow).toContain('postgres: ["15", "16", "17"]');
    expect(rehearsal).toMatch(/confirmation mismatch/i);
    expect(rehearsal).toMatch(/stale compare-and-swap manifest/i);
    expect(rehearsal).toMatch(/drifted legacy graph/i);
    expect(rehearsal).toMatch(/immutability trigger unexpectedly allowed an update/i);
    expect(rehearsal).toMatch(/immutability trigger unexpectedly allowed a delete/i);
  });
});
