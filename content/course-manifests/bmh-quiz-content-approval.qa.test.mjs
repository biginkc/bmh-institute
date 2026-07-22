import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  quizApprovalStatus,
  quizBindingsSha256,
  quizContentSha256,
  validateQuizApprovalLedger,
} from "../../scripts/course-content/build-manifest.mjs";
import {
  renderQuizReview,
  reviewSha256,
} from "../../scripts/course-content/build-quiz-review.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = resolve(import.meta.dirname, "bmh-employee-training.quizbank.v1.json");
const DEFAULT_MANIFEST_PATH = resolve(import.meta.dirname, "bmh-employee-training.v1.json");
const REQUEST_PATH = resolve(ROOT, "docs/course-production/quiz-content-review-request.v1.json");
const LEDGER_PATH = resolve(ROOT, "docs/course-production/quiz-approvals.json");
const REVIEW_PATH = resolve(ROOT, "docs/course-production/quiz-content-review.quizbank.v1.md");
const ACCEPTED_SLOT_16_GUIDE_SHA256 = "1ea291e1190ba6f990407cff53160ef90c1acf787e5e66ed6686a2d9984d7c5d";
const ACCEPTED_SLOT_16_GUIDE_SIZE = 50676;

function manifestQuizzes(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.type === "quiz")
    .map((lesson) => lesson.quiz);
}

