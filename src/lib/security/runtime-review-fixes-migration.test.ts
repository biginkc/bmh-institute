import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/022_runtime_review_fixes.sql",
  ),
  "utf8",
);

describe("runtime review fixes migration", () => {
  it("uses only direct access or an eligible accessible program path", () => {
    expect(sql).toMatch(/join public\.course_access ca[\s\S]*ca\.course_id = v_course_id/i);
    expect(sql).toMatch(/join public\.program_access pa[\s\S]*pc_current\.course_id = v_course_id/i);
    expect(sql).toMatch(/p\.course_order_mode = 'free'[\s\S]*or not exists/i);
    expect(sql).toMatch(/pc_prior\.program_id = pc_current\.program_id/i);
    expect(sql).toContain("if not v_has_eligible_program_path then");
  });

  it("keeps caller authorization and function execution locked down", () => {
    expect(sql).toContain("p_user_id is distinct from auth.uid()");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(/revoke all on function public\.fn_lesson_is_unlocked\(uuid, uuid\) from public/i);
    expect(sql).toMatch(/grant execute on function public\.fn_lesson_is_unlocked\(uuid, uuid\)[\s\S]*authenticated, service_role/i);
  });
});
