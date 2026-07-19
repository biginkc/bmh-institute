import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/042_shorten_reviewer_cleanup_helper.sql",
  ),
  "utf8",
);

describe("reviewer cleanup helper name", () => {
  it("renames the exact truncated v041 helper and updates the public wrapper", () => {
    expect(sql).toMatch(
      /alter function private\."fn_cleanup_unreleased_import_reviewer_evidence_v040_without_sto"\(text, uuid\)[\s\S]*rename to fn_cleanup_reviewer_evidence_v040/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.fn_cleanup_unreleased_import_reviewer_evidence_v1[\s\S]*private\.fn_cleanup_reviewer_evidence_v040\(/i,
    );
    for (const identifier of sql.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
      expect(identifier[0].length).toBeLessThanOrEqual(63);
    }
  });
});
