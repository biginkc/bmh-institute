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

describe("versioned video completion and submission evidence migration", () => {
  it("binds current video credit to one non-null authored asset version", () => {
    expect(sql).toMatch(
      /alter table public\.user_block_progress[\s\S]*add column if not exists asset_version text/i,
    );
    expect(sql).toMatch(
      /public\.fn_video_asset_version\(block\.content\) is not null[\s\S]*progress\.asset_version =[\s\S]*public\.fn_video_asset_version\(block\.content\)/i,
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
});
