import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import {
  validateCaptionApprovalEvidence,
  validateCaptionApprovalHistory,
  validateCaptionApprovalLedger,
  validateCaptionApprovalTransition,
} from "../../scripts/course-content/caption-approval-ledger.mjs";
import { buildDerivativePair, buildManifest } from "../../scripts/course-content/build-manifest.mjs";

const ROOT = new URL("../../", import.meta.url);
const execFileAsync = promisify(execFile);

async function fixtures() {
  return {
    manifest: JSON.parse(await readFile(new URL("./bmh-employee-training.v1.json", import.meta.url))),
    ledger: JSON.parse(await readFile(new URL("../../docs/course-production/caption-approvals.json", import.meta.url))),
  };
}

test("caption approvals bind every approved derivative pair to the exact video checksum", async () => {
  const { manifest, ledger } = await fixtures();
  assert.deepEqual(await validateCaptionApprovalLedger({ ledger, manifest, repoRoot: ROOT }), []);
});

test("video checksum drift invalidates otherwise unchanged captions and transcripts", async () => {
  const { manifest, ledger } = await fixtures();
  const video = manifest.assets.find((asset) => asset.source_key === "video-slot-03-tech-stack");
  video.checksum_sha256 = "a".repeat(64);
  const errors = await validateCaptionApprovalLedger({ ledger, manifest, repoRoot: ROOT });
  assert.ok(errors.some((error) => error.includes("exact video checksum")));
});

test("forged reviewer evidence and unreviewed derivative pairs fail closed", async () => {
  const { manifest, ledger } = await fixtures();
  ledger.records[0].evidence_sha256 = "b".repeat(64);
  ledger.records.pop();
  const errors = await validateCaptionApprovalLedger({ ledger, manifest, repoRoot: ROOT });
  assert.ok(errors.some((error) => error.includes("evidence checksum")));
  assert.ok(errors.some((error) => error.includes("exact video checksum")));
});

test("a syntactically valid but nonexistent evidence commit fails closed", async () => {
  const { manifest, ledger } = await fixtures();
  ledger.records[0].evidence_commit_sha = "f".repeat(40);
  const errors = await validateCaptionApprovalLedger({ ledger, manifest, repoRoot: ROOT });
  assert.ok(errors.some((error) => error.includes("bound commit is missing")));
});

test("an unrelated committed evidence record cannot be replayed for a different checksum binding", async () => {
  const { ledger } = await fixtures();
  ledger.records[0].caption_sha256 = "a".repeat(64);
  const errors = await validateCaptionApprovalEvidence({ ledger, repoRoot: ROOT });
  assert.ok(errors.some((error) => error.includes("does not contain this exact video")));
});

test("direct exact-cut approval cannot name a substitute reviewer", async () => {
  const { manifest, ledger } = await fixtures();
  ledger.records[0].decision_source = "direct_exact_cut_approval";
  ledger.records[0].reviewed_by = "Content team";
  const errors = await validateCaptionApprovalLedger({ ledger, manifest, repoRoot: ROOT });
  assert.ok(errors.some((error) => error.includes("must name Jarrad Henry")));
});

test("a replacement retains immutable approval history and selects one exact current binding", async () => {
  const { manifest, ledger } = await fixtures();
  const previous = structuredClone(ledger);
  const video = manifest.assets.find((asset) => asset.source_key === "video-slot-03-tech-stack");
  const caption = manifest.assets.find((asset) => asset.source_key === "caption-video-slot-03-tech-stack");
  const transcript = manifest.assets.find((asset) => asset.source_key === "transcript-video-slot-03-tech-stack");
  video.checksum_sha256 = "a".repeat(64);
  caption.checksum_sha256 = "b".repeat(64);
  transcript.checksum_sha256 = "c".repeat(64);
  ledger.records.push({
    ...ledger.records[0],
    video_sha256: video.checksum_sha256,
    caption_sha256: caption.checksum_sha256,
    transcript_sha256: transcript.checksum_sha256,
  });
  assert.deepEqual(validateCaptionApprovalTransition(previous, ledger), []);
  const replacementErrors = await validateCaptionApprovalLedger({ ledger, manifest, repoRoot: ROOT });
  assert.ok(replacementErrors.some((error) => error.includes("evidence does not contain this exact video")));

  ledger.records[0].reviewed_by = "rewritten";
  assert.ok(validateCaptionApprovalTransition(previous, ledger).some((error) => error.includes("removed or rewritten")));

  const reordered = structuredClone(previous);
  [reordered.records[0], reordered.records[1]] = [reordered.records[1], reordered.records[0]];
  assert.ok(validateCaptionApprovalTransition(previous, reordered).some((error) => error.includes("cannot be reordered")));
});

