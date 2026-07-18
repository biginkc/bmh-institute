import { describe, expect, it } from "vitest";

import {
  APPROVAL_TIMESTAMP_FIELDS,
  ROLLBACK_TIMESTAMP_FIELDS,
  canonicalizeControllerEvidence,
  signControllerEvidence,
} from "./controller-evidence";

const secret = "fixture-cleanup-golden-secret-0001";

describe("fixture cleanup controller evidence", () => {
  it("matches the PostgreSQL golden canonical bytes and HMACs", () => {
    const approval = {
      approved_at: "2026-07-18T15:04:05.006Z",
      approved_by: "Jarrad Henry",
      authorization: "execute",
      controller_key_id: "golden-v1",
      evidence_sha256: "6".repeat(64),
      execution_id: "00000000-0000-4000-8000-000000000036",
      manifest_sha256: "8".repeat(64),
      project_ref: "dhvfsyteqsxagokoerrx",
      recorded_by: "controller",
      scope: "fixture_cleanup_after_real_course_acceptance",
      signature_version: "hmac-sha256-v1",
    };
    const rollback = {
      backup_id: "2026-07-18-backup",
      backup_project_ref: "dhvfsyteqsxagokoerrx",
      backup_provider: "supabase",
      backup_status: "COMPLETED",
      backup_verification_evidence_sha256: "4".repeat(64),
      backup_verified_by: "controller",
      backup_verified_live_at: "2026-07-18T14:54:05.006Z",
      captured_at: "2026-07-18T14:34:05.006Z",
      controller_key_id: "golden-v1",
      data_sha256: "2".repeat(64),
      execution_id: "00000000-0000-4000-8000-000000000036",
      manifest_sha256: "8".repeat(64),
      project_ref: "dhvfsyteqsxagokoerrx",
      restore_rehearsal_backup_id: "2026-07-18-backup",
      restore_rehearsal_evidence_sha256: "5".repeat(64),
      restore_rehearsal_status: "passed",
      restore_rehearsed_at: "2026-07-18T14:59:05.006Z",
      schema_sha256: "1".repeat(64),
      signature_version: "hmac-sha256-v1",
      storage_inventory_sha256: "3".repeat(64),
    };

    expect(canonicalizeControllerEvidence(approval, APPROVAL_TIMESTAMP_FIELDS)).toBe(
      '{"approved_at":"2026-07-18T15:04:05.006Z","approved_by":"Jarrad Henry","authorization":"execute","controller_key_id":"golden-v1","evidence_sha256":"6666666666666666666666666666666666666666666666666666666666666666","execution_id":"00000000-0000-4000-8000-000000000036","manifest_sha256":"8888888888888888888888888888888888888888888888888888888888888888","project_ref":"dhvfsyteqsxagokoerrx","recorded_by":"controller","scope":"fixture_cleanup_after_real_course_acceptance","signature_version":"hmac-sha256-v1"}',
    );
    expect(canonicalizeControllerEvidence(rollback, ROLLBACK_TIMESTAMP_FIELDS)).toContain(
      '"backup_id":"2026-07-18-backup"',
    );
    expect(signControllerEvidence("approval", approval, secret)).toBe(
      "2b0b5336bea14729e8721ac57032c0a13c159f437897e3e633a723ff4d956405",
    );
    expect(signControllerEvidence("rollback", rollback, secret)).toBe(
      "dde623f6e58b92139308d3a8d43f38b83338d8978288452379bef31dccbcab42",
    );
  });

  it("normalizes only declared timestamp fields and requires exact UTC milliseconds", () => {
    expect(() =>
      canonicalizeControllerEvidence(
        { approved_at: "2026-07-18 15:04:05+00" },
        APPROVAL_TIMESTAMP_FIELDS,
      ),
    ).toThrow(/UTC timestamp/i);
    expect(
      canonicalizeControllerEvidence(
        {
          approved_at: "2026-07-18T15:04:05.006Z",
          backup_id: "2026-07-18-backup",
        },
        APPROVAL_TIMESTAMP_FIELDS,
      ),
    ).toContain('"backup_id":"2026-07-18-backup"');
  });
});
