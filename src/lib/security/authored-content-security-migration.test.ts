import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260730100000_authored_content_security.sql"),
  "utf8",
);

describe("authored content security migration", () => {
  it("is additive, forward-only, and protects new writes without repairing legacy rows", () => {
    expect(sql).toMatch(/not valid/i);
    expect(sql).toMatch(/octet_length\(p_content::text\) > 102400/i);
    expect(sql).toMatch(/jsonb_array_length\(p_content->'cards'\) > 100/i);
    expect(sql).toMatch(/length\(v_card->>'front'\) > 2000/i);
    expect(sql).toMatch(/create trigger content_blocks_validate_authored_content/i);
    expect(sql).not.toMatch(/delete from public\.content_blocks|update public\.content_blocks[\s\S]*set content/i);
  });
});
