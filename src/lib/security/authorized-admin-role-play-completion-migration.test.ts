import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727144500_allow_authorized_admin_role_play_completion.sql",
  ),
  "utf8",
);

function expectSqlClauses(...clauses: string[]) {
  for (const clause of clauses) expect(sql).toContain(clause);
}

describe("authorized administrator role-play completion", () => {
  it("admits active learners and only catalog-authorized owners or admins", () => {
    const authorization = sql.match(
      /if not exists \([\s\S]*?active learner or authorized administrator is required/,
    )?.[0];

    expect(authorization).toBeDefined();
    expect(authorization).toMatch(/profile\.status = 'active'/);
    expect(authorization).toMatch(/profile\.system_role = 'learner'/);
    expect(authorization).toMatch(
      /profile\.system_role in \('owner', 'admin'\)/,
    );
    expect(authorization).toMatch(
      /private\.fn_user_may_access_catalog_entity_v1\(\s*p_user_id,\s*'content_blocks',\s*p_block_id\s*\)/,
    );
  });

  it("retains the service-only, exact-block, unlock, and replay guards", () => {
    expectSqlClauses(
      "coalesce(auth.role(), '') <> 'service_role'",
      "block.block_type = 'role_play'",
      "block.content ->> 'scenario_id' = p_scenario_id",
      "public.fn_lesson_is_unlocked(p_user_id, v_lesson_id)",
      "role play attempt is already bound to different result data",
      "on conflict (user_id, attempt_id) do nothing",
      "on conflict (user_id, block_id) do nothing",
    );
  });

  it("keeps the mutation unavailable to browsers", () => {
    expect(sql).toMatch(
      /revoke all on function public\.fn_complete_role_play_block[\s\S]*from public, anon, authenticated;[\s\S]*grant execute on function public\.fn_complete_role_play_block[\s\S]*to service_role;/,
    );
  });
});
