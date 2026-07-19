import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    "video-slot-01-welcome:493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72",
    "The exact source cut contains role-title language and must be replaced.",
  ],
  [
    "video-slot-01-mindset:b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da",
    "The exact source cut contains fixed week progression and must be replaced.",
  ],
  [
    "video-slot-02-terms:17cac99f171edfb773f85eaaa6719e09ffe1295abec5b062554c72958747c0bb",
    "The exact source cut contains a role title. Review the checksum-keyed local policy cut instead.",
  ],
  [
    "video-slot-10-objection-scripts:59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb",
    "The exact source cut contains direct outcome guarantees and must be replaced.",
  ],
  [
    "video-slot-15-closing:6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2",
    "The exact source cut contains role-bound narration and visuals and must be replaced.",
  ],
  [
    "video-slot-16-kpis:439f8d06d2e449637509f0f21f9d0b4a5464c65aec1995fca7147e4e4e67310b",
    "The exact source cut contains a compensation promise. Review the checksum-keyed local policy cut instead.",
  ],
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

export const REVIEWED_VIDEO_SOURCE_KEYS = new Set([
  "video-slot-01-welcome",
  "video-slot-01-mindset",
  "video-slot-02-terms",
  "video-slot-10-objection-scripts",
  "video-slot-15-closing",
  "video-slot-16-kpis",
  "video-slot-17-compensation",
  "video-slot-18-operator",
  "video-slot-19-career",
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

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function readLedgerAtRevision(repoRoot, revision, relativeLedgerPath) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["show", `${revision}:${relativeLedgerPath}`],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    return { status: "ok", ledger: JSON.parse(stdout) };
  } catch {
    try {
      await execFileAsync("git", ["cat-file", "-e", `${revision}^{commit}`], {
        cwd: repoRoot,
      });
    } catch {
      return { status: "unavailable", ledger: null };
    }
    try {
      await execFileAsync("git", ["cat-file", "-e", `${revision}:${relativeLedgerPath}`], {
        cwd: repoRoot,
      });
    } catch {
      return { status: "missing", ledger: null };
    }
    return { status: "invalid", ledger: null };
  }
}

