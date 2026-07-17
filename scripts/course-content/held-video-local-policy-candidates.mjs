import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");

export const LOCAL_POLICY_CANDIDATES_PATH = join(
  REPO_ROOT,
  "docs/course-production/held-video-review/local-policy-candidates.json",
);

export const EXACT_LOCAL_POLICY_REVIEW_QUESTION =
  "Do you approve the KPIs v12 local policy-cut candidate and authorize policy-safe replacement recuts for Welcome, Mindset, Objection Scripts Playbook, and Closing and Deal Engineering?";

const EXPECTED_CANDIDATES = new Map([
  [
    "terms-v10-local-policy-cut",
    {
      sourceKey: "video-slot-02-terms",
      sourceSha256: "17cac99f171edfb773f85eaaa6719e09ffe1295abec5b062554c72958747c0bb",
      sha256: "6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769",
      sizeBytes: 104384792,
    },
  ],
  [
    "kpis-v12-local-policy-cut",
    {
      sourceKey: "video-slot-16-kpis",
      sourceSha256: "439f8d06d2e449637509f0f21f9d0b4a5464c65aec1995fca7147e4e4e67310b",
      sha256: "3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a",
      sizeBytes: 53799917,
    },
  ],
]);

function safeRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.split("/").includes("..");
}

export function localPolicyCandidateKey(candidate) {
  return `${candidate.source_key}:${candidate.sha256}`;
}

export function validateLocalPolicyCandidates(inventory, manifest, approvalLedger) {
  const errors = [];
  if (inventory?.schema_version !== "1.0.0") {
    errors.push("local policy candidate inventory schema_version must be 1.0.0");
  }
  if (inventory?.status !== "local_review_candidates") {
    errors.push("local policy candidate inventory status must be local_review_candidates");
  }
  if (inventory?.review_question !== EXACT_LOCAL_POLICY_REVIEW_QUESTION) {
    errors.push("local policy candidate inventory review question changed");
  }
  if (!Array.isArray(inventory?.candidates)) {
    errors.push("local policy candidate inventory needs candidates");
    return errors;
  }
  if (inventory.candidates.length !== EXPECTED_CANDIDATES.size) {
    errors.push(`expected exactly ${EXPECTED_CANDIDATES.size} local policy candidates`);
  }

  const seen = new Set();
  for (const candidate of inventory.candidates) {
    const expected = EXPECTED_CANDIDATES.get(candidate.candidate_id);
    if (!expected) {
      errors.push(`unexpected local policy candidate: ${candidate.candidate_id}`);
      continue;
    }
    if (seen.has(candidate.candidate_id)) {
      errors.push(`duplicate local policy candidate: ${candidate.candidate_id}`);
    }
    seen.add(candidate.candidate_id);
    if (candidate.source_key !== expected.sourceKey) {
      errors.push(`${candidate.candidate_id} source_key changed`);
    }
    if (candidate.source_sha256 !== expected.sourceSha256) {
      errors.push(`${candidate.candidate_id} source SHA-256 changed`);
    }
    if (candidate.sha256 !== expected.sha256) {
      errors.push(`${candidate.candidate_id} candidate SHA-256 changed`);
    }
    if (candidate.size_bytes !== expected.sizeBytes) {
      errors.push(`${candidate.candidate_id} byte size changed`);
    }
    if (!safeRelativePath(candidate.local_path)) {
      errors.push(`${candidate.candidate_id} local_path must be a safe relative path`);
    }
    if (!Number.isFinite(candidate.duration_seconds) || candidate.duration_seconds <= 0) {
      errors.push(`${candidate.candidate_id} needs a positive duration_seconds`);
    }
    if (!candidate.review_reason || !candidate.resulting_line || !candidate.technical_result) {
      errors.push(`${candidate.candidate_id} review evidence is incomplete`);
    }
    if (!Array.isArray(candidate.edit_decision_list) || candidate.edit_decision_list.length === 0) {
      errors.push(`${candidate.candidate_id} needs an edit decision list`);
    }
    for (const operation of candidate.edit_decision_list ?? []) {
      if (
        operation.action !== "remove"
        || !Number.isFinite(operation.source_start_seconds)
        || !Number.isFinite(operation.source_end_seconds)
        || operation.source_end_seconds <= operation.source_start_seconds
        || !operation.removed_language
      ) {
        errors.push(`${candidate.candidate_id} has an invalid edit decision`);
      }
    }
    if (!Number.isFinite(candidate.crossfade_seconds) || candidate.crossfade_seconds <= 0) {
      errors.push(`${candidate.candidate_id} needs a positive crossfade_seconds`);
    }

    const sourceAsset = manifest?.assets?.find(
      (asset) => asset.source_key === candidate.source_key && asset.kind === "video",
    );
    const ledgerRecord = approvalLedger?.records?.find(
      (record) => record.source_key === candidate.source_key && record.sha256 === candidate.sha256,
    );
    if (!ledgerRecord || ledgerRecord.candidate_local_path !== candidate.local_path) {
      errors.push(`${candidate.candidate_id} needs an exact checksum-keyed ledger record`);
      continue;
    }
    if (ledgerRecord.decision === "pending") {
      if (
        candidate.approval_status !== "pending_unapproved"
        || ledgerRecord.approver !== null
        || ledgerRecord.date !== null
        || ledgerRecord.notes !== null
      ) {
        errors.push(`${candidate.candidate_id} pending inventory and ledger state do not match`);
      }
      if (!sourceAsset || sourceAsset.checksum_sha256 !== candidate.source_sha256 || sourceAsset.approval_status !== "hold") {
        errors.push(`${candidate.candidate_id} pending source cut no longer matches the held manifest asset`);
      }
    } else if (ledgerRecord.decision === "approved") {
      if (candidate.approval_status !== "approved_exact_cut") {
        errors.push(`${candidate.candidate_id} approved inventory and ledger state do not match`);
      }
      const manifestIsPrePromotion = sourceAsset?.checksum_sha256 === candidate.source_sha256
        && sourceAsset?.approval_status === "hold";
      const manifestIsPromoted = sourceAsset?.checksum_sha256 === candidate.sha256
        && sourceAsset?.local_path === candidate.local_path
        && sourceAsset?.approval_status === "approved";
      if (!manifestIsPrePromotion && !manifestIsPromoted) {
        errors.push(`${candidate.candidate_id} approved cut is neither awaiting promotion nor exactly promoted`);
      }
    } else {
      errors.push(`${candidate.candidate_id} has unsupported terminal decision ${ledgerRecord.decision}`);
    }
  }
  for (const candidateId of EXPECTED_CANDIDATES.keys()) {
    if (!seen.has(candidateId)) errors.push(`missing local policy candidate: ${candidateId}`);
  }
  return errors;
}

export function localPolicyCandidateAssets(inventory) {
  return (inventory?.candidates ?? []).map((candidate) => ({
    source_key: candidate.source_key,
    kind: "video",
    local_path: candidate.local_path,
    checksum_sha256: candidate.sha256,
    size_bytes: candidate.size_bytes,
    approval_status: candidate.approval_status === "approved_exact_cut" ? "approved" : "hold",
    local_policy_candidate: candidate,
  }));
}

export async function readLocalPolicyCandidates() {
  const buffer = await readFile(LOCAL_POLICY_CANDIDATES_PATH);
  return { buffer, inventory: JSON.parse(buffer.toString("utf8")) };
}
