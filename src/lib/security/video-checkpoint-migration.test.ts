import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260730120000_video_resume_checkpoint.sql"), "utf8");
const checkpointFunction = sql.slice(
  sql.indexOf("create or replace function public.fn_checkpoint_video_playback"),
  sql.indexOf("create or replace function public.fn_record_video_playback"),
);
const playbackFunction = sql.slice(
  sql.indexOf("create or replace function public.fn_record_video_playback"),
);

describe("video resume checkpoint migration", () => {
  it("is authenticated, asset-bound, stale-safe, and cannot grant completion", () => {
    expect(checkpointFunction).toMatch(/p_user_id is distinct from auth\.uid\(\)/i);
    expect(checkpointFunction).toMatch(/p_client_updated_at[\s\S]*> v_now \+ interval '5 minutes'/i);
    expect(checkpointFunction).toMatch(/checkpoint_client_updated_at[\s\S]*>= p_client_updated_at/i);
    expect(checkpointFunction).toMatch(/fn_lesson_is_unlocked\(p_user_id, v_lesson_id\)/i);
    expect(checkpointFunction).not.toMatch(/insert into public\.user_block_progress/i);
    expect(checkpointFunction).not.toMatch(/user_video_completion_history/i);
  });

  it("keeps server time as the observation baseline and client time only for checkpoint ordering", () => {
    expect(checkpointFunction).toMatch(
      /last_observed_position_seconds\s*,\s*last_observed_at[\s\S]*?checkpoint_client_updated_at\s*,\s*updated_at/i,
    );
    expect(checkpointFunction).toMatch(
      /least\(p_position_seconds[\s\S]*?\)\s*,[\s\S]*?'\[\]'::jsonb\s*,\s*0\s*,\s*null\s*,\s*v_asset_version\s*,\s*p_client_updated_at\s*,\s*v_now/i,
    );
    expect(checkpointFunction).toMatch(
      /last_observed_at\s*=\s*case[\s\S]*?then null[\s\S]*?updated_at\s*=\s*v_now/i,
    );
    expect(checkpointFunction).toMatch(
      /select checkpoint_client_updated_at\s*,\s*asset_version[\s\S]*?v_stored_asset_version[\s\S]*?distinct from v_asset_version[\s\S]*?v_existing_checkpoint_client_updated_at\s*:=\s*null/i,
    );
    expect(checkpointFunction).not.toMatch(
      /last_observed_at\s*,[\s\S]*?p_client_updated_at[\s\S]*?v_asset_version/i,
    );
    expect(playbackFunction).toMatch(
      /extract\(epoch from \(v_now - v_last_at\)\)/i,
    );
    expect(playbackFunction).toMatch(
      /last_observed_position_seconds\s*,\s*last_observed_at[\s\S]*?case when p_operation = 'observe' then v_observed_position else v_position end[\s\S]*?v_now/i,
    );
    expect(playbackFunction).toMatch(
      /checkpoint_client_updated_at\s*=\s*case[\s\S]*?p_operation = 'observe'[\s\S]*?greatest/i,
    );
    expect(playbackFunction).toMatch(
      /v_position\s*:=\s*greatest\([\s\S]*?v_resume_position[\s\S]*?v_observed_position/i,
    );
  });

  it("keeps the race regression and positive-skew SQL scenarios in the acceptance test", () => {
    const raceTest = readFileSync(
      resolve(process.cwd(), "supabase/tests/063_video_checkpoint_ordering.sql"),
      "utf8",
    );
    expect(raceTest).toMatch(/checkpoint arrival first/i);
    expect(raceTest).toMatch(/observation arrival first/i);
    expect(raceTest).toMatch(/positive client clock skew/i);
    expect(raceTest).toMatch(/watched_ranges/i);
    expect(raceTest).toMatch(/user_block_progress/i);
    expect(raceTest).toMatch(/asset replacement/i);
  });
});
