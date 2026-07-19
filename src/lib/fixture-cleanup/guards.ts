import { readFile } from "node:fs/promises";

import { assertCanonicalSupabaseProjectUrl } from "@/lib/supabase/canonical-project-url";

const PROJECT_REF = "dhvfsyteqsxagokoerrx";
const MAX_ROLLBACK_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_APPROVAL_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_LIVE_VERIFICATION_AGE_MS = 60 * 60 * 1000;

export type ExecutionApproval = {
  project_ref: string;
  manifest_sha256: string;
  approved_by: string;
  approved_at: string;
  recorded_by: string;
  evidence_sha256: string;
  scope: string;
  authorization: string;
  signature_version: "hmac-sha256-v1";
  execution_id: string;
  controller_key_id: string;
  controller_signature: string;
};

export type FreshRollbackRecord = {
  project_ref: string;
  manifest_sha256: string;
  captured_at: string;
  backup_id: string;
  schema_sha256: string;
  data_sha256: string;
  storage_inventory_sha256: string;
  backup_provider: string;
  backup_project_ref: string;
  backup_status: string;
  backup_verified_live_at: string;
  backup_verified_by: string;
  backup_verification_evidence_sha256: string;
  restore_rehearsal_status: string;
  restore_rehearsal_backup_id: string;
  restore_rehearsed_at: string;
  restore_rehearsal_evidence_sha256: string;
  signature_version: "hmac-sha256-v1";
  execution_id: string;
  controller_key_id: string;
  controller_signature: string;
};

export type ControllerVerifiedCleanupEvidence = {
  approval: ExecutionApproval;
  rollback: FreshRollbackRecord;
};

const APPROVAL_KEYS = [
  "approved_at",
  "approved_by",
  "authorization",
  "controller_key_id",
  "controller_signature",
  "evidence_sha256",
  "execution_id",
  "manifest_sha256",
  "project_ref",
  "recorded_by",
  "scope",
  "signature_version",
] as const;

const ROLLBACK_KEYS = [
  "backup_id",
  "backup_project_ref",
  "backup_provider",
  "backup_status",
  "backup_verification_evidence_sha256",
  "backup_verified_by",
  "backup_verified_live_at",
  "captured_at",
  "controller_key_id",
  "controller_signature",
  "data_sha256",
  "execution_id",
  "manifest_sha256",
  "project_ref",
  "restore_rehearsal_backup_id",
  "restore_rehearsal_evidence_sha256",
  "restore_rehearsal_status",
  "restore_rehearsed_at",
  "schema_sha256",
  "signature_version",
  "storage_inventory_sha256",
] as const;

export function expectedProductionConfirmation(manifestSha256: string) {
  return `DELETE-EXACT-BMH-INSTITUTE-FIXTURES:${PROJECT_REF}:${manifestSha256}`;
}

export function assertProductionEnvironment(url: string) {
  try {
    assertCanonicalSupabaseProjectUrl(url, [PROJECT_REF]);
  } catch {
    throw new Error(
      `Refusing unexpected production URL. Expected ${PROJECT_REF}.supabase.co.`,
    );
  }
}

export function validateExecutionApproval(
  raw: unknown,
  manifestSha256: string,
  now = new Date(),
): ExecutionApproval {
  const value = raw as Partial<ExecutionApproval>;
  if (
    !value ||
    !hasExactKeys(value, APPROVAL_KEYS) ||
    value.project_ref !== PROJECT_REF ||
    value.manifest_sha256 !== manifestSha256 ||
    value.approved_by !== "Jarrad Henry" ||
    value.recorded_by !== "controller" ||
    !isSha256(value.evidence_sha256) ||
    value.scope !== "fixture_cleanup_after_real_course_acceptance" ||
    value.authorization !== "execute" ||
    value.signature_version !== "hmac-sha256-v1" ||
    !isExecutionId(value.execution_id) ||
    !isControllerKeyId(value.controller_key_id) ||
    !isSha256(value.controller_signature)
  ) {
    throw new Error(
      "Execution approval does not authorize this exact fixture manifest.",
    );
  }
  assertFreshTimestamp(value.approved_at, "approval", MAX_APPROVAL_AGE_MS, now);
  return value as ExecutionApproval;
}

