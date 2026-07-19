import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/028_atomic_role_play_completion.sql"),
  "utf8",
);

describe("atomic role-play completion migration", () => {
  it("keeps the mutation service-only and transactional", () => {
    expect(sql).toMatch(/auth\.role\(\) <> 'service_role'/);
    expect(sql).toMatch(/active learner is required/);
    expect(sql).toMatch(/fn_lesson_is_unlocked\(p_user_id, v_lesson_id\)/);
    expect(sql).toMatch(/block_type = 'role_play'/);
    expect(sql).toMatch(/content ->> 'scenario_id' = p_scenario_id/);
    expect(sql).toMatch(/insert into public\.role_play_results/);
    expect(sql).toMatch(/insert into public\.user_block_progress/);
    expect(sql).toMatch(
      /revoke all on function public\.fn_complete_role_play_block[\s\S]*from authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_complete_role_play_block[\s\S]*to service_role/,
    );
  });

  it("fails closed on conflicting retries and reports progress idempotency", () => {
    expect(sql).toMatch(/already bound to different result data/);
    expect(sql).toMatch(/on conflict \(user_id, attempt_id\) do nothing/);
    expect(sql).toMatch(/on conflict \(user_id, block_id\) do nothing/);
    expect(sql).toMatch(
      /'alreadyMarked', not coalesce\(v_progress_created, false\)/,
    );
  });
});
