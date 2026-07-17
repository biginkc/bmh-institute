import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/026_durable_sandra_and_atomic_video_progress.sql",
  ),
  "utf8",
);

describe("durable Sandra and atomic video progress migration", () => {
  it("creates one durable delivery per learner/course and records settlement", () => {
    expect(sql).toMatch(/unique \(user_id, course_id\)/i);
    for (const field of [
      "attempt_count",
      "last_attempt_at",
      "last_error",
      "acknowledged_at",
      "remote_outcome_id",
    ]) {
      expect(sql).toContain(field);
    }
    expect(sql).toMatch(/after insert on public\.user_lesson_completions/i);
    expect(sql).toContain("trg_enqueue_sandra_course_completion");
    expect(sql).toMatch(/existing\.status = 'pending' and existing\.attempt_count = 0/i);
    expect(sql).toMatch(/status <> 'acknowledged'[\s\S]*attempt_count = p_attempt_count/i);
    expect(sql).toMatch(/status = 'delivering'[\s\S]*interval '5 minutes'[\s\S]*'claimed', v_claimed/i);
  });

  it("requires trusted completion evidence before claiming delivery", () => {
    expect(sql).toContain("public.fn_course_is_complete(p_user_id, p_course_id)");
    expect(sql).toContain("public.fn_course_completed_at(p_user_id, p_course_id)");
    expect(sql).toContain("Course completion evidence not found.");
  });

  it("serializes the entire video read, merge, progress write, and completion write", () => {
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toMatch(/from public\.user_video_progress[\s\S]*for update/i);
    expect(sql).toMatch(/insert into public\.user_video_progress[\s\S]*on conflict/i);
    expect(sql).toMatch(/if v_completed then[\s\S]*insert into public\.user_block_progress/i);
  });

  it("binds watched credit to the exact authored video asset version", () => {
    expect(sql).toMatch(/add column if not exists asset_version text/i);
    expect(sql).toMatch(/v_asset_version := \(v_content ->> 'file_path'\)[\s\S]*'#duration='/i);
    expect(sql).toMatch(/v_stored_asset_version is distinct from v_asset_version[\s\S]*v_ranges := '\[\]'::jsonb/i);
    expect(sql).toMatch(/asset_version = excluded\.asset_version/i);
  });

  it("uses authored duration and server time to reject forged playback", () => {
    expect(sql).toContain("v_content -> 'duration_seconds'");
    expect(sql).toContain("abs(v_duration - p_duration_seconds) > 2");
    expect(sql).toMatch(/p_position_seconds::text in \('NaN', 'Infinity', '-Infinity'\)/);
    expect(sql).toContain("extract(epoch from (v_now - v_last_at))");
    expect(sql).toContain("abs(p_observed_from - v_last_position) > 1");
    expect(sql).toContain("v_watched / v_duration >= 0.9");
  });

  it("exposes only the constrained security-definer functions", () => {
    expect(sql.match(/security definer/g)).toHaveLength(4);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(4);
    expect(sql).toMatch(/revoke all on public\.sandra_course_completion_deliveries[\s\S]*authenticated/i);
    expect(sql).toMatch(/fn_claim_sandra_course_completion_delivery[\s\S]*requires the service role/i);
    expect(sql).toMatch(/grant execute on function public\.fn_claim_sandra_course_completion_delivery[\s\S]*to service_role/i);
    expect(sql).toMatch(/grant execute on function public\.fn_record_video_playback[\s\S]*authenticated, service_role/i);
  });
});