async function mergeBaseWithMain(repoRoot) {
  for (const mainRef of ["origin/main", "main"]) {
    try {
      const { stdout } = await execFileAsync("git", ["merge-base", "HEAD", mainRef], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      if (/^[a-f0-9]{40}$/.test(stdout.trim())) return stdout.trim();
    } catch {
      // Shallow CI still retains the HEAD/parent comparison below.
    }
  }
  return null;
}

async function commitParents(repoRoot, revision) {
  try {
    const { stdout: resolved } = await execFileAsync(
      "git",
      ["rev-parse", "--verify", `${revision}^{commit}`],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const commit = resolved.trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) return null;
    const { stdout: rawCommit } = await execFileAsync(
      "git",
      ["cat-file", "-p", commit],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const parents = [...rawCommit.matchAll(/^parent ([a-f0-9]{40})$/gm)]
      .map((match) => match[1]);
    return { commit, parents };
  } catch {
    return null;
  }
}

async function approvalBaselineRevisions(repoRoot) {
  const errors = [];
  const head = await commitParents(repoRoot, "HEAD");
  if (!head) {
    return {
      revisions: [],
      errors: ["Held-video approval history could not inspect committed HEAD ancestry."],
    };
  }

  const revisions = [];
  if (head.parents.length === 0) {
    errors.push("Held-video approval history has no committed parent ancestry.");
  } else if (head.parents.length === 1) {
    revisions.push(head.parents[0]);
  } else {
    revisions.push(head.parents[0]);
    const secondParent = await commitParents(repoRoot, head.parents[1]);
    if (!secondParent) {
      errors.push("Held-video approval history could not inspect the second-parent history.");
    } else if (secondParent.parents.length > 0) {
      revisions.push(secondParent.parents[0]);
    }
  }

  const mainBase = await mergeBaseWithMain(repoRoot);
  if (mainBase) revisions.push(mainBase);
  return {
    revisions: [...new Set(revisions.filter((revision) => revision && revision !== head.commit))],
    errors,
  };
}

async function validateHeldVideoApprovalCommitHistory(
  repoRoot,
  relativeLedgerPath,
) {
  let revisions;
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-list", "--full-history", "--topo-order", "--reverse", "HEAD", "--", relativeLedgerPath],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    revisions = stdout.trim() ? stdout.trim().split(/\s+/) : [];
  } catch {
    return ["Held-video approval history could not enumerate committed ledger transitions."];
  }

  const errors = [];
  for (const revision of revisions) {
    const ancestry = await commitParents(repoRoot, revision);
    if (!ancestry) {
      errors.push("Held-video approval history could not inspect a ledger-changing commit.");
      continue;
    }
    const next = await readLedgerAtRevision(repoRoot, revision, relativeLedgerPath);
    if (next.status === "unavailable" || next.status === "invalid") {
      errors.push("Held-video approval history could not read a ledger-changing commit.");
      continue;
    }
    for (const parent of ancestry.parents) {
      const previous = await readLedgerAtRevision(repoRoot, parent, relativeLedgerPath);
      if (previous.status === "unavailable" || previous.status === "invalid") {
        errors.push("Held-video approval history could not read a ledger transition parent.");
        continue;
      }
      if (previous.status === "ok" && next.status === "missing") {
        errors.push("Held-video approval history has a committed transition that removed approval history.");
      } else if (previous.status === "ok" && next.status === "ok") {
        errors.push(...validateHeldVideoApprovalImmutability(previous.ledger, next.ledger));
      }
    }
  }
  return errors;
}

export function validateHeldVideoApprovalLedger(
  ledger,
  currentReviewAssets,
  { requireCurrentRecords = true, allowHistoricalPending = false } = {},
) {
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

  const expected = new Map((currentReviewAssets ?? []).map((asset) => [
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
    if (!asset && record.decision === "pending" && !allowHistoricalPending) {
      errors.push(`${label} is historical and cannot remain pending after its manifest cut changes`);
    }
    if (REPLACEMENT_REQUIRED_CUTS.has(key) && record.decision !== "changes_requested") {
      errors.push(`${label} is a policy-defective source cut and must be changes_requested, never pending or approved`);
    }
    if (
      REPLACEMENT_REQUIRED_CUTS.has(key)
      && record.decision === "changes_requested"
      && record.approver !== "BMH Institute content QA"
    ) {
      errors.push(`${label} policy-defective source cut must retain the BMH Institute content QA decision`);
    }
    if (record.decision === "pending") {
      if (record.approver !== null || record.date !== null || record.notes !== null) {
        errors.push(`${label} pending decision must keep approver, date, and notes null`);
      }
    } else {
      if (typeof record.approver !== "string" || record.approver.trim().length === 0) {
        errors.push(`${label} decided record requires an approver`);
      }
      if (!REPLACEMENT_REQUIRED_CUTS.has(key) && record.approver !== "Jarrad Henry") {
        errors.push(`${label} corrected candidate decisions require approver Jarrad Henry`);
      }
      if (!validDate(record.date)) errors.push(`${label} decided record requires a real YYYY-MM-DD date`);
      if (typeof record.notes !== "string" || record.notes.trim().length === 0) {
        errors.push(`${label} decided record requires notes tied to the exact cut`);
      }
    }
  }

  for (const requiredKey of REPLACEMENT_REQUIRED_CUTS.keys()) {
    if (!seen.has(requiredKey)) {
      errors.push(`approval ledger must preserve policy-defective source-cut history: ${requiredKey}`);
    }
  }

  if (
    requireCurrentRecords
    && (currentSeen.size !== expected.size
      || [...expected.keys()].some((key) => !currentSeen.has(key)))
  ) {
    errors.push("approval ledger must contain a current record for every held source_key plus SHA-256");
  }
  return errors;
}

export function validateHeldVideoManifestApprovalState(
  ledger,
  currentReviewAssets,
  options = {},
) {
  const errors = validateHeldVideoApprovalLedger(ledger, currentReviewAssets, options);
  if (errors.length > 0) return errors;
  const currentByKey = new Map(
    ledger.records.map((record) => [approvalRecordKey(record), record]),
  );
  const sources = new Set();
  for (const asset of currentReviewAssets ?? []) {
    sources.add(asset.source_key);
    if (!REVIEWED_VIDEO_SOURCE_KEYS.has(asset.source_key)) {
      errors.push(`unexpected reviewed video source_key: ${asset.source_key}`);
      continue;
    }
    const key = `${asset.source_key}:${asset.checksum_sha256}`;
    const record = currentByKey.get(key);
    if (!record) continue;
    if (asset.approval_status === "approved" && record.decision !== "approved") {
      errors.push(`${key} is approved in the manifest without an exact approved ledger decision`);
    }
    if (asset.approval_status === "hold" && record.decision === "approved") {
      errors.push(`${key} is approved in the ledger but remains held in the manifest`);
    }
    if (!["approved", "hold"].includes(asset.approval_status)) {
      errors.push(`${key} reviewed video must be held or approved, not ${asset.approval_status}`);
    }
  }
  for (const sourceKey of REVIEWED_VIDEO_SOURCE_KEYS) {
    if (!sources.has(sourceKey)) {
      errors.push(`reviewed video is missing from the manifest: ${sourceKey}`);
    }
  }
  return errors;
}

function validateHeldVideoApprovalImmutability(currentLedger, nextLedger) {
  const errors = [];
  if (!Array.isArray(currentLedger?.records) || !Array.isArray(nextLedger?.records)) {
    return ["transition requires readable approval-ledger record arrays"];
  }
  const currentByKey = new Map(currentLedger.records.map((record) => [approvalRecordKey(record), record]));
  const nextByKey = new Map(nextLedger.records.map((record) => [approvalRecordKey(record), record]));
  if (nextByKey.size !== nextLedger.records.length) {
    errors.push("transition cannot introduce duplicate approval-history keys");
  }
  for (const [index, current] of currentLedger.records.entries()) {
    if (approvalRecordKey(nextLedger.records[index] ?? {}) !== approvalRecordKey(current)) {
      errors.push("transition cannot reorder or insert within existing approval history; new records must be appended");
      break;
    }
  }
  for (const next of nextLedger.records) {
    const key = approvalRecordKey(next);
    const current = currentByKey.get(key);
    if (!current) continue;
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

export function validateHeldVideoApprovalTransition(currentLedger, nextLedger, heldAssets) {
  const errors = [
    ...validateHeldVideoApprovalLedger(currentLedger, heldAssets, {
      requireCurrentRecords: false,
      allowHistoricalPending: true,
    }).map((error) => `current: ${error}`),
    ...validateHeldVideoApprovalLedger(nextLedger, heldAssets).map((error) => `next: ${error}`),
  ];
  if (errors.length) return errors;

  const currentByKey = new Map(currentLedger.records.map((record) => [approvalRecordKey(record), record]));
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
    }
  }
  errors.push(...validateHeldVideoApprovalImmutability(currentLedger, nextLedger));
  return errors;
}

export async function validateHeldVideoApprovalHistory({
  ledger,
  currentReviewAssets,
  repoRoot,
  ledgerPath,
}) {
  const canonicalRoot = await realpath(repoRoot);
  const canonicalLedgerPath = await realpath(ledgerPath);
  if (!isInside(canonicalRoot, canonicalLedgerPath)) {
    return ["Held-video approval ledger must be inside the canonical repository root."];
  }
  const relativeLedgerPath = path.relative(canonicalRoot, canonicalLedgerPath).split(path.sep).join("/");
  const baselines = await approvalBaselineRevisions(canonicalRoot);
  const [headResult, ...baselineResults] = await Promise.all([
    readLedgerAtRevision(canonicalRoot, "HEAD", relativeLedgerPath),
    ...baselines.revisions.map((revision) =>
      readLedgerAtRevision(canonicalRoot, revision, relativeLedgerPath)),
  ]);
  const errors = [...baselines.errors];
  if (headResult.status !== "ok") {
    errors.push("Held-video approval history could not read the committed HEAD ledger.");
  }
  let readableBaselineCount = 0;
  for (const result of baselineResults) {
    if (result.status === "unavailable" || result.status === "invalid") {
      errors.push("Held-video approval history could not read an immutable predecessor revision.");
      continue;
    }
    if (result.status === "ok") {
      readableBaselineCount += 1;
      errors.push(...validateHeldVideoApprovalTransition(result.ledger, ledger, currentReviewAssets));
    }
  }
  if (readableBaselineCount === 0) {
    errors.push("Held-video approval history has no immutable predecessor baseline.");
  }
  if (headResult.status === "ok" && JSON.stringify(headResult.ledger) !== JSON.stringify(ledger)) {
    errors.push(...validateHeldVideoApprovalTransition(headResult.ledger, ledger, currentReviewAssets));
  }
  errors.push(...await validateHeldVideoApprovalCommitHistory(
    canonicalRoot,
    relativeLedgerPath,
  ));
  return [...new Set(errors)];
}
