import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  video.checksum_sha256 = "a".repeat(64);
  caption.checksum_sha256 = "b".repeat(64);
  ledger.records.push({
    ...ledger.records[0],
    video_sha256: video.checksum_sha256,
    caption_sha256: caption.checksum_sha256,
    transcript_sha256: "c".repeat(64),
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

test("caption approval history fails closed without an immutable committed baseline", async () => {
  const { ledger } = await fixtures();
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-no-baseline-"));
  const ledgerPath = path.join(root, "caption-approvals.json");
  await writeFile(ledgerPath, `${JSON.stringify(ledger)}\n`);
  try {
    const errors = await validateCaptionApprovalHistory({ ledger, repoRoot: root, ledgerPath });
    assert.ok(errors.some((error) => error.includes("committed HEAD ledger")));
    assert.ok(errors.some((error) => error.includes("immutable predecessor baseline")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("caption approval history rejects a rewrite committed at a GitHub synthetic merge feature tip", async () => {
  const { ledger } = await fixtures();
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-merge-"));
  const ledgerPath = path.join(root, "caption-approvals.json");
  const git = (...args) => execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "Caption QA");
    git("config", "user.email", "caption-qa@example.invalid");
    await writeFile(path.join(root, "base.txt"), "base branch predates caption approvals\n");
    git("add", "base.txt");
    git("commit", "-m", "base without caption approvals");

    git("switch", "-c", "feature");
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    git("add", "caption-approvals.json");
    git("commit", "-m", "add immutable caption approvals");

    const rewritten = structuredClone(ledger);
    rewritten.records.shift();
    await writeFile(ledgerPath, `${JSON.stringify(rewritten, null, 2)}\n`);
    git("add", "caption-approvals.json");
    git("commit", "-m", "rewrite caption approval history");
    await writeFile(path.join(root, "feature.txt"), "unrelated commit after the rewrite\n");
    git("add", "feature.txt");
    git("commit", "-m", "unrelated feature work after rewrite");

    git("switch", "-c", "synthetic-merge", "main");
    git("merge", "--no-ff", "feature", "-m", "GitHub-style pull request merge");
    assert.equal(git("rev-list", "--parents", "-n", "1", "HEAD").trim().split(/\s+/).length, 3);
    assert.equal(
      git("show", "HEAD^2^:caption-approvals.json"),
      `${JSON.stringify(rewritten, null, 2)}\n`,
      "the immediate feature predecessor is already compromised in this attack",
    );

    const mergeLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const errors = await validateCaptionApprovalHistory({
      ledger: mergeLedger,
      repoRoot: root,
      ledgerPath,
    });
    assert.ok(
      errors.some((error) => error.includes("removed or rewritten")),
      `synthetic merge must reject committed caption-history rewrites: ${errors.join("; ")}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("caption approval history rejects a rewrite committed by an ordinary feature merge", async () => {
  const { ledger } = await fixtures();
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-feature-merge-"));
  const ledgerPath = path.join(root, "caption-approvals.json");
  const git = (...args) => execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "Caption QA");
    git("config", "user.email", "caption-qa@example.invalid");
    await writeFile(path.join(root, "base.txt"), "base branch predates caption approvals\n");
    git("add", "base.txt");
    git("commit", "-m", "base without caption approvals");

    git("switch", "-c", "feature");
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    git("add", "caption-approvals.json");
    git("commit", "-m", "add immutable caption approvals");
    const rewritten = structuredClone(ledger);
    rewritten.records.shift();
    await writeFile(ledgerPath, `${JSON.stringify(rewritten, null, 2)}\n`);
    git("add", "caption-approvals.json");
    git("commit", "-m", "rewrite caption approval history");
    await writeFile(path.join(root, "feature.txt"), "unrelated commit after the rewrite\n");
    git("add", "feature.txt");
    git("commit", "-m", "unrelated feature work after rewrite");

    git("switch", "main");
    await writeFile(path.join(root, "main.txt"), "main advanced\n");
    git("add", "main.txt");
    git("commit", "-m", "advance main");

    git("switch", "feature");
    git("merge", "--no-ff", "main", "-m", "merge main after caption rewrite");
    assert.equal(git("rev-list", "--parents", "-n", "1", "HEAD").trim().split(/\s+/).length, 3);
    assert.equal(
      git("show", "HEAD^1:caption-approvals.json"),
      `${JSON.stringify(rewritten, null, 2)}\n`,
      "the ordinary merge first parent is already compromised in this attack",
    );

    const mergeLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const errors = await validateCaptionApprovalHistory({
      ledger: mergeLedger,
      repoRoot: root,
      ledgerPath,
    });
    assert.ok(
      errors.some((error) => error.includes("removed or rewritten")),
      `ordinary merge must reject caption-history rewrites: ${errors.join("; ")}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("caption approval history fails closed when a shallow checkout hides its predecessor", async () => {
  const { ledger } = await fixtures();
  const parent = await mkdtemp(path.join(tmpdir(), "bmh-caption-shallow-"));
  const source = path.join(parent, "source");
  const checkout = path.join(parent, "checkout");
  const git = (cwd, ...args) => execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  try {
    await mkdir(source);
    git(source, "init", "--initial-branch=main");
    git(source, "config", "user.name", "Caption QA");
    git(source, "config", "user.email", "caption-qa@example.invalid");
    await writeFile(path.join(source, "caption-approvals.json"), `${JSON.stringify(ledger, null, 2)}\n`);
    git(source, "add", "caption-approvals.json");
    git(source, "commit", "-m", "add immutable caption approvals");
    const rewritten = structuredClone(ledger);
    rewritten.records.shift();
    await writeFile(path.join(source, "caption-approvals.json"), `${JSON.stringify(rewritten, null, 2)}\n`);
    git(source, "add", "caption-approvals.json");
    git(source, "commit", "-m", "rewrite caption approvals");

    git(parent, "clone", "--depth", "1", `file://${source}`, checkout);
    assert.equal(git(checkout, "rev-parse", "--is-shallow-repository").trim(), "true");
    const ledgerPath = path.join(checkout, "caption-approvals.json");
    const shallowLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const errors = await validateCaptionApprovalHistory({
      ledger: shallowLedger,
      repoRoot: checkout,
      ledgerPath,
    });
    assert.ok(errors.some((error) => error.includes("immutable predecessor baseline")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the builder approves a learner-facing caption only from one composite review record", async () => {
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
  assert.deepEqual(assets.map((asset) => asset.approval_status), ["missing"]);
});

test("an incomplete derivative pair remains atomically missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-incomplete-"));
  await mkdir(path.join(root, "course-assets/captions"), { recursive: true });
  await writeFile(path.join(root, "course-assets/captions/video-test.vtt"), "WEBVTT\n");
  const video = { source_key: "video-test", approval_status: "approved", checksum_sha256: "a".repeat(64) };
  const assets = await buildDerivativePair(video, { records: [] }, root);
  assert.deepEqual(assets.map((asset) => asset.approval_status), ["missing"]);
  assert.deepEqual(assets.map((asset) => asset.checksum_sha256), [null]);
});

test("a directly authorized accessibility cut rebuilds from its tracked caption without a transcript", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-only-"));
  await mkdir(path.join(root, "course-assets/captions"), { recursive: true });
  await writeFile(path.join(root, "course-assets/captions/video-slot-01-welcome.vtt"), "WEBVTT\n");
  const video = {
    source_key: "video-slot-01-welcome",
    approval_status: "approved",
    checksum_sha256: "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72",
  };
  const ledger = {
    records: [{
      status: "approved",
      video_source_key: video.source_key,
      video_sha256: video.checksum_sha256,
      caption_sha256: "73420fdc06730575e08b8a09b5b3824e0f2a9d2dd742640613490ef3abac2bd0",
      transcript_sha256: null,
      decision_source: "caption_accessibility_validation",
    }],
  };

  const assets = await buildDerivativePair(video, ledger, root);

  assert.deepEqual(assets.map((asset) => [asset.kind, asset.approval_status]), [["caption", "approved"]]);
});

test("buildManifest refuses forged caption evidence before emitting approved metadata", async () => {
  const { ledger } = await fixtures();
  ledger.records[0].evidence_sha256 = "f".repeat(64);
  const root = await mkdtemp(path.join(tmpdir(), "bmh-caption-ledger-"));
  const ledgerPath = path.join(root, "caption-approvals.json");
  await writeFile(ledgerPath, JSON.stringify(ledger));
  await assert.rejects(buildManifest({ captionApprovalLedgerPath: ledgerPath }), /Caption approval ledger is invalid/);
});
