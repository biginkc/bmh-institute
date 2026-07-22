import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722032500_prune_deferred_role_play_blocks.sql",
  ),
  "utf8",
);

describe("deferred role-play pruning migration", () => {
  it("is service-role only, confirmation-bound, and limited to pending role plays", () => {
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain("PRUNE-DEFERRED-ROLE-PLAYS:");
    expect(sql).toContain("block.block_type = 'role_play'");
    expect(sql).toContain("'^pending:");
    expect(sql).toMatch(
      /revoke all on function public\.fn_prune_deferred_role_play_blocks_v1\(text, jsonb, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_prune_deferred_role_play_blocks_v1\(text, jsonb, text\)[\s\S]*to service_role/i,
    );
  });

  it("refuses released content, exact-contract drift, and all known activity", () => {
    expect(sql).toContain("content_import_release_records");
    expect(sql).toContain("program.is_published");
    expect(sql).toContain("course.is_published");
    expect(sql).toContain("exact imported block contract mismatch");
    for (const table of [
      "role_play_results",
      "user_block_progress",
      "user_video_progress",
      "user_video_completion_history",
      "user_course_resume",
    ]) {
      expect(sql).toContain(`public.${table}`);
    }
  });

  it("deletes only the exact IDs and checks the affected row count", () => {
    expect(sql).toMatch(
      /delete from public\.content_blocks block[\s\S]*block\.id = any\(v_block_ids\)[\s\S]*block\.block_type = 'role_play'/i,
    );
    expect(sql).toContain("v_deleted_count <> v_expected_count");
    expect(sql).toContain("'deleted_count', v_deleted_count");
  });
});
