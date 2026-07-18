import { describe, expect, it } from "vitest";

import {
  assertProductionEnvironment,
  expectedProductionConfirmation,
  validateControllerVerifiedCleanupEvidence,
  validateExecutionApproval,
  validateFreshRollbackRecord,
  type ExecutionApproval,
  type FreshRollbackRecord,
} from "./guards";

describe("fixture cleanup execution guards", () => {
  const hash = "a".repeat(64);
  const signature = "b".repeat(64);
  const now = new Date("2026-07-16T20:00:00Z");

  it("binds the confirmation to the production project and exact manifest", () => {
    expect(expectedProductionConfirmation(hash)).toBe(
      `DELETE-EXACT-BMH-INSTITUTE-FIXTURES:dhvfsyteqsxagokoerrx:${hash}`,
    );
    expect(() =>
      assertProductionEnvironment("https://example.supabase.co"),
    ).toThrow(/unexpected production URL/i);
    expect(() =>
      assertProductionEnvironment(
        "https://dhvfsyteqsxagokoerrx.supabase.co.evil.example",
      ),
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
    expect(() => assertProductionEnvironment(url)).toThrow(
      /unexpected production URL/i,
    );
  });

  it("requires an exact signed human approval record", () => {
    expect(() =>
      validateExecutionApproval(
        approval({ approved_by: "Someone Else" }),
        hash,
        now,
      ),
    ).toThrow(/does not authorize/i);
    expect(() =>
      validateExecutionApproval(
        { ...approval(), unsigned_extra_field: true },
        hash,
        now,
      ),
    ).toThrow(/does not authorize/i);
    expect(() =>
      validateExecutionApproval(
        approval({ controller_signature: "not-a-signature" }),
        hash,
        now,
      ),
    ).toThrow(/does not authorize/i);
  });

  it("rejects stale approval evidence", () => {
    expect(() =>
      validateExecutionApproval(
        approval({ approved_at: "2026-07-14T20:00:00Z" }),
        hash,
        now,
      ),
    ).toThrow(/not fresh/i);
  });

  it("accepts the exact signed approval envelope for database verification", () => {
    expect(validateExecutionApproval(approval(), hash, now)).toEqual(
      expect.objectContaining({
        authorization: "execute",
        signature_version: "hmac-sha256-v1",
        controller_key_id: "controller-v1",
      }),
    );
  });

  it("rejects stale or unsigned rollback records", () => {
    expect(() =>
      validateFreshRollbackRecord(
        rollback({ captured_at: "2026-07-14T20:00:00Z" }),
        hash,
        now,
      ),
    ).toThrow(/not fresh/i);
    expect(() =>
      validateFreshRollbackRecord(
        rollback({ controller_signature: "forged" }),
        hash,
        now,
      ),
    ).toThrow(/incomplete/i);
  });

  it("rejects unverified backup metadata even when the hashes look valid", () => {
    expect(() =>
      validateFreshRollbackRecord(
        rollback({
          backup_id: "does-not-exist",
          backup_status: "UNVERIFIED",
          restore_rehearsal_backup_id: "does-not-exist",
        }),
        hash,
        now,
      ),
    ).toThrow(/incomplete/i);
  });

  it("requires matching controller keys and approval after backup proof", () => {
    expect(() =>
      validateControllerVerifiedCleanupEvidence(
        approval(),
        rollback({ controller_key_id: "controller-v2" }),
        hash,
        now,
      ),
    ).toThrow(/same controller key/i);
    expect(() =>
      validateControllerVerifiedCleanupEvidence(
        approval(),
        rollback({ execution_id: "11111111-1111-4111-8111-111111111111" }),
        hash,
        now,
      ),
    ).toThrow(/same execution id/i);
    expect(() =>
      validateControllerVerifiedCleanupEvidence(
        approval({ approved_at: "2026-07-16T19:20:00Z" }),
        rollback(),
        hash,
        now,
      ),
    ).toThrow(/must follow/i);
  });

  it("accepts only an exact ordered pair for database signature verification", () => {
    expect(
      validateControllerVerifiedCleanupEvidence(
        approval(),
        rollback(),
        hash,
        now,
      ),
    ).toEqual({ approval: approval(), rollback: rollback() });
  });

  function approval(
    overrides: Partial<ExecutionApproval> = {},
  ): ExecutionApproval {
    return {
      project_ref: "dhvfsyteqsxagokoerrx",
      manifest_sha256: hash,
      approved_by: "Jarrad Henry",
      approved_at: "2026-07-16T19:50:00Z",
      recorded_by: "controller",
      evidence_sha256: hash,
      scope: "fixture_cleanup_after_real_course_acceptance",
      authorization: "execute",
      signature_version: "hmac-sha256-v1",
      execution_id: "00000000-0000-4000-8000-000000000036",
      controller_key_id: "controller-v1",
      controller_signature: signature,
      ...overrides,
    };
  }

  function rollback(
    overrides: Partial<FreshRollbackRecord> = {},
  ): FreshRollbackRecord {
    return {
      project_ref: "dhvfsyteqsxagokoerrx",
      manifest_sha256: hash,
      captured_at: "2026-07-16T19:00:00Z",
      backup_id: "verified-backup",
      backup_provider: "supabase",
      backup_project_ref: "dhvfsyteqsxagokoerrx",
      backup_status: "COMPLETED",
      backup_verified_live_at: "2026-07-16T19:30:00Z",
      backup_verified_by: "controller",
      backup_verification_evidence_sha256: hash,
      restore_rehearsal_status: "passed",
      restore_rehearsal_backup_id: "verified-backup",
      restore_rehearsed_at: "2026-07-16T19:40:00Z",
      restore_rehearsal_evidence_sha256: hash,
      schema_sha256: hash,
      data_sha256: hash,
      storage_inventory_sha256: hash,
      signature_version: "hmac-sha256-v1",
      execution_id: "00000000-0000-4000-8000-000000000036",
      controller_key_id: "controller-v1",
      controller_signature: signature,
      ...overrides,
    };
  }
});
