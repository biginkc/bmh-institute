import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  quizApprovalStatus,
  quizContentSha256,
  validateQuizApprovalLedger,
} from "../../scripts/course-content/build-manifest.mjs";
import {
  renderQuizReview,
  reviewSha256,
} from "../../scripts/course-content/build-quiz-review.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = resolve(import.meta.dirname, "bmh-employee-training.v1.json");
const REQUEST_PATH = resolve(ROOT, "docs/course-production/quiz-content-review-request.v1.json");
const LEDGER_PATH = resolve(ROOT, "docs/course-production/quiz-approvals.json");
const REVIEW_PATH = resolve(ROOT, "docs/course-production/quiz-content-review.v1.md");

test("quiz review request binds all 19 exact pools and the changed KPI guide", async () => {
  const [manifest, request, ledger, requestBytes, review] = await Promise.all([
    readFile(MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(REQUEST_PATH, "utf8").then(JSON.parse),
    readFile(LEDGER_PATH, "utf8").then(JSON.parse),
    readFile(REQUEST_PATH),
    readFile(REVIEW_PATH, "utf8"),
  ]);
  const quizzes = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.type === "quiz")
    .map((lesson) => lesson.quiz);
  const assets = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));

  assert.equal(request.status, "pending_human_review");
  assert.equal(request.quiz_pools.length, 19);
  assert.equal(request.scope.question_count, 342);
  assert.equal(ledger.records.length, 0, "the request must not fabricate a human approval response");
  assert.equal(
    createHash("sha256").update(requestBytes).digest("hex"),
    ledger.request_sha256,
  );
  assert.deepEqual(await validateQuizApprovalLedger(ledger), []);
  assert.equal(review, renderQuizReview(manifest));
  assert.equal(request.review_surface.path, "docs/course-production/quiz-content-review.v1.md");
  assert.equal(request.review_surface.sha256, reviewSha256(review));
  assert.equal((review.match(/^- Question key:/gm) ?? []).length, 342);
  assert.equal((review.match(/Policy-safe Slot 16 replacement/g) ?? []).length, 2);
  assert.equal((review.match(/^Explanation:/gm) ?? []).length, 342);
  assert.ok((review.match(/\[correct\]/g) ?? []).length >= 342);

  for (const quiz of quizzes) {
    const binding = request.quiz_pools.find((candidate) =>
      candidate.quiz_source_key === quiz.source_key
    );
    assert.ok(binding, `${quiz.source_key} is present in the review request`);
    assert.equal(binding.question_count, 18);
    assert.equal(binding.content_sha256, quizContentSha256(quiz));
    assert.equal(binding.approval_status, "pending_human_review");
    assert.equal(quiz.approval_status, "pending_human_review");
  }

  const guide = assets.get("guide-slot-16");
  const guideStat = await stat(resolve(ROOT, guide.local_path));
  assert.equal(request.guide_binding.checksum_sha256, guide.checksum_sha256);
  assert.equal(request.guide_binding.size_bytes, guideStat.size);
  assert.equal(guide.approval_status, "missing");
});

test("only an exact checksum-bound response can flip a quiz to approved", async () => {
  const [manifest, ledger] = await Promise.all([
    readFile(MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(LEDGER_PATH, "utf8").then(JSON.parse),
  ]);
  const quiz = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .find((lesson) => lesson.source_key === "lesson-quiz-slot-16")
    .quiz;

  assert.equal(quizApprovalStatus(ledger, quiz), "pending_human_review");

  const approved = structuredClone(ledger);
  approved.records.push({
    quiz_source_key: quiz.source_key,
    content_sha256: quizContentSha256(quiz),
    request_sha256: approved.request_sha256,
    decision: "approved",
    approved_by: "Jarrad Henry",
    approved_at: "2026-07-18T19:00:00Z",
  });
  assert.deepEqual(await validateQuizApprovalLedger(approved), []);
  assert.equal(quizApprovalStatus(approved, quiz), "approved");

  approved.records[0].content_sha256 = "0".repeat(64);
  assert.match(
    (await validateQuizApprovalLedger(approved)).join("\n"),
    /does not match an exact pool/i,
  );
  assert.equal(quizApprovalStatus(approved, quiz), "pending_human_review");
});

test("release validation cannot treat a missing quiz approval status as approved", async () => {
  const ledger = await readFile(LEDGER_PATH, "utf8").then(JSON.parse);
  const forged = structuredClone(ledger);
  forged.request_sha256 = "0".repeat(64);
  assert.match(
    (await validateQuizApprovalLedger(forged)).join("\n"),
    /not bound to the exact review request/i,
  );
});
