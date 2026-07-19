import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/040_private_import_review_evidence.sql",
  ),
  "utf8",
);

describe("private import review evidence hardening", () => {
  it("atomically removes only an explicit reviewer's unreleased-import evidence", () => {
    expect(sql).toMatch(
      /create function public\.fn_cleanup_unreleased_import_reviewer_evidence_v1\(\s*p_import_id text,\s*p_user_id uuid\s*\)/i,
    );
    expect(sql).toMatch(
      /auth\.role\(\)[\s\S]*<> 'service_role'[\s\S]*course-import-catalog-mutation[\s\S]*course-import-release:/i,
    );
    expect(sql).toMatch(
      /course_import_reviewers_v1[\s\S]*program\.content_import_id = p_import_id[\s\S]*program\.is_published = false[\s\S]*content_import_release_records/i,
    );
    for (const table of [
      "assignment_submissions",
      "user_quiz_attempts",
      "role_play_results",
      "user_video_progress",
      "user_video_completion_history",
      "user_block_progress",
      "user_lesson_completions",
      "user_course_resume",
      "certificates",
      "program_certificates",
      "sandra_course_completion_deliveries",
    ]) {
      expect(sql).toMatch(
        new RegExp(`delete from public\\.${table}[\\s\\S]*p_user_id`, "i"),
      );
    }
    expect(sql).toMatch(
      /delete from storage\.objects[\s\S]*bucket_id = 'submissions'[\s\S]*name = any\(v_submission_file_paths\)[\s\S]*not exists[\s\S]*remaining_submission\.submission_file_path = object\.name/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.fn_cleanup_unreleased_import_reviewer_evidence_v1\(text, uuid\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i,
    );
  });

  it("permits append-only video evidence deletion only inside the exact reviewer cleanup", () => {
    expect(sql).toMatch(
      /create or replace function public\.trg_preserve_video_completion_history[\s\S]*bmh\.reviewer_cleanup_import_id[\s\S]*bmh\.reviewer_cleanup_user_id[\s\S]*fn_user_is_unreleased_import_reviewer_v1[\s\S]*Video completion history is append-only/i,
    );
  });

  it("suppresses Sandra enqueue and claim before any durable delivery mutation", () => {
    expect(sql).toMatch(
      /fn_course_has_unreleased_import_v1[\s\S]*content_import_release_records/i,
    );
    const enqueue = sql.match(
      /create or replace function public\.trg_enqueue_sandra_course_completion[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(enqueue).toMatch(
      /fn_course_has_unreleased_import_v1\(v_course_id\)[\s\S]*return new[\s\S]*insert into public\.sandra_course_completion_deliveries/i,
    );
    const claim = sql.match(
      /create function public\.fn_claim_sandra_course_completion_delivery[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(claim).toMatch(
      /auth\.role\(\)[\s\S]*service_role[\s\S]*fn_course_has_unreleased_import_v1\(p_course_id\)[\s\S]*raise exception[\s\S]*private\.fn_claim_sandra_delivery_v026_unguarded/i,
    );
  });

  it("uses one authenticated atomic RPC for target and peer answer-option writes", () => {
    const body = sql.match(
      /create function public\.fn_update_answer_option_for_reviewer_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(body).toMatch(/auth\.role\(\)[\s\S]*<> 'authenticated'/i);
    expect(body).toMatch(/public\.is_admin\(auth\.uid\(\)\)/i);
    expect(body).toMatch(
      /option\.question_id[\s\S]*question\.quiz_id[\s\S]*lesson\.quiz_id/i,
    );
    expect(body).toMatch(
      /fn_actor_may_access_catalog_entity_v1\(\s*auth\.uid\(\), 'answer_options'/i,
    );
    expect(body).toMatch(
      /exclusive peer answer options must belong to the target question/i,
    );
    expect(body).toMatch(
      /update public\.answer_options[\s\S]*is_correct = false[\s\S]*update public\.answer_options[\s\S]*option_text = btrim\(p_option_text\)/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.fn_update_answer_option_for_reviewer_v1\(uuid, uuid, text, boolean, uuid\[\]\)[\s\S]*from public, anon, service_role[\s\S]*grant execute[\s\S]*to authenticated/i,
    );
  });
});
