import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/041_reviewer_evidence_storage_cleanup.sql",
  ),
  "utf8",
);

describe("reviewer evidence storage cleanup", () => {
  it("wraps the exact v040 cleanup in the storage API deletion guard", () => {
    expect(sql).toMatch(
      /alter function public\.fn_cleanup_unreleased_import_reviewer_evidence_v1\(text, uuid\)[\s\S]*set schema private[\s\S]*rename to fn_cleanup_unreleased_import_reviewer_evidence_v040_without_storage_guard/i,
    );
    expect(sql).toMatch(
      /revoke all on function private\.fn_cleanup_unreleased_import_reviewer_evidence_v040_without_storage_guard\(text, uuid\)[\s\S]*from public, anon, authenticated, service_role/i,
    );
    const wrapper = sql.match(
      /create function public\.fn_cleanup_unreleased_import_reviewer_evidence_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(wrapper).toMatch(
      /auth\.role\(\)[\s\S]*<> 'service_role'[\s\S]*set_config\('storage\.allow_delete_query', 'true', true\)[\s\S]*private\.fn_cleanup_unreleased_import_reviewer_evidence_v040_without_storage_guard\([\s\S]*set_config\('storage\.allow_delete_query', 'false', true\)/i,
    );
    expect(wrapper.match(/storage\.allow_delete_query/g)).toHaveLength(2);
  });
});
