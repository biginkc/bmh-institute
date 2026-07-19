import { createHash } from "node:crypto";

export const EMPTY_PRODUCTION_RECORD = Object.freeze({
  status: "not-produced",
  generated_at: null,
  generated_by: null,
  generation_call_id: null,
  source_sha256: null,
  flat_master_sha256: null,
  review_decision: null,
  reviewed_at: null,
  reviewed_by: null,
  review_evidence: null,
});

export function createEmptyProductionRecord() {
  return { ...EMPTY_PRODUCTION_RECORD };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateProductionRecord(
  record,
  label = "production record",
  { expectedGenerationCallId = null } = {},
) {
  const requiredKeys = Object.keys(EMPTY_PRODUCTION_RECORD);
  if (
    typeof record !== "object" ||
    record === null ||
    Array.isArray(record) ||
    Object.keys(record).length !== requiredKeys.length
  ) {
    throw new Error(`${label} must contain exactly the production record fields`);
  }
  for (const key of requiredKeys) {
    if (!(key in record)) {
      throw new Error(`${label} is missing ${key}`);
    }
  }

  const generationFields = [
    "generated_at",
    "generated_by",
    "generation_call_id",
    "source_sha256",
    "flat_master_sha256",
  ];
  const reviewFields = [
    "review_decision",
    "reviewed_at",
    "reviewed_by",
    "review_evidence",
  ];
  const assertNull = (fields) => {
    for (const field of fields) {
      if (record[field] !== null) {
        throw new Error(`${label} ${field} must be null while ${record.status}`);
      }
    }
  };
  const assertString = (fields) => {
    for (const field of fields) {
      if (typeof record[field] !== "string" || record[field].length === 0) {
        throw new Error(`${label} ${field} must be a non-empty string`);
      }
    }
  };

  if (record.status === "not-produced") {
    assertNull([...generationFields, ...reviewFields]);
    return;
  }

  if (record.status === "produced-awaiting-review") {
    assertString(generationFields);
    assertNull(reviewFields);
  } else if (record.status === "reviewed") {
    assertString([...generationFields, ...reviewFields]);
    if (!["approved", "changes_requested"].includes(record.review_decision)) {
      throw new Error(`${label} review_decision must be approved or changes_requested`);
    }
  } else {
    throw new Error(`${label} has unsupported status ${record.status}`);
  }

  for (const field of ["source_sha256", "flat_master_sha256"]) {
    if (!/^[a-f0-9]{64}$/.test(record[field])) {
      throw new Error(`${label} ${field} must be a lowercase SHA-256`);
    }
  }
  if (record.source_sha256 === record.flat_master_sha256) {
    throw new Error(`${label} source and flat-master SHA-256 values must differ`);
  }
  for (const field of ["generated_at", ...(record.status === "reviewed" ? ["reviewed_at"] : [])]) {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record[field]) ||
      !Number.isFinite(Date.parse(record[field]))
    ) {
      throw new Error(`${label} ${field} must be an ISO UTC timestamp`);
    }
  }
  if (
    record.status === "reviewed" &&
    Date.parse(record.reviewed_at) < Date.parse(record.generated_at)
  ) {
    throw new Error(`${label} reviewed_at cannot precede generated_at`);
  }
  if (
    expectedGenerationCallId !== null &&
    record.generation_call_id !== expectedGenerationCallId
  ) {
    throw new Error(`${label} generation_call_id does not match the planned call`);
  }
  if (
    record.status === "reviewed" &&
    (record.review_evidence.startsWith("/") ||
      record.review_evidence.includes("..") ||
      record.review_evidence.includes("\\"))
  ) {
    throw new Error(`${label} review_evidence must be a safe repository-relative path`);
  }
}
