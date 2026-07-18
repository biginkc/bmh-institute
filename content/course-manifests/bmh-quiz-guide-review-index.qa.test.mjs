import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  buildReviewIndex,
  renderReviewIndex,
} from "../../scripts/course-content/build-quiz-guide-review-index.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const INDEX_JSON_PATH = path.resolve(ROOT, "docs/course-production/quiz-guide-review-index.v1.json");
const INDEX_MARKDOWN_PATH = path.resolve(ROOT, "docs/course-production/quiz-guide-review-index.v1.md");
const QUIZ_LEDGER_PATH = path.resolve(ROOT, "docs/course-production/quiz-approvals.json");
const GUIDE_LEDGER_PATH = path.resolve(ROOT, "docs/course-production/guide-approvals.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("combined index binds the complete quiz review and current changed guide", async () => {
  const [index, persistedIndex, persistedMarkdown] = await Promise.all([
    buildReviewIndex(),
    readFile(INDEX_JSON_PATH, "utf8").then(JSON.parse),
    readFile(INDEX_MARKDOWN_PATH, "utf8"),
  ]);

  assert.deepEqual(persistedIndex, index);
  assert.equal(persistedMarkdown, renderReviewIndex(index));
  assert.equal(index.status, "pending_two_separate_human_decisions");
  assert.equal(index.quiz_review.quiz_pools.length, 19);
  assert.equal(index.quiz_review.quiz_pools.reduce((sum, quiz) => sum + quiz.question_count, 0), 342);
  assert.equal(index.quiz_review.quiz_pools.filter((quiz) => quiz.quiz_source_key === "quiz-slot-16").length, 1);
  assert.notEqual(index.guide_review.current_file.sha256, index.guide_review.superseded_course_qa_record.sha256);

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
    /\[Open the full 342-question quiz review\]\(\.\/quiz-content-review\.v1\.md\)/,
  );
  assert.match(
    persistedMarkdown,
    /\[Open the current Slot 16 learner guide\]\(\.\.\/\.\.\/output\/pdf\/slot-16-learner-guide\.pdf\)/,
  );
});

test("quiz and guide decisions require distinct exact checksum-bound wording", async () => {
  const index = await buildReviewIndex();
  const quizResponse = index.quiz_review.exact_approval_response;
  const guideResponse = index.guide_review.exact_approval_response;

  assert.notEqual(quizResponse, guideResponse);
  assert.match(quizResponse, new RegExp(index.quiz_review.request.sha256));
  assert.match(guideResponse, new RegExp(index.guide_review.current_file.sha256));
  assert.match(guideResponse, new RegExp(String(index.guide_review.current_file.size_bytes)));
  assert.equal(index.quiz_review.bare_approved_is_valid, false);
  assert.equal(index.guide_review.bare_approved_is_valid, false);
});

test("review index creates no quiz approval or guide reacceptance", async () => {
  const [quizLedger, guideLedger, index] = await Promise.all([
    readFile(QUIZ_LEDGER_PATH, "utf8").then(JSON.parse),
    readFile(GUIDE_LEDGER_PATH, "utf8").then(JSON.parse),
    buildReviewIndex(),
  ]);

  assert.equal(quizLedger.records.length, 0);
  assert.equal(guideLedger.acceptance.human_approval, false);
  assert.notEqual(
    guideLedger.records.find((record) => record.source_key === "guide-slot-16").checksum_sha256,
    index.guide_review.current_file.sha256,
  );
  assert.match(index.scope_note, /does not record approval/i);
  assert.match(index.scope_note, /does not.*authorize import or publication/i);
});

test("builder check verifies deterministic review artifacts", () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve(ROOT, "scripts/course-content/build-quiz-guide-review-index.mjs"), "--check"],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Verified docs\/course-production\/quiz-guide-review-index\.v1\.json/);
});
