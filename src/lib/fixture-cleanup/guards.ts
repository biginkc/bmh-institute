import { readFile } from "node:fs/promises";

const PROJECT_REF = "dhvfsyteqsxagokoerrx";
const MAX_ROLLBACK_AGE_MS = 24 * 60 * 60 * 1000;

export type ExecutionApproval = {
  project_ref: string;
  manifest_sha256: string;
  approved_by: string;
  approved_at: string;
  scope: string;
  authorization: string;
};

export type FreshRollbackRecord = {
  project_ref: string;
  manifest_sha256: string;
  captured_at: string;
  backup_id: string;
  schema_sha256: string;
  data_sha256: string;
  storage_inventory_sha256: string;
};

export function expectedProductionConfirmation(manifestSha256: string) {
  return `DELETE-EXACT-BMH-INSTITUTE-FIXTURES:${PROJECT_REF}:${manifestSha256}`;
}

export function assertProductionEnvironment(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== `${PROJECT_REF}.supabase.co`) {
    throw new Error(`Refusing unexpected production URL. Expected ${PROJECT_REF}.supabase.co.`);
  }
}

export function validateExecutionApproval(
  raw: unknown,
  manifestSha256: string,
): ExecutionApproval {
  const value = raw as Partial<ExecutionApproval>;
  if (
    !value ||
    value.project_ref !== PROJECT_REF ||
    value.manifest_sha256 !== manifestSha256 ||
    value.approved_by !== "Jarrad Henry" ||
    value.scope !== "fixture_cleanup_after_real_course_acceptance" ||
    value.authorization !== "execute"
  ) {
    throw new Error("Execution approval does not authorize this exact fixture manifest.");
  }
  assertValidTimestamp(value.approved_at, "approval");
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
    value.project_ref !== PROJECT_REF ||
    value.manifest_sha256 !== manifestSha256 ||
    !value.backup_id ||
    !isSha256(value.schema_sha256) ||
    !isSha256(value.data_sha256) ||
    !isSha256(value.storage_inventory_sha256)
  ) {
    throw new Error("Rollback record is incomplete or belongs to a different cleanup boundary.");
  }
  const capturedAt = assertValidTimestamp(value.captured_at, "rollback");
  const age = now.valueOf() - capturedAt.valueOf();
  if (age < 0 || age > MAX_ROLLBACK_AGE_MS) {
    throw new Error("Rollback record must be a fresh capture from the previous 24 hours.");
  }
  return value as FreshRollbackRecord;
}

export async function readJsonFile(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function assertValidTimestamp(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} timestamp is required.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} timestamp is invalid.`);
  return parsed;
}

function isSha256(value: string | undefined) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
