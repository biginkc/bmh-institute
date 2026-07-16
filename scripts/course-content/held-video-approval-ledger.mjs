const LEDGER_FIELDS = ["key_fields", "records", "schema_version", "updated_at"];
const RECORD_FIELDS = [
  "approver",
  "candidate_local_path",
  "date",
  "decision",
  "notes",
  "sha256",
  "source_key",
  "title",
];

export const APPROVAL_DECISIONS = [
  "pending",
  "approved",
  "changes_requested",
  "rejected",
];

function exactFields(value, expected, label, errors) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${label} fields must be exactly: ${wanted.join(", ")}`);
  }
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function approvalRecordKey(record) {
  return `${record.source_key}:${record.sha256}`;
}

export function validateHeldVideoApprovalLedger(ledger, heldAssets) {
  const errors = [];
  exactFields(ledger, LEDGER_FIELDS, "approval ledger", errors);
  if (ledger?.schema_version !== "1.0.0") errors.push("approval ledger schema_version must be 1.0.0");
  if (!validDate(ledger?.updated_at)) errors.push("approval ledger updated_at must be a real YYYY-MM-DD date");
  if (JSON.stringify(ledger?.key_fields) !== JSON.stringify(["source_key", "sha256"])) {
    errors.push("approval ledger key_fields must be source_key and sha256");
  }
  if (!Array.isArray(ledger?.records)) {
    errors.push("approval ledger records must be an array");
    return errors;
  }

  const expected = new Map((heldAssets ?? []).map((asset) => [
    `${asset.source_key}:${asset.checksum_sha256}`,
    asset,
  ]));
  const seen = new Set();
  for (const [index, record] of ledger.records.entries()) {
    const label = `approval record ${index + 1}`;
    exactFields(record, RECORD_FIELDS, label, errors);
    const key = approvalRecordKey(record);
    if (seen.has(key)) errors.push(`${label} duplicates ${key}`);
    seen.add(key);
    const asset = expected.get(key);
    if (!asset) errors.push(`${label} is not keyed to an exact held manifest cut: ${key}`);
    if (asset && record.candidate_local_path !== asset.local_path) {
      errors.push(`${label} candidate_local_path does not match the held manifest cut`);
    }
    if (typeof record.title !== "string" || record.title.trim().length === 0) {
      errors.push(`${label} title must be nonempty`);
    }
    if (!APPROVAL_DECISIONS.includes(record.decision)) {
      errors.push(`${label} decision must be one of ${APPROVAL_DECISIONS.join(", ")}`);
      continue;
    }
    if (record.decision === "pending") {
      if (record.approver !== null || record.date !== null || record.notes !== null) {
        errors.push(`${label} pending decision must keep approver, date, and notes null`);
      }
    } else {
      if (typeof record.approver !== "string" || record.approver.trim().length === 0) {
        errors.push(`${label} decided record requires an approver`);
      }
      if (!validDate(record.date)) errors.push(`${label} decided record requires a real YYYY-MM-DD date`);
      if (typeof record.notes !== "string" || record.notes.trim().length === 0) {
        errors.push(`${label} decided record requires notes tied to the exact cut`);
      }
    }
  }

  if (seen.size !== expected.size || [...expected.keys()].some((key) => !seen.has(key))) {
    errors.push("approval ledger must contain exactly one record for every held source_key plus SHA-256");
  }
  return errors;
}

export function validateHeldVideoApprovalTransition(currentLedger, nextLedger, heldAssets) {
  const errors = [
    ...validateHeldVideoApprovalLedger(currentLedger, heldAssets).map((error) => `current: ${error}`),
    ...validateHeldVideoApprovalLedger(nextLedger, heldAssets).map((error) => `next: ${error}`),
  ];
  if (errors.length) return errors;

  const currentByKey = new Map(currentLedger.records.map((record) => [approvalRecordKey(record), record]));
  for (const next of nextLedger.records) {
    const key = approvalRecordKey(next);
    const current = currentByKey.get(key);
    if (!current) {
      errors.push(`transition cannot add, remove, or re-key a held cut: ${key}`);
      continue;
    }
    for (const field of ["source_key", "sha256", "candidate_local_path", "title"]) {
      if (next[field] !== current[field]) errors.push(`${key} cannot change immutable field ${field}`);
    }
    if (current.decision !== "pending" && JSON.stringify(current) !== JSON.stringify(next)) {
      errors.push(`${key} decision is terminal; add a newly checksum-keyed candidate instead of rewriting history`);
    }
    if (current.decision === "pending" && next.decision === "pending" && JSON.stringify(current) !== JSON.stringify(next)) {
      errors.push(`${key} pending record cannot carry approval metadata`);
    }
  }
  if (nextLedger.updated_at < currentLedger.updated_at) {
    errors.push("approval ledger updated_at cannot move backward");
  }
  const decisionDates = nextLedger.records
    .filter((record) => record.decision !== "pending")
    .map((record) => record.date);
  if (decisionDates.some((date) => date > nextLedger.updated_at)) {
    errors.push("approval ledger updated_at cannot predate a recorded decision");
  }
  return errors;
}
