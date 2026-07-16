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

export const REPLACEMENT_REQUIRED_CUTS = new Map([
  [
    "video-slot-17-compensation:cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846",
    "The exact source cut contains fixed compensation promises and must be replaced.",
  ],
  [
    "video-slot-18-operator:6e6a3f257ff8cf3ef201de775de47c6e7833e3abd673e44bb8d4d5ac3aafa048",
    "The exact source cut contains fixed activity quotas and must be replaced.",
  ],
  [
    "video-slot-19-career:1ddcf7b1b0b45bbc90ec14b3660b3d5f5a284b5095dd0d0682164924ce1a3da9",
    "The exact source cut contains role-ladder, timeline, and compensation promises and must be replaced.",
  ],
]);

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
  const currentSeen = new Set();
  for (const [index, record] of ledger.records.entries()) {
    const label = `approval record ${index + 1}`;
    exactFields(record, RECORD_FIELDS, label, errors);
    const key = approvalRecordKey(record);
    if (seen.has(key)) errors.push(`${label} duplicates ${key}`);
    seen.add(key);
    const asset = expected.get(key);
    if (!/^video-slot-[a-z0-9-]+$/.test(record.source_key ?? "")) {
      errors.push(`${label} source_key must identify a video slot`);
    }
    if (!/^[a-f0-9]{64}$/.test(record.sha256 ?? "")) {
      errors.push(`${label} sha256 must be a lowercase SHA-256 digest`);
    }
    if (
      typeof record.candidate_local_path !== "string"
      || record.candidate_local_path.length === 0
      || record.candidate_local_path.startsWith("/")
      || record.candidate_local_path.split("/").includes("..")
    ) {
      errors.push(`${label} candidate_local_path must be a safe relative path`);
    }
    if (asset) currentSeen.add(key);
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
    if (!asset && record.decision === "pending") {
      errors.push(`${label} is historical and cannot remain pending after its manifest cut changes`);
    }
    if (REPLACEMENT_REQUIRED_CUTS.has(key) && record.decision !== "changes_requested") {
      errors.push(`${label} is a policy-defective source cut and must be changes_requested, never pending or approved`);
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

  if (currentSeen.size !== expected.size || [...expected.keys()].some((key) => !currentSeen.has(key))) {
    errors.push("approval ledger must contain a current record for every held source_key plus SHA-256");
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
  const nextByKey = new Map(nextLedger.records.map((record) => [approvalRecordKey(record), record]));
  const heldByKey = new Map((heldAssets ?? []).map((asset) => [
    `${asset.source_key}:${asset.checksum_sha256}`,
    asset,
  ]));
  for (const next of nextLedger.records) {
    const key = approvalRecordKey(next);
    const current = currentByKey.get(key);
    if (!current) {
      if (!heldByKey.has(key) || next.decision !== "pending") {
        errors.push(`transition can add only a new pending candidate keyed to the current held manifest: ${key}`);
      }
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
  for (const [key] of currentByKey) {
    if (!nextByKey.has(key)) errors.push(`transition cannot remove approval history: ${key}`);
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