test("the end-to-end history gate rejects deletion from the checked-in ledger", async () => {
  const { ledger } = await fixtures();
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-history-"));
  const ledgerPath = path.join(root, "caption-approvals.json");
  await writeFile(ledgerPath, `${JSON.stringify(ledger)}\n`);
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Caption QA"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "caption-qa@example.invalid"], { cwd: root });
  await execFileAsync("git", ["add", "caption-approvals.json"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "caption evidence"], { cwd: root });
  const rewritten = structuredClone(ledger);
  rewritten.records.shift();
  await writeFile(ledgerPath, `${JSON.stringify(rewritten)}\n`);
  const errors = await validateCaptionApprovalHistory({
    ledger: rewritten,
    repoRoot: root,
    ledgerPath,
  });
  assert.ok(errors.some((error) => error.includes("removed or rewritten")));
});

test("the builder approves a caption and transcript only from one composite record", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-pair-"));
  await mkdir(path.join(root, "course-assets/captions"), { recursive: true });
  await mkdir(path.join(root, "course-assets/transcripts"), { recursive: true });
  await writeFile(path.join(root, "course-assets/captions/video-test.vtt"), "WEBVTT\n");
  await writeFile(path.join(root, "course-assets/transcripts/video-test.md"), "# Transcript\n");
  const video = { source_key: "video-test", approval_status: "approved", checksum_sha256: "a".repeat(64) };
  const splitLedger = {
    records: [
      { status: "approved", video_source_key: "video-test", video_sha256: "a".repeat(64), caption_sha256: "73420fdc06730575e08b8a09b5b3824e0f2a9d2dd742640613490ef3abac2bd0", transcript_sha256: "b".repeat(64) },
      { status: "approved", video_source_key: "video-test", video_sha256: "a".repeat(64), caption_sha256: "c".repeat(64), transcript_sha256: "5f40cd763d03e90a98ce2687bf1c5a67db92bde96c1d45fa30223906b9df5bb9" },
    ],
  };
  const assets = await buildDerivativePair(video, splitLedger, root);
  assert.deepEqual(assets.map((asset) => asset.approval_status), ["missing", "missing"]);
});

test("an incomplete derivative pair remains atomically missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-incomplete-"));
  await mkdir(path.join(root, "course-assets/captions"), { recursive: true });
  await writeFile(path.join(root, "course-assets/captions/video-test.vtt"), "WEBVTT\n");
  const video = { source_key: "video-test", approval_status: "approved", checksum_sha256: "a".repeat(64) };
  const assets = await buildDerivativePair(video, { records: [] }, root);
  assert.deepEqual(assets.map((asset) => asset.approval_status), ["missing", "missing"]);
  assert.deepEqual(assets.map((asset) => asset.checksum_sha256), [null, null]);
});

test("buildManifest refuses forged caption evidence before emitting approved metadata", async () => {
  const { ledger } = await fixtures();
  ledger.records[0].evidence_sha256 = "f".repeat(64);
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-ledger-"));
  const ledgerPath = path.join(root, "caption-approvals.json");
  await writeFile(ledgerPath, JSON.stringify(ledger));
  await assert.rejects(buildManifest({ captionApprovalLedgerPath: ledgerPath }), /Caption approval ledger is invalid/);
});
