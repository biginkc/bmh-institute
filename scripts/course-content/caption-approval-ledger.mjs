import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const execFileAsync = promisify(execFile);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function captionApprovalRecordKey(record) {
  return [
    record.video_source_key,
    record.video_sha256,
    record.caption_sha256,
    record.transcript_sha256,
  ].join(":");
}

export function findCaptionApprovalRecord(ledger, binding) {
  const key = captionApprovalRecordKey(binding);
  return ledger?.records?.find((record) =>
    record.status === "approved" && captionApprovalRecordKey(record) === key,
  ) ?? null;
}

export function validateCaptionApprovalTransition(previous, next) {
  const errors = [];
  const nextByKey = new Map((next?.records ?? []).map((record) => [captionApprovalRecordKey(record), record]));
  for (const record of previous?.records ?? []) {
    const retained = nextByKey.get(captionApprovalRecordKey(record));
    if (!retained || JSON.stringify(retained) !== JSON.stringify(record)) {
      errors.push(`${record.video_source_key} decided caption approval history was removed or rewritten.`);
    }
  }
  for (const [index, record] of (previous?.records ?? []).entries()) {
    if (captionApprovalRecordKey(next?.records?.[index] ?? {}) !== captionApprovalRecordKey(record)) {
      errors.push("Caption approval history cannot be reordered or inserted into; new records must be appended.");
      break;
    }
  }
  return errors;
}

async function readLedgerAtRevision(repoRoot, revision, relativeLedgerPath) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["show", `${revision}:${relativeLedgerPath}`],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } catch {
    return null;
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
      // Try the next canonical main reference. Shallow checkouts still retain
      // the HEAD/parent comparison below and should fetch main in release CI.
    }
  }
  return null;
}

export async function validateCaptionApprovalHistory({ ledger, repoRoot, ledgerPath }) {
  const canonicalRoot = await realpath(repoRoot);
  const canonicalLedgerPath = await realpath(ledgerPath);
  if (!isInside(canonicalRoot, canonicalLedgerPath)) return [];
  const relativeLedgerPath = path.relative(canonicalRoot, canonicalLedgerPath).split(path.sep).join("/");
  const mainBase = await mergeBaseWithMain(canonicalRoot);
  const [headLedger, parentLedger, mainLedger] = await Promise.all([
    readLedgerAtRevision(canonicalRoot, "HEAD", relativeLedgerPath),
    readLedgerAtRevision(canonicalRoot, "HEAD^", relativeLedgerPath),
    mainBase ? readLedgerAtRevision(canonicalRoot, mainBase, relativeLedgerPath) : null,
  ]);
  const errors = [];
  if (mainLedger) errors.push(...validateCaptionApprovalTransition(mainLedger, ledger));
  if (parentLedger) errors.push(...validateCaptionApprovalTransition(parentLedger, ledger));
  if (headLedger && JSON.stringify(headLedger) !== JSON.stringify(ledger)) {
    errors.push(...validateCaptionApprovalTransition(headLedger, ledger));
  }
  return [...new Set(errors)];
}