test("quiz review request binds all 19 exact pools while the reaccepted Slot 16 guide stays approved", async () => {
  const [manifest, request, ledger, requestBytes, review] = await Promise.all([
    readFile(MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(REQUEST_PATH, "utf8").then(JSON.parse),
    readFile(LEDGER_PATH, "utf8").then(JSON.parse),
    readFile(REQUEST_PATH),
    readFile(REVIEW_PATH, "utf8"),
  ]);
  const quizzes = manifestQuizzes(manifest);
  const slot16Guide = manifest.assets.find((asset) => asset.source_key === "guide-slot-16");

  assert.equal(manifest.status, "draft");
  assert.equal(manifest.program.is_published, false);
  assert.ok(manifest.program.courses.every((course) => course.is_published === false));
  assert.equal(slot16Guide.approval_status, "approved");
  assert.equal(slot16Guide.checksum_sha256, ACCEPTED_SLOT_16_GUIDE_SHA256);
  assert.equal(slot16Guide.size_bytes, ACCEPTED_SLOT_16_GUIDE_SIZE);
  assert.equal(request.request_id, "bmh-employee-training-quiz-review-2026-07-20-quizbank-v1");
  assert.equal(request.created_at, "2026-07-20T21:00:00Z");
  assert.equal(request.status, "pending_human_review");
  assert.equal(request.scope.manifest_path, "content/course-manifests/bmh-employee-training.quizbank.v1.json");
  assert.equal(request.scope.import_id, "bmh-employee-training-v1");
  assert.equal(request.scope.quiz_pool_count, 19);
  assert.equal(request.scope.question_count, 920);
  assert.equal(request.scope.questions_per_pool, null);
  assert.equal(request.scope.questions_per_attempt, null);
  assert.equal(request.quiz_pools.length, 19);
  assert.equal(request.quiz_pools.reduce((sum, pool) => sum + pool.question_count, 0), 920);
  assert.equal(request.scope.quiz_bindings_sha256, quizBindingsSha256(request.quiz_pools));
  assert.equal(ledger.records.length, 19);
  assert.equal(
    createHash("sha256").update(requestBytes).digest("hex"),
    ledger.request_sha256,
  );
  assert.deepEqual(await validateQuizApprovalLedger(ledger), []);
  assert.equal(review, renderQuizReview(manifest));
  assert.equal(request.review_surface.path, "docs/course-production/quiz-content-review.quizbank.v1.md");
  assert.equal(request.review_surface.sha256, reviewSha256(review));
  assert.match(review, /^Status: \*\*all quiz pools marked approved in this manifest\*\*\./m);
  assert.equal((review.match(/^- Question key:/gm) ?? []).length, 920);
  assert.equal((review.match(/Policy-safe Slot 16 replacement/g) ?? []).length, 0);
  assert.equal((review.match(/^Explanation:/gm) ?? []).length, 920);
  assert.ok((review.match(/\[correct\]/g) ?? []).length >= 920);

  for (const quiz of quizzes) {
    const binding = request.quiz_pools.find((candidate) =>
      candidate.quiz_source_key === quiz.source_key
    );
    const approval = ledger.records.find((candidate) =>
      candidate.quiz_source_key === quiz.source_key
    );
    assert.ok(binding, `${quiz.source_key} is present in the review request`);
    assert.equal(binding.question_count, quiz.questions.length);
    assert.equal(binding.content_sha256, quizContentSha256(quiz));
    assert.equal(binding.approval_status, "pending_human_review");
    assert.equal(approval.content_sha256, quizContentSha256(quiz));
    assert.equal(approval.request_sha256, ledger.request_sha256);
    assert.equal(approval.decision, "approved");
    assert.equal(approval.approved_by, "Jarrad Henry");
    assert.equal(approval.approved_at, "2026-07-20T21:05:00Z");
    assert.equal(
      approval.evidence,
      "Reviewed docs/course-production/quiz-content-review.quizbank.v1.md; approval given in Claude session 2026-07-20",
    );
    assert.equal(quiz.approval_status, "approved");
    assert.equal(quizApprovalStatus(ledger, quiz), "approved");
  }
});

test("only an exact checksum-bound response can keep a quiz approved", async () => {
  const [manifest, ledger] = await Promise.all([
    readFile(MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(LEDGER_PATH, "utf8").then(JSON.parse),
  ]);
  const quiz = manifestQuizzes(manifest)
    .find((candidate) => candidate.source_key === "quiz-slot-16");

  assert.equal(quizApprovalStatus(ledger, quiz), "approved");

  const forged = structuredClone(ledger);
  const record = forged.records.find((candidate) =>
    candidate.quiz_source_key === quiz.source_key
  );
  record.content_sha256 = "0".repeat(64);
  assert.match(
    (await validateQuizApprovalLedger(forged)).join("\n"),
    /does not match an exact pool/i,
  );
  assert.equal(quizApprovalStatus(forged, quiz), "pending_human_review");

  const missingEvidence = structuredClone(ledger);
  delete missingEvidence.records[0].evidence;
  assert.match(
    (await validateQuizApprovalLedger(missingEvidence)).join("\n"),
    /needs approval evidence/i,
  );
});

test("the sole active default pools exactly retain their checksum-bound approvals", async () => {
  const [manifest, ledger] = await Promise.all([
    readFile(DEFAULT_MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(LEDGER_PATH, "utf8").then(JSON.parse),
  ]);

  for (const quiz of manifestQuizzes(manifest)) {
    assert.equal(quiz.approval_status, "approved");
    assert.equal(quizApprovalStatus(ledger, quiz), "approved");
  }
});

test("a forged review-request checksum cannot validate the approval ledger", async () => {
  const ledger = await readFile(LEDGER_PATH, "utf8").then(JSON.parse);
  const forged = structuredClone(ledger);
  forged.request_sha256 = "0".repeat(64);
  assert.match(
    (await validateQuizApprovalLedger(forged)).join("\n"),
    /not bound to the exact review request/i,
  );
});

test("the approval ledger fails closed when its exact review packet is missing or changed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bmh-quiz-review-packet-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const productionDocs = resolve(root, "docs/course-production");
  await mkdir(productionDocs, { recursive: true });
  const [requestBytes, ledger] = await Promise.all([
    readFile(REQUEST_PATH),
    readFile(LEDGER_PATH, "utf8").then(JSON.parse),
  ]);
  await writeFile(resolve(productionDocs, "quiz-content-review-request.v1.json"), requestBytes);

  assert.match(
    (await validateQuizApprovalLedger(ledger, root)).join("\n"),
    /review surface is missing/i,
  );

  await writeFile(resolve(productionDocs, "quiz-content-review.quizbank.v1.md"), "changed review packet\n");
  assert.match(
    (await validateQuizApprovalLedger(ledger, root)).join("\n"),
    /not bound to the exact review packet/i,
  );
});

test("a malformed checksum-bound pool returns validation errors instead of throwing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bmh-quiz-review-malformed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const productionDocs = resolve(root, "docs/course-production");
  await mkdir(productionDocs, { recursive: true });
  const [request, ledger, reviewBytes] = await Promise.all([
    readFile(REQUEST_PATH, "utf8").then(JSON.parse),
    readFile(LEDGER_PATH, "utf8").then(JSON.parse),
    readFile(REVIEW_PATH),
  ]);
  request.quiz_pools[0] = null;
  const requestBytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
  const requestSha256 = createHash("sha256").update(requestBytes).digest("hex");
  ledger.request_sha256 = requestSha256;
  for (const record of ledger.records) record.request_sha256 = requestSha256;
  await Promise.all([
    writeFile(resolve(productionDocs, "quiz-content-review-request.v1.json"), requestBytes),
    writeFile(resolve(productionDocs, "quiz-content-review.quizbank.v1.md"), reviewBytes),
  ]);

  const errors = await validateQuizApprovalLedger(ledger, root);
  assert.match(errors.join("\n"), /invalid quiz source key/i);
  assert.match(errors.join("\n"), /does not match an exact pool/i);
});
