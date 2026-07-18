import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/031_versioned_video_completion_and_submission_evidence.sql",
  ),
  "utf8",
);
const migrateWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/db-migrate-test.yml"),
  "utf8",
);

describe("versioned video completion and submission evidence migration", () => {
  it("masks credentials before clients run and keeps direct psql secrets out of argv", () => {
    const applyStep = migrateWorkflow.slice(
      migrateWorkflow.indexOf("- name: Apply pending migrations"),
      migrateWorkflow.indexOf("- name: Install dependencies"),
    );
    const acceptanceStep = migrateWorkflow.slice(
      migrateWorkflow.indexOf("- name: Run versioned completion"),
      migrateWorkflow.indexOf("- name: Run fail-closed provider acceptance"),
    );
    const providerStep = migrateWorkflow.slice(
      migrateWorkflow.indexOf("- name: Run fail-closed provider acceptance"),
    );
    for (const [step, command] of [
      [applyStep, "supabase db push"],
      [providerStep, "npm run test:course-import-provider"],
    ]) {
      expect(step).toContain('echo "::add-mask::$TEST_SUPABASE_DB_PASSWORD"');
      expect(step).toContain('echo "::add-mask::$ENCODED_PASSWORD"');
      expect(step.indexOf('::add-mask::$TEST_SUPABASE_DB_PASSWORD')).toBeLessThan(
        step.indexOf("ENCODED_PASSWORD="),
      );
      expect(step.indexOf('::add-mask::$ENCODED_PASSWORD')).toBeLessThan(
        step.indexOf(command),
      );
    }
    expect(acceptanceStep).toContain('echo "::add-mask::$TEST_SUPABASE_DB_PASSWORD"');
    expect(acceptanceStep).toContain('export PGPASSWORD="$TEST_SUPABASE_DB_PASSWORD"');
    expect(acceptanceStep).not.toContain("ENCODED_PASSWORD=");
    expect(acceptanceStep).not.toContain("DB_URL=");
    expect(acceptanceStep).not.toMatch(/psql\s+["']?\$/);
  });

  it("binds current video credit to one non-null authored asset version", () => {
    expect(sql).toMatch(
      /alter table public\.user_block_progress[\s\S]*add column if not exists asset_version text/i,
    );
    expect(sql).toMatch(
      /public\.fn_video_asset_version\(block\.content\) is not null[\s\S]*progress\.asset_version =[\s\S]*public\.fn_video_asset_version\(block\.content\)/i,
    );
    expect(sql).toMatch(
      /join public\.user_video_progress video_progress[\s\S]*video_progress\.user_id = progress\.user_id[\s\S]*video_progress\.asset_version =[\s\S]*public\.fn_video_asset_version\(block\.content\)/i,
    );
  });

  it("retains immutable audit evidence for every completed video cut", () => {
    expect(sql).toMatch(
      /create table if not exists public\.user_video_completion_history/i,
    );
    expect(sql).toMatch(/primary key \(user_id, block_id, asset_version\)/i);
    expect(sql).toMatch(
      /insert into public\.user_video_completion_history[\s\S]*on conflict \(user_id, block_id, asset_version\) do nothing/i,
    );
    expect(sql).not.toMatch(
      /create policy[\s\S]*user_video_completion_history[\s\S]*for (insert|update|delete) to authenticated/i,
    );
    expect(sql).toMatch(
      /user_id uuid not null references public\.profiles\(id\) on delete restrict/i,
    );
    expect(sql).toMatch(
      /block_id uuid not null references public\.content_blocks\(id\) on delete restrict/i,
    );
    expect(sql).toMatch(
      /grant select, insert on table public\.user_video_completion_history[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(
      /grant[^;]*(update|delete)[^;]*user_video_completion_history[^;]*service_role/i,
    );
    expect(sql).toMatch(
      /create trigger preserve_video_completion_history[\s\S]*before update or delete on public\.user_video_completion_history/i,
    );
  });

  it("guards rollback with a serialized immutable-history preflight", () => {
    expect(sql).toMatch(
      /alter function public\.fn_rollback_course_import\(text, jsonb\)[\s\S]*set schema private/i,
    );
    expect(sql).toMatch(
      /lock table[\s\S]*public\.user_video_progress,[\s\S]*public\.user_video_completion_history,[\s\S]*public\.user_block_progress[\s\S]*in share row exclusive mode/i,
    );
    expect(sql).toMatch(
      /from public\.user_video_completion_history history[\s\S]*history\.block_id = any\(v_content_blocks\)[\s\S]*immutable video completion history exists/i,
    );
    expect(sql).toMatch(
      /revoke all on function[\s\S]*private\.fn_rollback_course_import_v019_without_video_history_guard[\s\S]*service_role/i,
    );
  });

  it("recomputes downstream lesson, course, percent, and prerequisite state", () => {
    expect(sql).toMatch(
      /create or replace function public\.fn_course_is_complete[\s\S]*public\.fn_lesson_is_complete\(p_user_id, lesson\.id\)/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.fn_course_completion_percent[\s\S]*public\.fn_lesson_is_complete\(p_user_id, required\.id\)/i,
    );
    expect(sql).toMatch(
      /if not public\.fn_lesson_is_complete\(p_user_id, v_prereq_id\) then/i,
    );
  });

  it("refreshes completion only when a learner completes a replacement cut", () => {
    expect(sql).toMatch(
      /after insert or update of asset_version on public\.user_block_progress/i,
    );
    expect(sql).toMatch(
      /old\.asset_version is distinct from new\.asset_version[\s\S]*completed_at = excluded\.completed_at/i,
    );
    expect(sql).toMatch(
      /where user_block_progress\.asset_version is distinct from[\s\S]*excluded\.asset_version/i,
    );
  });

  it("removes learner deletion of uploaded assignment evidence", () => {
    const immutableEvidenceSql = sql.slice(
      sql.indexOf('drop policy if exists "submissions_self_delete"'),
    );
    expect(immutableEvidenceSql).toContain(
      'drop policy if exists "submissions_self_delete" on storage.objects',
    );
    expect(immutableEvidenceSql).not.toMatch(
      /create policy\s+"submissions_self_delete"/i,
    );
  });

  it("provides bounded fail-closed learner and admin batch state RPCs", () => {
    expect(sql).toMatch(
      /create or replace function public\.fn_lesson_states\([\s\S]*cardinality\(p_lesson_ids\) > 500[\s\S]*fn_lesson_is_complete[\s\S]*fn_lesson_is_unlocked/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.fn_admin_lesson_completion_states\([\s\S]*cardinality\(p_user_ids\)::bigint \* cardinality\(p_lesson_ids\)::bigint > 5000[\s\S]*case when state\.is_complete then completion\.completed_at else null end/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_admin_lesson_completion_states\(uuid\[\], uuid\[\]\)[\s\S]*to authenticated, service_role/i,
    );
    expect(sql).not.toMatch(/if auth\.role\(\) <> 'service_role'/i);
    expect(sql).not.toMatch(/if not public\.fn_can_read_user_state\(p_user_id\)/i);
  });

  it("runs migration and fail-closed provider acceptance serially with seeded E2E", () => {
    expect(migrateWorkflow).toContain(
      "group: bmh-institute-seeded-e2e-shared-test-project",
    );
    expect(migrateWorkflow).toMatch(
      /Apply pending migrations[\s\S]*Install dependencies[\s\S]*npm ci[\s\S]*npm run test:course-import-provider/i,
    );
    expect(migrateWorkflow).toMatch(
      /Run versioned completion(?: and import guard)? Postgres acceptance[\s\S]*031_versioned_video_completion_and_submission_evidence\.sql/i,
    );
  });
});
