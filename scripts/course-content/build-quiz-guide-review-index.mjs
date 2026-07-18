import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const REQUEST_PATH = "docs/course-production/quiz-content-review-request.v1.json";
const GUIDE_LEDGER_PATH = "docs/course-production/guide-approvals.json";
const QUIZ_LEDGER_PATH = "docs/course-production/quiz-approvals.json";
const OUTPUT_JSON_PATH = "docs/course-production/quiz-guide-review-index.v1.json";
const OUTPUT_MARKDOWN_PATH = "docs/course-production/quiz-guide-review-index.v1.md";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(ROOT, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approvalWording(requestSha256, guide) {
  return {
    quizzes: `Approved quizzes: I reviewed and approve all 19 exact quiz pools bound to request SHA-256 ${requestSha256}.`,
    guide: `Approved guide: I reviewed the current Slot 16 learner guide bound to SHA-256 ${guide.checksum_sha256} and size ${guide.size_bytes} bytes for course-QA reacceptance.`,
  };
}

export async function buildReviewIndex() {
  const [requestBytes, request, guideLedger, quizLedger] = await Promise.all([
    readFile(path.resolve(ROOT, REQUEST_PATH)),
    readJson(REQUEST_PATH),
    readJson(GUIDE_LEDGER_PATH),
    readJson(QUIZ_LEDGER_PATH),
  ]);
  const requestSha256 = sha256(requestBytes);
  const reviewPath = request.review_surface.path;
  const guidePath = request.guide_binding.local_path;
  const [reviewBytes, guideBytes, guideStats] = await Promise.all([
    readFile(path.resolve(ROOT, reviewPath)),
    readFile(path.resolve(ROOT, guidePath)),
    stat(path.resolve(ROOT, guidePath)),
  ]);
  const oldGuideRecord = guideLedger.records.find(
    (record) => record.source_key === request.guide_binding.source_key,
  );

  assert(request.schema_version === "bmh-quiz-content-review-request/v1", "Unexpected quiz review request schema");
  assert(request.status === "pending_human_review", "Quiz review request is no longer pending human review");
  assert(requestSha256 === quizLedger.request_sha256, "Quiz ledger is not bound to the exact review request");
  assert(quizLedger.records.length === 0, "Quiz ledger is no longer empty; rebuild the human review index for the new state");
  assert(sha256(reviewBytes) === request.review_surface.sha256, "Full quiz review checksum does not match its request binding");
  assert(sha256(guideBytes) === request.guide_binding.checksum_sha256, "Slot 16 guide checksum does not match its request binding");
  assert(guideStats.size === request.guide_binding.size_bytes, "Slot 16 guide size does not match its request binding");
  assert(request.quiz_pools.length === 19, "Expected exactly 19 quiz pools");
  assert(new Set(request.quiz_pools.map((quiz) => quiz.quiz_source_key)).size === 19, "Quiz pool keys must be unique");
  assert(new Set(request.quiz_pools.map((quiz) => quiz.content_sha256)).size === 19, "Quiz pool checksums must be unique");
  assert(request.quiz_pools.every((quiz) => quiz.question_count === 18), "Every quiz pool must contain 18 questions");
  assert(request.quiz_pools.every((quiz) => quiz.approval_status === "pending_human_review"), "Every quiz pool must remain pending human review");
  assert(request.quiz_pools.reduce((sum, quiz) => sum + quiz.question_count, 0) === 342, "Expected exactly 342 quiz questions");
  assert(oldGuideRecord, "Existing Slot 16 guide acceptance record is missing");
  assert(
    oldGuideRecord.checksum_sha256 !== request.guide_binding.checksum_sha256 ||
      oldGuideRecord.size_bytes !== request.guide_binding.size_bytes,
    "Slot 16 guide already matches the existing course-QA acceptance record",
  );

  const exactResponse = approvalWording(requestSha256, request.guide_binding);
  return {
    schema_version: "bmh-quiz-guide-review-index/v1",
    index_id: "bmh-employee-training-quiz-guide-review-2026-07-18-v1",
    status: "pending_two_separate_human_decisions",
    scope_note: "This index is a review surface only. It does not record approval, change either ledger, authorize import or publication, or grant employee access.",
    quiz_review: {
      status: request.status,
      question: "Do you approve all 19 exact quiz pools shown in the full review?",
      exact_approval_response: exactResponse.quizzes,
      bare_approved_is_valid: false,
      request: {
        path: REQUEST_PATH,
        sha256: requestSha256,
        request_id: request.request_id,
      },
      full_review: {
        path: reviewPath,
        sha256: request.review_surface.sha256,
      },
      quiz_pool_count: request.scope.quiz_pool_count,
      question_count: request.scope.question_count,
      questions_per_pool: request.scope.questions_per_pool,
      questions_per_attempt: request.scope.questions_per_attempt,
      quiz_bindings_sha256: request.scope.quiz_bindings_sha256,
      quiz_pools: request.quiz_pools.map((quiz) => ({ ...quiz })),
      controller_follow_up: "Preserve the exact human response and create one checksum-bound approval-ledger record for each of the 19 pools; the response itself does not mutate the ledger.",
    },
    guide_review: {
      status: request.guide_binding.approval_status,
      question: "Do you approve the changed Slot 16 learner guide for course-QA reacceptance?",
      exact_approval_response: exactResponse.guide,
      bare_approved_is_valid: false,
      current_file: {
        source_key: request.guide_binding.source_key,
        path: guidePath,
        sha256: request.guide_binding.checksum_sha256,
        size_bytes: request.guide_binding.size_bytes,
      },
      superseded_course_qa_record: {
        path: GUIDE_LEDGER_PATH,
        sha256: oldGuideRecord.checksum_sha256,
        size_bytes: oldGuideRecord.size_bytes,
        accepted_by: guideLedger.acceptance.accepted_by,
        human_approval: guideLedger.acceptance.human_approval,
      },
      controller_follow_up: "After preserving the exact human response, rerun deterministic rebuild, semantic tests, and visual review; then rebuild and reaccept the complete 19-guide ledger. The response alone does not reaccept the guide.",
    },
  };
}

export function renderReviewIndex(index) {
  const lines = [
    "# BMH Institute quiz and Slot 16 guide review",
    "",
    "Status: **two separate human decisions required**.",
    "",
    "> This page does not approve anything. Quiz approval and guide approval are separate. A bare `approved` is not enough to identify either checksum-bound decision.",
    "",
    "## 1. Quiz pools",
    "",
    `[Open the full 342-question quiz review](./${path.basename(index.quiz_review.full_review.path)})`,
    "",
    `- Exact request: [${path.basename(index.quiz_review.request.path)}](./${path.basename(index.quiz_review.request.path)})`,
    `- Request SHA-256: \`${index.quiz_review.request.sha256}\``,
    `- Full review SHA-256: \`${index.quiz_review.full_review.sha256}\``,
    `- Scope: ${index.quiz_review.quiz_pool_count} pools, ${index.quiz_review.question_count} questions, ${index.quiz_review.questions_per_pool} per pool, ${index.quiz_review.questions_per_attempt} randomized per attempt`,
    "",
    `**Question:** ${index.quiz_review.question}`,
    "",
    "If approved, respond exactly:",
    "",
    `> ${index.quiz_review.exact_approval_response}`,
    "",
    "| Quiz pool | Questions | SHA-256 |",
    "| --- | ---: | --- |",
    ...index.quiz_review.quiz_pools.map(
      (quiz) => `| \`${quiz.quiz_source_key}\` | ${quiz.question_count} | \`${quiz.content_sha256}\` |`,
    ),
    "",
    "## 2. Changed Slot 16 learner guide",
    "",
    `[Open the current Slot 16 learner guide](../../${index.guide_review.current_file.path})`,
    "",
    `- Current SHA-256: \`${index.guide_review.current_file.sha256}\``,
    `- Current size: ${index.guide_review.current_file.size_bytes} bytes`,
    `- Superseded course-QA record SHA-256: \`${index.guide_review.superseded_course_qa_record.sha256}\``,
    `- Superseded size: ${index.guide_review.superseded_course_qa_record.size_bytes} bytes`,
    "",
    "The current PDF differs from the accepted course-QA record. Human approval permits the controller to perform reacceptance checks; it does not itself rewrite the guide ledger.",
    "",
    `**Question:** ${index.guide_review.question}`,
    "",
    "If approved, respond exactly:",
    "",
    `> ${index.guide_review.exact_approval_response}`,
    "",
    "## What the controller does next",
    "",
    `- Quizzes: ${index.quiz_review.controller_follow_up}`,
    `- Guide: ${index.guide_review.controller_follow_up}`,
    "- Neither decision authorizes course import, publication, or employee access.",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const mode = process.argv[2] ?? "--check";
  if (!["--check", "--write"].includes(mode) || process.argv.length > 3) {
    throw new Error("Usage: node scripts/course-content/build-quiz-guide-review-index.mjs [--check|--write]");
  }

  const index = await buildReviewIndex();
  const json = `${JSON.stringify(index, null, 2)}\n`;
  const markdown = renderReviewIndex(index);
  if (mode === "--write") {
    await Promise.all([
      writeFile(path.resolve(ROOT, OUTPUT_JSON_PATH), json),
      writeFile(path.resolve(ROOT, OUTPUT_MARKDOWN_PATH), markdown),
    ]);
    console.log(`Wrote ${OUTPUT_JSON_PATH}`);
    console.log(`Wrote ${OUTPUT_MARKDOWN_PATH}`);
    return;
  }

  const [existingJson, existingMarkdown] = await Promise.all([
    readFile(path.resolve(ROOT, OUTPUT_JSON_PATH), "utf8"),
    readFile(path.resolve(ROOT, OUTPUT_MARKDOWN_PATH), "utf8"),
  ]);
  assert(existingJson === json, `${OUTPUT_JSON_PATH} is stale`);
  assert(existingMarkdown === markdown, `${OUTPUT_MARKDOWN_PATH} is stale`);
  console.log(`Verified ${OUTPUT_JSON_PATH}`);
  console.log(`Verified ${OUTPUT_MARKDOWN_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