export function validateFreshRollbackRecord(
  raw: unknown,
  manifestSha256: string,
  now = new Date(),
): FreshRollbackRecord {
  const value = raw as Partial<FreshRollbackRecord>;
  if (
    !value ||
    !hasExactKeys(value, ROLLBACK_KEYS) ||
    value.project_ref !== PROJECT_REF ||
    value.manifest_sha256 !== manifestSha256 ||
    !value.backup_id ||
    value.backup_provider !== "supabase" ||
    value.backup_project_ref !== PROJECT_REF ||
    value.backup_status !== "COMPLETED" ||
    value.backup_verified_by !== "controller" ||
    !isSha256(value.backup_verification_evidence_sha256) ||
    value.restore_rehearsal_status !== "passed" ||
    value.restore_rehearsal_backup_id !== value.backup_id ||
    !isSha256(value.restore_rehearsal_evidence_sha256) ||
    !isSha256(value.schema_sha256) ||
    !isSha256(value.data_sha256) ||
    !isSha256(value.storage_inventory_sha256) ||
    value.signature_version !== "hmac-sha256-v1" ||
    !isExecutionId(value.execution_id) ||
    !isControllerKeyId(value.controller_key_id) ||
    !isSha256(value.controller_signature)
  ) {
    throw new Error(
      "Rollback record is incomplete or belongs to a different cleanup boundary.",
    );
  }
  const capturedAt = assertFreshTimestamp(
    value.captured_at,
    "rollback",
    MAX_ROLLBACK_AGE_MS,
    now,
  );
  const verifiedAt = assertFreshTimestamp(
    value.backup_verified_live_at,
    "live backup verification",
    MAX_LIVE_VERIFICATION_AGE_MS,
    now,
  );
  const rehearsedAt = assertFreshTimestamp(
    value.restore_rehearsed_at,
    "restore rehearsal",
    MAX_ROLLBACK_AGE_MS,
    now,
  );
  if (verifiedAt < capturedAt || rehearsedAt < capturedAt) {
    throw new Error(
      "Backup verification and restore rehearsal must follow the recorded capture.",
    );
  }
  return value as FreshRollbackRecord;
}

export function validateControllerVerifiedCleanupEvidence(
  rawApproval: unknown,
  rawRollback: unknown,
  manifestSha256: string,
  now = new Date(),
): ControllerVerifiedCleanupEvidence {
  const approval = validateExecutionApproval(rawApproval, manifestSha256, now);
  const rollback = validateFreshRollbackRecord(
    rawRollback,
    manifestSha256,
    now,
  );
  if (approval.controller_key_id !== rollback.controller_key_id) {
    throw new Error(
      "Approval and rollback evidence must use the same controller key.",
    );
  }
  if (approval.execution_id !== rollback.execution_id) {
    throw new Error("Approval and rollback evidence must use the same execution id.");
  }
  const approvedAt = assertValidTimestamp(approval.approved_at, "approval");
  const verifiedAt = assertValidTimestamp(
    rollback.backup_verified_live_at,
    "live backup verification",
  );
  const rehearsedAt = assertValidTimestamp(
    rollback.restore_rehearsed_at,
    "restore rehearsal",
  );
  if (approvedAt < verifiedAt || approvedAt < rehearsedAt) {
    throw new Error(
      "Cleanup approval must follow backup verification and restore rehearsal.",
    );
  }
  return { approval, rollback };
}

export async function readJsonFile(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function assertValidTimestamp(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} timestamp is required.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()))
    throw new Error(`${label} timestamp is invalid.`);
  return parsed;
}

function assertFreshTimestamp(
  value: string | undefined,
  label: string,
  maxAgeMs: number,
  now: Date,
) {
  const parsed = assertValidTimestamp(value, label);
  const age = now.valueOf() - parsed.valueOf();
  if (age < 0 || age > maxAgeMs) {
    throw new Error(`${label} timestamp is not fresh enough for execution.`);
  }
  return parsed;
}

function isSha256(value: string | undefined) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isControllerKeyId(value: string | undefined) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
}

function isExecutionId(value: string | undefined) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  );
}

function hasExactKeys(value: object, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}
