import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/050_atomic_quiz_answer_recording.sql",
  ),
  "utf8",
);

describe("atomic quiz answer recording migration", () => {
  it("keeps ownership, row locking, and answer cardinality in the database boundary", () => {
    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/i);
    expect(sql).toMatch(/where attempt\.id = p_attempt_id[\s\S]*for update/i);
    expect(sql).toMatch(/auth\.uid\(\) = v_attempt\.user_id/i);
    expect(sql).toMatch(
      /v_question_type <> 'multi_select' and cardinality\(p_selected\) <> 1/i,
    );
    expect(sql).toMatch(/v_attempt\.answer_orders -> p_question_id::text/i);
  });

  it("does not expose the RPC to anonymous callers", () => {
    expect(sql).toMatch(
      /revoke all on function public\.fn_record_quiz_answer\(uuid, uuid, text\[\]\)[\s\S]*from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_record_quiz_answer\(uuid, uuid, text\[\]\)[\s\S]*to authenticated, service_role/i,
    );
  });
});
