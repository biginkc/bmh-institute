import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260730120000_video_resume_checkpoint.sql"), "utf8");

describe("video resume checkpoint migration", () => {
  it("is authenticated, asset-bound, stale-safe, and cannot grant completion", () => {
    expect(sql).toMatch(/p_user_id is distinct from auth\.uid\(\)/i);
    expect(sql).toMatch(/p_client_updated_at[\s\S]*> v_now \+ interval '5 minutes'/i);
    expect(sql).toMatch(/v_existing_updated_at[\s\S]*>= p_client_updated_at/i);
    expect(sql).toMatch(/fn_lesson_is_unlocked\(p_user_id, v_lesson_id\)/i);
    expect(sql).not.toMatch(/insert into public\.user_block_progress/i);
    expect(sql).not.toMatch(/user_video_completion_history/i);
  });

  it("uses a resumed checkpoint as the next observation baseline without coverage", () => {
    const valuesClause = sql.slice(sql.indexOf("values ("));
    expect(sql).toMatch(
      /last_observed_position_seconds\s*,\s*last_observed_at/i,
    );
    expect(valuesClause).toMatch(
      /'\[\]'::jsonb\s*,\s*least\(p_position_seconds[\s\S]*?\)\s*,\s*p_client_updated_at/i,
    );
    expect(valuesClause).not.toMatch(
      /values\s*\([\s\S]*?'\[\]'::jsonb\s*,\s*0\s*,\s*null[\s\S]*?\)/i,
    );
    expect(sql).toMatch(
      /last_observed_position_seconds\s*=\s*excluded\.last_observed_position_seconds[\s\S]*?last_observed_at\s*=\s*excluded\.last_observed_at/i,
    );
  });
});
