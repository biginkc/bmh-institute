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
      // Try the next canonical main reference. Shallow checkouts still retain
      // the HEAD/parent comparison below and should fetch main in release CI.
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
      errors: ["Caption approval history could not inspect committed HEAD ancestry."],
    };
  }

  const revisions = [];
  if (head.parents.length === 0) {
    errors.push("Caption approval history has no committed parent ancestry.");
  } else if (head.parents.length === 1) {
    revisions.push(head.parents[0]);
  } else {
    // The first parent is the feature history for an ordinary merge and the
    // base history for GitHub's synthetic merge. Validate it in either case.
    revisions.push(head.parents[0]);

    // The second parent is the feature tip in GitHub's synthetic merge. Its
    // own parent is the immutable history before the change under test. For
    // an ordinary feature merge this also preserves the other prior history.
    const secondParent = await commitParents(repoRoot, head.parents[1]);
    if (!secondParent) {
      errors.push("Caption approval history could not inspect the second-parent history.");
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

async function validateCaptionApprovalCommitHistory(repoRoot, relativeLedgerPath) {
  let revisions;
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-list", "--full-history", "--topo-order", "--reverse", "HEAD", "--", relativeLedgerPath],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    revisions = stdout.trim() ? stdout.trim().split(/\s+/) : [];
  } catch {
    return ["Caption approval history could not enumerate committed ledger transitions."];
  }

  const errors = [];
  for (const revision of revisions) {
    const ancestry = await commitParents(repoRoot, revision);
    if (!ancestry) {
      errors.push("Caption approval history could not inspect a ledger-changing commit.");
      continue;
    }
    const next = await readLedgerAtRevision(repoRoot, revision, relativeLedgerPath);
    if (next.status === "unavailable" || next.status === "invalid") {
      errors.push("Caption approval history could not read a ledger-changing commit.");
      continue;
    }
    for (const parent of ancestry.parents) {
      const previous = await readLedgerAtRevision(repoRoot, parent, relativeLedgerPath);
      if (previous.status === "unavailable" || previous.status === "invalid") {
        errors.push("Caption approval history could not read a ledger transition parent.");
        continue;
      }
      if (previous.status === "ok" && next.status === "missing") {
        errors.push("Caption approval history was removed by a committed transition.");
      } else if (previous.status === "ok" && next.status === "ok") {
        errors.push(...validateCaptionApprovalTransition(previous.ledger, next.ledger));
      }
    }
  }
  return errors;
}

export async function validateCaptionApprovalHistory({ ledger, repoRoot, ledgerPath }) {
  const canonicalRoot = await realpath(repoRoot);
  const canonicalLedgerPath = await realpath(ledgerPath);
  if (!isInside(canonicalRoot, canonicalLedgerPath)) return [];
  const relativeLedgerPath = path.relative(canonicalRoot, canonicalLedgerPath).split(path.sep).join("/");
  const baselines = await approvalBaselineRevisions(canonicalRoot);
  const [headResult, ...baselineResults] = await Promise.all([
    readLedgerAtRevision(canonicalRoot, "HEAD", relativeLedgerPath),
    ...baselines.revisions.map((revision) =>
      readLedgerAtRevision(canonicalRoot, revision, relativeLedgerPath)),
  ]);
  const errors = [...baselines.errors];
  if (headResult.status !== "ok") {
    errors.push("Caption approval history could not read the committed HEAD ledger.");
  }
  let readableBaselineCount = 0;
  for (const result of baselineResults) {
    if (result.status === "unavailable" || result.status === "invalid") {
      errors.push("Caption approval history could not read an immutable predecessor revision.");
      continue;
    }
    if (result.status === "ok") {
      readableBaselineCount += 1;
      errors.push(...validateCaptionApprovalTransition(result.ledger, ledger));
    }
  }
  if (readableBaselineCount === 0) {
    errors.push("Caption approval history has no immutable predecessor baseline.");
  }
  if (headResult.status === "ok" && JSON.stringify(headResult.ledger) !== JSON.stringify(ledger)) {
    errors.push(...validateCaptionApprovalTransition(headResult.ledger, ledger));
  }
  errors.push(...await validateCaptionApprovalCommitHistory(canonicalRoot, relativeLedgerPath));
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
    for (const field of ["video_sha256", "caption_sha256", "evidence_sha256"]) {
      if (!SHA256_PATTERN.test(record[field] ?? "")) errors.push(`${label}.${field} must be lowercase SHA-256.`);
    }
    if (
      record.decision_source === "caption_accessibility_validation"
        ? record.transcript_sha256 !== null
        : !SHA256_PATTERN.test(record.transcript_sha256 ?? "")
    ) {
      errors.push(`${label}.transcript_sha256 must be null only for caption-only accessibility validation, otherwise lowercase SHA-256.`);
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
    if (!["content_qa_generation_and_validation", "direct_exact_cut_approval", "caption_accessibility_validation"].includes(record.decision_source)) {
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
    if (
      record.decision_source === "caption_accessibility_validation" &&
      record.reviewed_by !== "BMH Institute caption QA evidence"
    ) {
      errors.push(`${label} caption accessibility validation must name BMH Institute caption QA evidence as reviewer.`);
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
        errors.push(`${label} evidence does not contain this exact video, caption, optional transcript, reviewer, and decision binding.`);
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
    const candidateMatches = ledger.records.filter((record) =>
      record.status === "approved" &&
      record.video_source_key === video.source_key &&
      record.video_sha256 === video.checksum_sha256 &&
      record.caption_sha256 === caption?.checksum_sha256,
    );
    const accessibilityMatches = candidateMatches.filter(
      (record) => record.decision_source === "caption_accessibility_validation",
    );
    const matches = accessibilityMatches.length > 0 ? accessibilityMatches : candidateMatches;
    if (
      !caption || caption.approval_status !== "approved" ||
      matches.length !== 1
    ) {
      errors.push(`${video.source_key} caption is not approved for this exact video checksum.`);
    }
  }
  return errors;
}
