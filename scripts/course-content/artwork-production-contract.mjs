import { createHash } from "node:crypto";

export const EMPTY_PRODUCTION_RECORD = Object.freeze({
  status: "not-produced",
  generated_at: null,
  generated_by: null,
  generation_call_id: null,
  source_sha256: null,
  flat_master_sha256: null,
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

export function validateProductionRecord(record, label = "production record") {
  const requiredKeys = Object.keys(EMPTY_PRODUCTION_RECORD);
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
  const reviewFields = ["reviewed_at", "reviewed_by", "review_evidence"];
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
  } else {
    throw new Error(`${label} has unsupported status ${record.status}`);
  }

  for (const field of ["source_sha256", "flat_master_sha256"]) {
    if (!/^[a-f0-9]{64}$/.test(record[field])) {
      throw new Error(`${label} ${field} must be a lowercase SHA-256`);
    }
  }
}
