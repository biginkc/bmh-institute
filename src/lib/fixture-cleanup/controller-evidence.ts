import { createHmac } from "node:crypto";

export const APPROVAL_TIMESTAMP_FIELDS = ["approved_at"] as const;
export const ROLLBACK_TIMESTAMP_FIELDS = [
  "backup_verified_live_at",
  "captured_at",
  "restore_rehearsed_at",
] as const;

const EXACT_UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DOMAINS = {
  approval: "fixture-cleanup-approval-v1:",
  rollback: "fixture-cleanup-rollback-v1:",
} as const;

export type ControllerEvidenceKind = keyof typeof DOMAINS;
export type UnsignedControllerEvidence = Record<string, string>;

export function canonicalizeControllerEvidence(
  evidence: UnsignedControllerEvidence,
  timestampFields: readonly string[],
) {
  const timestamps = new Set(timestampFields);
  const entries = Object.entries(evidence)
    .filter(([key]) => key !== "controller_signature")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string") {
      throw new Error(`Controller evidence field ${key} must be a string.`);
    }
    if (timestamps.has(key)) {
      if (!EXACT_UTC_MILLISECONDS.test(value)) {
        throw new Error(
          `Controller evidence field ${key} must be an exact UTC timestamp with milliseconds.`,
        );
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
        throw new Error(
          `Controller evidence field ${key} must be an exact UTC timestamp with milliseconds.`,
        );
      }
    }
    normalized[key] = value;
  }
  return JSON.stringify(normalized);
}

export function signControllerEvidence(
  kind: ControllerEvidenceKind,
  evidence: UnsignedControllerEvidence,
  secret: string,
) {
  if (secret.length < 32 || secret.length > 512) {
    throw new Error("Controller HMAC secret must contain 32 to 512 characters.");
  }
  const timestampFields =
    kind === "approval" ? APPROVAL_TIMESTAMP_FIELDS : ROLLBACK_TIMESTAMP_FIELDS;
  return createHmac("sha256", secret)
    .update(DOMAINS[kind])
    .update(canonicalizeControllerEvidence(evidence, timestampFields))
    .digest("hex");
}
