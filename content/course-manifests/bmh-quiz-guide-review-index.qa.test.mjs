import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  buildReviewIndex,
  renderReviewIndex,
  validateGuideManifestBindings,
} from "../../scripts/course-content/build-quiz-guide-review-index.mjs";
import {
  guideApprovalRecordsSha256,
  validateGuideApprovalLedger,
} from "../../scripts/course-content/build-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const INDEX_JSON_PATH = path.resolve(ROOT, "docs/course-production/quiz-guide-review-index.v1.json");
const INDEX_MARKDOWN_PATH = path.resolve(ROOT, "docs/course-production/quiz-guide-review-index.v1.md");
const QUIZ_LEDGER_PATH = path.resolve(ROOT, "docs/course-production/quiz-approvals.json");
const GUIDE_LEDGER_PATH = path.resolve(ROOT, "docs/course-production/guide-approvals.json");
const QUIZBANK_MANIFEST_PATH = path.resolve(ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const DEFAULT_MANIFEST_PATH = path.resolve(ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const ACCEPTED_GUIDE_RECORDS_SHA256 = "70f94a88356cf0cddf3567295122733980b04af6cc4c96a23687c8d717f473c3";
const ACCEPTED_SLOT_16_SHA256 = "71c9ad3757b135363ec12bdb3538a4aac388124cc30223304714e2bb5d2017ad";
const ACCEPTED_SLOT_16_SIZE = 50695;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("combined index binds the approved quizbank review and all regenerated guides", async () => {
  const [index, persistedIndex, persistedMarkdown, guideLedger] = await Promise.all([
    buildReviewIndex(),
    readFile(INDEX_JSON_PATH, "utf8").then(JSON.parse),
    readFile(INDEX_MARKDOWN_PATH, "utf8"),
    readFile(GUIDE_LEDGER_PATH, "utf8").then(JSON.parse),
  ]);

  assert.deepEqual(persistedIndex, index);
  assert.equal(persistedMarkdown, renderReviewIndex(index));
  assert.equal(index.status, "quiz_and_guides_approved");
  assert.equal(index.quiz_review.status, "approved");
  assert.equal(index.quiz_review.approved_by, "Claude independent content review");
  assert.equal(index.quiz_review.approved_at, "2026-07-22T13:21:48Z");
  assert.equal(index.quiz_review.quiz_pools.length, 19);
  assert.equal(index.quiz_review.quiz_pools.reduce((sum, quiz) => sum + quiz.question_count, 0), 920);
  assert.ok(index.quiz_review.quiz_pools.every((quiz) => quiz.approval_status === "approved"));
  assert.ok(new Set(index.quiz_review.quiz_pools.map((quiz) => quiz.question_count)).size > 1);
  assert.equal(index.quiz_review.questions_per_pool, null);
  assert.equal(index.quiz_review.questions_per_attempt, null);
  assert.equal(index.quiz_review.quiz_pools.filter((quiz) => quiz.quiz_source_key === "quiz-slot-16").length, 1);
  assert.equal(index.guide_review.status, "accepted");
  assert.equal(index.guide_review.accepted_by, "codex-course-qa-controller");
  assert.equal(index.guide_review.human_approval, false);
  assert.equal(index.guide_review.ledger.record_count, 19);
  assert.equal(index.guide_review.ledger.records_sha256, ACCEPTED_GUIDE_RECORDS_SHA256);
  assert.equal(index.guide_review.ledger.records_sha256, guideApprovalRecordsSha256(guideLedger.records));
  assert.equal(index.guide_review.current_file.sha256, ACCEPTED_SLOT_16_SHA256);
  assert.equal(index.guide_review.current_file.size_bytes, ACCEPTED_SLOT_16_SIZE);

  const [requestBytes, reviewBytes, guideBytes, guideStats] = await Promise.all([
    readFile(path.resolve(ROOT, index.quiz_review.request.path)),
    readFile(path.resolve(ROOT, index.quiz_review.full_review.path)),
    readFile(path.resolve(ROOT, index.guide_review.current_file.path)),
    stat(path.resolve(ROOT, index.guide_review.current_file.path)),
  ]);
  assert.equal(sha256(requestBytes), index.quiz_review.request.sha256);
  assert.equal(sha256(reviewBytes), index.quiz_review.full_review.sha256);
  assert.equal(sha256(guideBytes), index.guide_review.current_file.sha256);
  assert.equal(guideStats.size, index.guide_review.current_file.size_bytes);
  assert.match(
    persistedMarkdown,
    /\[Open the full 920-question quizbank review\]\(\.\/quiz-content-review\.quizbank\.v1\.md\)/,
  );
  assert.match(
    persistedMarkdown,
    /\[Open the current Slot 16 learner guide sample\]\(\.\.\/\.\.\/output\/pdf\/slot-16-learner-guide\.pdf\)/,
  );
});

test("recorded quiz and course-QA guide approvals stay distinct and checksum bound", async () => {
  const index = await buildReviewIndex();

  assert.equal(index.quiz_review.status, "approved");
  assert.match(index.quiz_review.evidence, /independently verified/i);
  assert.match(index.quiz_review.evidence, /content-quality v8/i);
  assert.equal(index.guide_review.status, "accepted");
  assert.equal(index.guide_review.human_approval, false);
  assert.match(index.guide_review.evidence, /deterministic rebuild/i);
  assert.match(index.guide_review.evidence, /semantic tests/i);
  assert.match(index.guide_review.evidence, /visual review/i);
});

test("review index reflects quiz approval and the complete guide reacceptance", async () => {
  const [quizLedger, guideLedger, index] = await Promise.all([
    readFile(QUIZ_LEDGER_PATH, "utf8").then(JSON.parse),
    readFile(GUIDE_LEDGER_PATH, "utf8").then(JSON.parse),
    buildReviewIndex(),
  ]);

  assert.equal(quizLedger.records.length, 19);
  assert.ok(quizLedger.records.every((record) => record.decision === "approved"));
  assert.equal(guideLedger.acceptance.human_approval, false);
  assert.deepEqual(validateGuideApprovalLedger(guideLedger), []);
  assert.equal(guideLedger.acceptance.records_sha256, ACCEPTED_GUIDE_RECORDS_SHA256);
  const slot16Record = guideLedger.records.find((record) => record.source_key === "guide-slot-16");
  assert.equal(slot16Record.checksum_sha256, index.guide_review.current_file.sha256);
  assert.equal(slot16Record.size_bytes, index.guide_review.current_file.size_bytes);
  assert.match(index.scope_note, /records the independent content reviewer's checksum-bound approval/i);
  assert.match(index.scope_note, /guide ledger records course-QA controller acceptance/i);
  assert.match(index.scope_note, /Neither approval authorizes import, publication/i);
});

test("guide index binding rejects non-Slot-16 file, manifest, and accepted-record drift", async () => {
  const [guideLedger, quizbankManifest, defaultManifest] = await Promise.all([
    readFile(GUIDE_LEDGER_PATH, "utf8").then(JSON.parse),
    readFile(QUIZBANK_MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(DEFAULT_MANIFEST_PATH, "utf8").then(JSON.parse),
  ]);
  const guideFiles = guideLedger.records.map((record) => ({ ...record }));
  const bindings = (ledger, quizbank, fallback, files = guideFiles) =>
    validateGuideManifestBindings({
      guideLedger: ledger,
      guideFiles: files,
      manifests: [
        { label: "Quizbank manifest", manifest: quizbank },
        { label: "Default manifest", manifest: fallback },
      ],
    });

  assert.deepEqual(bindings(guideLedger, quizbankManifest, defaultManifest), []);

  const driftedFile = structuredClone(guideFiles);
  driftedFile.find((file) => file.source_key === "guide-slot-01").size_bytes += 1;
  assert.match(bindings(guideLedger, quizbankManifest, defaultManifest, driftedFile).join("\n"), /Live guide-slot-01 guide size drifted/);

  const driftedDefaultManifest = structuredClone(defaultManifest);
  driftedDefaultManifest.assets.find((asset) => asset.source_key === "guide-slot-01").checksum_sha256 = "0".repeat(64);
  assert.match(bindings(guideLedger, quizbankManifest, driftedDefaultManifest).join("\n"), /Default manifest guide-slot-01 checksum drifted/);

  const rewrittenLedger = structuredClone(guideLedger);
  rewrittenLedger.records.find((record) => record.source_key === "guide-slot-01").checksum_sha256 = "0".repeat(64);
  rewrittenLedger.acceptance.records_sha256 = guideApprovalRecordsSha256(rewrittenLedger.records);
  assert.deepEqual(validateGuideApprovalLedger(rewrittenLedger), []);
  const rewrittenErrors = bindings(rewrittenLedger, quizbankManifest, defaultManifest).join("\n");
  assert.match(rewrittenErrors, /Live guide-slot-01 guide checksum drifted/);
  assert.match(rewrittenErrors, /Quizbank manifest guide-slot-01 checksum drifted/);
  assert.match(rewrittenErrors, /Default manifest guide-slot-01 checksum drifted/);
});

test("builder check verifies deterministic approved review artifacts", () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve(ROOT, "scripts/course-content/build-quiz-guide-review-index.mjs"), "--check"],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Verified docs\/course-production\/quiz-guide-review-index\.v1\.json/);
});
