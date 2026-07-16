import { describe, expect, it } from "vitest";

import {
  assertProductionEnvironment,
  expectedProductionConfirmation,
  validateExecutionApproval,
  validateFreshRollbackRecord,
} from "./guards";

describe("fixture cleanup execution guards", () => {
  const hash = "a".repeat(64);

  it("binds the confirmation to the production project and exact manifest", () => {
    expect(expectedProductionConfirmation(hash)).toBe(
      `DELETE-EXACT-BMH-INSTITUTE-FIXTURES:dhvfsyteqsxagokoerrx:${hash}`,
    );
    expect(() => assertProductionEnvironment("https://example.supabase.co")).toThrow(
      /unexpected production URL/i,
    );
    expect(() =>
      assertProductionEnvironment("https://dhvfsyteqsxagokoerrx.supabase.co.evil.example"),
    ).toThrow(/unexpected production URL/i);
  });

  it("requires an exact separate human approval record", () => {
    expect(() =>
      validateExecutionApproval(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          approved_by: "Someone Else",
          approved_at: "2026-07-16T20:00:00Z",
          scope: "fixture_cleanup_after_real_course_acceptance",
          authorization: "execute",
        },
        hash,
      ),
    ).toThrow(/does not authorize/i);
  });

  it("rejects stale rollback records", () => {
    expect(() =>
      validateFreshRollbackRecord(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          captured_at: "2026-07-14T20:00:00Z",
          backup_id: "backup",
          schema_sha256: hash,
          data_sha256: hash,
          storage_inventory_sha256: hash,
        },
        hash,
        new Date("2026-07-16T20:00:00Z"),
      ),
    ).toThrow(/previous 24 hours/i);
  });
});