export async function validateCaptionApprovalEvidence({ ledger, repoRoot }) {
  const errors = [];
  if (!ledger || ledger.schema_version !== 1 || ledger.status !== "active" || !Array.isArray(ledger.records)) {
    return ["Caption approval ledger is missing or has an unsupported shape."];
  }

  const canonicalRoot = await realpath(repoRoot);
  const seenKeys = new Set();
  const commitEvidence = new Map();

  for (const [index, record] of ledger.records.entries()) {
    const label = `caption approval record ${index + 1}`;
    const key = captionApprovalRecordKey(record);
    if (seenKeys.has(key)) errors.push(`${label} duplicates an exact checksum binding.`);
    seenKeys.add(key);
    if (typeof record.video_source_key !== "string" || !record.video_source_key) {
      errors.push(`${label} has no video_source_key.`);
      continue;
    }
    for (const field of ["video_sha256", "caption_sha256", "transcript_sha256", "evidence_sha256"]) {
      if (!SHA256_PATTERN.test(record[field] ?? "")) errors.push(`${label}.${field} must be lowercase SHA-256.`);
    }
    if (!["approved", "changes_requested", "superseded"].includes(record.status)) {
      errors.push(`${label}.status must be a decided immutable state.`);
    }
    if (typeof record.reviewed_by !== "string" || !record.reviewed_by.trim()) {
      errors.push(`${label} has no reviewer.`);
    }
    if (!GIT_SHA_PATTERN.test(record.evidence_commit_sha ?? "")) {
      errors.push(`${label}.evidence_commit_sha must bind the evidence commit.`);
    }
    if (!["content_qa_generation_and_validation", "direct_exact_cut_approval"].includes(record.decision_source)) {
      errors.push(`${label}.decision_source is invalid.`);
    }
    if (
      record.decision_source === "content_qa_generation_and_validation" &&
      record.reviewed_by !== "BMH Institute content QA evidence"
    ) {
      errors.push(`${label} overclaims the content-QA evidence decision source.`);
    }
    if (
      record.decision_source === "direct_exact_cut_approval" &&
      record.reviewed_by !== "Jarrad Henry"
    ) {
      errors.push(`${label} direct exact-cut approval must name Jarrad Henry as reviewer.`);
    }
    if (!ISO_TIMESTAMP_PATTERN.test(record.reviewed_at ?? "") || !Number.isFinite(Date.parse(record.reviewed_at))) {
      errors.push(`${label}.reviewed_at must be an ISO UTC timestamp.`);
    }
    if (typeof record.evidence_path !== "string" || path.isAbsolute(record.evidence_path)) {
      errors.push(`${label}.evidence_path must be repository-relative.`);
      continue;
    }
    try {
      const evidencePath = await realpath(path.resolve(canonicalRoot, record.evidence_path));
      if (!isInside(canonicalRoot, evidencePath)) {
        errors.push(`${label}.evidence_path escapes the repository.`);
        continue;
      }
      const evidence = await readFile(evidencePath);
      if (sha256(evidence) !== record.evidence_sha256) errors.push(`${label} evidence checksum does not match.`);
      let bindingEvidence;
      try {
        bindingEvidence = JSON.parse(evidence.toString("utf8"));
      } catch {
        errors.push(`${label} evidence must be structured JSON with exact checksum bindings.`);
      }
      const evidenceMatches = bindingEvidence?.schema_version === 1 &&
        Array.isArray(bindingEvidence.records) &&
        bindingEvidence.records.filter((binding) =>
          [
            "video_source_key",
            "video_sha256",
            "caption_sha256",
            "transcript_sha256",
            "status",
            "reviewed_by",
            "decision_source",
          ].every((field) => binding?.[field] === record[field]),
        ).length === 1;
      if (!evidenceMatches) {
        errors.push(`${label} evidence does not contain this exact video, caption, transcript, reviewer, and decision binding.`);
      }
      const commitKey = `${record.evidence_commit_sha}:${record.evidence_path}`;
      let committed = commitEvidence.get(commitKey);
      if (!committed) {
        committed = Promise.all([
          execFileAsync("git", ["show", `${record.evidence_commit_sha}:${record.evidence_path}`], {
            cwd: canonicalRoot,
            encoding: "buffer",
            maxBuffer: 16 * 1024 * 1024,
          }),
          execFileAsync("git", ["show", "-s", "--format=%cI", record.evidence_commit_sha], {
            cwd: canonicalRoot,
            encoding: "utf8",
          }),
        ]);
        commitEvidence.set(commitKey, committed);
      }
      const [{ stdout: committedEvidence }, { stdout: commitTimestamp }] = await committed;
      if (sha256(committedEvidence) !== record.evidence_sha256) {
        errors.push(`${label} evidence checksum does not match the bound commit.`);
      }
      if (Date.parse(commitTimestamp.trim()) !== Date.parse(record.reviewed_at)) {
        errors.push(`${label}.reviewed_at does not match the bound evidence commit timestamp.`);
      }
    } catch {
      errors.push(`${label} evidence file or bound commit is missing.`);
    }
  }
  return errors;
}

export async function validateCaptionApprovalLedger({
  ledger,
  manifest,
  repoRoot,
}) {
  const errors = await validateCaptionApprovalEvidence({ ledger, repoRoot });
  if (!ledger || !Array.isArray(ledger.records)) return errors;
  const assets = new Map((manifest.assets ?? []).map((asset) => [asset.source_key, asset]));
  const approvedVideos = (manifest.assets ?? []).filter(
    (asset) => asset.kind === "video" && asset.approval_status === "approved",
  );

  for (const video of approvedVideos) {
    const caption = assets.get(`caption-${video.source_key}`);
    const transcript = assets.get(`transcript-${video.source_key}`);
    const matches = ledger.records.filter((record) =>
      record.status === "approved" &&
      captionApprovalRecordKey(record) === captionApprovalRecordKey({
        video_source_key: video.source_key,
        video_sha256: video.checksum_sha256,
        caption_sha256: caption?.checksum_sha256,
        transcript_sha256: transcript?.checksum_sha256,
      }),
    );
    if (
      !caption || !transcript ||
      caption.approval_status !== "approved" || transcript.approval_status !== "approved" ||
      matches.length !== 1
    ) {
      errors.push(`${video.source_key} captions are not approved for this exact video checksum.`);
    }
  }
  return errors;
}
