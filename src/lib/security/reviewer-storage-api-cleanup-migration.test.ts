import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/044_reviewer_storage_api_cleanup.sql",
  ),
  "utf8",
);

describe("reviewer evidence Storage API cleanup migration", () => {
  it("never enables direct storage metadata deletion", () => {
    expect(migration).not.toContain("storage.allow_delete_query");
    expect(migration).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("returns exact unshared object paths before changing database evidence", () => {
    expect(migration).toContain("storage_cleanup_required");
    expect(migration).toMatch(
      /remaining_submission\.id <> all\(v_submission_ids\)/,
    );
    expect(migration).toMatch(
      /if exists \([\s\S]*from storage\.objects object[\s\S]*return jsonb_build_object/,
    );
  });

  it("holds storage and submission writes until the atomic database cleanup settles", () => {
    expect(migration).toMatch(
      /lock table[\s\S]*public\.assignment_submissions,[\s\S]*storage\.objects[\s\S]*share row exclusive/i,
    );
    expect(migration).toContain("private.fn_cleanup_reviewer_evidence_v040(");
  });

  it("keeps matching audit history after the legacy relational cleanup", () => {
    expect(migration).toMatch(
      /v_audit_rows public\.audit_log\[\][\s\S]*array_agg\(event[\s\S]*fn_cleanup_reviewer_evidence_v040[\s\S]*insert into public\.audit_log/i,
    );
  });

  it("revokes reviewer access in the same successful database cleanup", () => {
    expect(migration).toMatch(
      /fn_cleanup_reviewer_evidence_v040[\s\S]*delete from public\.course_import_reviewers_v1[\s\S]*reviewer_access_revoked', true/i,
    );
  });

  it("requires current catalog access in the submission self-read policy", () => {
    expect(migration).toMatch(
      /drop policy if exists assignment_submissions_self_read[\s\S]*user_id = auth\.uid\(\)[\s\S]*fn_actor_may_access_submission_v1\(auth\.uid\(\), id\)/i,
    );
    expect(migration).toMatch(
      /not exists \([\s\S]*not public\.fn_actor_may_access_submission_v1/i,
    );
  });

  it("creates options only through an authenticated ownership-validating RPC", () => {
    const body = migration.match(
      /create function public\.fn_create_answer_option_for_reviewer_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(body).toMatch(/auth\.role\(\)[\s\S]*authenticated/i);
    expect(body).toMatch(/public\.is_admin\(auth\.uid\(\)\)/i);
    expect(body).toMatch(/question\.quiz_id[\s\S]*lesson\.quiz_id/i);
    expect(body).toMatch(/fn_actor_may_access_catalog_entity_v1/i);
    expect(body).toMatch(/for update of question, lesson/i);
    expect(body).toMatch(/insert into public\.answer_options/i);
  });

  it("derives radio exclusivity from the locked question instead of client peers", () => {
    const body = migration.match(
      /create or replace function public\.fn_update_answer_option_for_reviewer_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(body).toMatch(/question\.question_type/i);
    expect(body).toMatch(
      /p_is_correct and v_question_type in \('single_choice', 'true_false'\)/i,
    );
    expect(body).toMatch(
      /update public\.answer_options[\s\S]*question_id = v_question_id[\s\S]*id <> p_option_id/i,
    );
  });
});
