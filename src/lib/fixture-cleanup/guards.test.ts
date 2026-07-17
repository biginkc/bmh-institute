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

  it.each([
    "http://dhvfsyteqsxagokoerrx.supabase.co",
    "https://user:password@dhvfsyteqsxagokoerrx.supabase.co",
    "https://dhvfsyteqsxagokoerrx.supabase.co:443",
    "https://dhvfsyteqsxagokoerrx.supabase.co/storage/v1",
    "https://dhvfsyteqsxagokoerrx.supabase.co?execute=true",
    "https://dhvfsyteqsxagokoerrx.supabase.co#production",
    "not-a-url",
  ])("rejects a non-canonical cleanup URL %s", (url) => {
    expect(() => assertProductionEnvironment(url)).toThrow(/unexpected production URL/i);
  });

  it("requires an exact separate human approval record", () => {
    expect(() =>
      validateExecutionApproval(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          approved_by: "Someone Else",
          approved_at: "2026-07-16T20:00:00Z",
          recorded_by: "controller",
          evidence_sha256: hash,
          scope: "fixture_cleanup_after_real_course_acceptance",
          authorization: "execute",
        },
        hash,
      ),
    ).toThrow(/does not authorize/i);
  });

  it("rejects stale approval evidence", () => {
    expect(() =>
      validateExecutionApproval(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          approved_by: "Jarrad Henry",
          approved_at: "2026-07-14T20:00:00Z",
          recorded_by: "controller",
          evidence_sha256: hash,
          scope: "fixture_cleanup_after_real_course_acceptance",
          authorization: "execute",
        },
        hash,
        new Date("2026-07-16T20:00:00Z"),
      ),
    ).toThrow(/not fresh/i);
  });

  it("accepts only fresh controller-recorded approval evidence", () => {
    expect(
      validateExecutionApproval(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          approved_by: "Jarrad Henry",
          approved_at: "2026-07-16T19:30:00Z",
          recorded_by: "controller",
          evidence_sha256: hash,
          scope: "fixture_cleanup_after_real_course_acceptance",
          authorization: "execute",
        },
        hash,
        new Date("2026-07-16T20:00:00Z"),
      ),
    ).toEqual(expect.objectContaining({ authorization: "execute" }));
  });

  it("rejects stale rollback records", () => {
    expect(() =>
      validateFreshRollbackRecord(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          captured_at: "2026-07-14T20:00:00Z",
          backup_id: "backup",
          backup_provider: "supabase",
          backup_project_ref: "dhvfsyteqsxagokoerrx",
          backup_status: "COMPLETED",
          backup_verified_live_at: "2026-07-16T20:00:00Z",
          backup_verified_by: "controller",
          backup_verification_evidence_sha256: hash,
          restore_rehearsal_status: "passed",
          restore_rehearsal_backup_id: "backup",
          restore_rehearsed_at: "2026-07-16T19:00:00Z",
          restore_rehearsal_evidence_sha256: hash,
          schema_sha256: hash,
          data_sha256: hash,
          storage_inventory_sha256: hash,
        },
        hash,
        new Date("2026-07-16T20:00:00Z"),
      ),
    ).toThrow(/not fresh/i);
  });

  it("rejects unverified backup metadata even when the hashes look valid", () => {
    expect(() =>
      validateFreshRollbackRecord(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          captured_at: "2026-07-16T19:00:00Z",
          backup_id: "does-not-exist",
          backup_provider: "supabase",
          backup_project_ref: "dhvfsyteqsxagokoerrx",
          backup_status: "UNVERIFIED",
          backup_verified_live_at: "2026-07-16T20:00:00Z",
          backup_verified_by: "controller",
          backup_verification_evidence_sha256: hash,
          restore_rehearsal_status: "passed",
          restore_rehearsal_backup_id: "does-not-exist",
          restore_rehearsed_at: "2026-07-16T19:00:00Z",
          restore_rehearsal_evidence_sha256: hash,
          schema_sha256: hash,
          data_sha256: hash,
          storage_inventory_sha256: hash,
        },
        hash,
        new Date("2026-07-16T20:00:00Z"),
      ),
    ).toThrow(/incomplete/i);
  });

  it("accepts fresh controller-verified backup and rehearsal proof", () => {
    expect(
      validateFreshRollbackRecord(
        {
          project_ref: "dhvfsyteqsxagokoerrx",
          manifest_sha256: hash,
          captured_at: "2026-07-16T19:00:00Z",
          backup_id: "verified-backup",
          backup_provider: "supabase",
          backup_project_ref: "dhvfsyteqsxagokoerrx",
          backup_status: "COMPLETED",
          backup_verified_live_at: "2026-07-16T19:45:00Z",
          backup_verified_by: "controller",
          backup_verification_evidence_sha256: hash,
          restore_rehearsal_status: "passed",
          restore_rehearsal_backup_id: "verified-backup",
          restore_rehearsed_at: "2026-07-16T19:30:00Z",
          restore_rehearsal_evidence_sha256: hash,
          schema_sha256: hash,
          data_sha256: hash,
          storage_inventory_sha256: hash,
        },
        hash,
        new Date("2026-07-16T20:00:00Z"),
      ),
    ).toEqual(expect.objectContaining({ backup_status: "COMPLETED" }));
  });
});
