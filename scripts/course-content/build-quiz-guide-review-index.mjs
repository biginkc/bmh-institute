import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  quizContentSha256,
  validateQuizApprovalLedger,
} from "./build-manifest.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const REQUEST_PATH = "docs/course-production/quiz-content-review-request.v1.json";
const GUIDE_LEDGER_PATH = "docs/course-production/guide-approvals.json";
const QUIZ_LEDGER_PATH = "docs/course-production/quiz-approvals.json";
const OUTPUT_JSON_PATH = "docs/course-production/quiz-guide-review-index.v1.json";
const OUTPUT_MARKDOWN_PATH = "docs/course-production/quiz-guide-review-index.v1.md";
const GUIDE_SOURCE_KEY = "guide-slot-16";
const GUIDE_PATH = "output/pdf/slot-16-learner-guide.pdf";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(ROOT, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function manifestQuizzes(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .filter((lesson) => lesson.type === "quiz")
    .map((lesson) => lesson.quiz);
}

function guideApprovalWording(guide) {
  return `Approved guide: I reviewed the current Slot 16 learner guide bound to SHA-256 ${guide.checksum_sha256} and size ${guide.size_bytes} bytes for course-QA reacceptance.`;
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
  const [reviewBytes, guideBytes, guideStats, manifest] = await Promise.all([
    readFile(path.resolve(ROOT, reviewPath)),
    readFile(path.resolve(ROOT, GUIDE_PATH)),
    stat(path.resolve(ROOT, GUIDE_PATH)),
    readJson(request.scope.manifest_path),
  ]);
  const quizzes = manifestQuizzes(manifest);
  const guide = {
    source_key: GUIDE_SOURCE_KEY,
    local_path: GUIDE_PATH,
    checksum_sha256: sha256(guideBytes),
    size_bytes: guideStats.size,
    approval_status: "pending_course_qa_reacceptance",
  };
  const oldGuideRecord = guideLedger.records.find(
    (record) => record.source_key === GUIDE_SOURCE_KEY,
  );
  const quizApprovalErrors = await validateQuizApprovalLedger(quizLedger);
  const approvers = new Set(quizLedger.records.map((record) => record.approved_by));
  const approvalTimes = new Set(quizLedger.records.map((record) => record.approved_at));
  const evidence = new Set(quizLedger.records.map((record) => record.evidence));

  assert(request.schema_version === "bmh-quiz-content-review-request/v1", "Unexpected quiz review request schema");
  assert(request.status === "pending_human_review", "Quiz review request is no longer pending human review");
  assert(manifest.import_id === request.scope.import_id, "Quizbank manifest import ID does not match the review request");
  assert(quizzes.length === 19, "Quizbank manifest must contain exactly 19 quiz pools");
  assert(requestSha256 === quizLedger.request_sha256, "Quiz ledger is not bound to the exact review request");
  assert(quizApprovalErrors.length === 0, quizApprovalErrors.join("\n"));
  assert(quizLedger.records.length === 19, "Expected exactly 19 quiz approval records");
  assert(approvers.size === 1, "Quiz approval records must identify one approver");
  assert(approvalTimes.size === 1, "Quiz approval records must identify one approval time");
  assert(evidence.size === 1, "Quiz approval records must identify one evidence statement");
  assert(sha256(reviewBytes) === request.review_surface.sha256, "Full quiz review checksum does not match its request binding");
  assert(request.quiz_pools.length === 19, "Expected exactly 19 quiz pools");
  assert(new Set(request.quiz_pools.map((quiz) => quiz.quiz_source_key)).size === 19, "Quiz pool keys must be unique");
  assert(new Set(request.quiz_pools.map((quiz) => quiz.content_sha256)).size === 19, "Quiz pool checksums must be unique");
  assert(new Set(request.quiz_pools.map((quiz) => quiz.question_count)).size > 1, "Quizbank pool counts must be variable");
  assert(request.quiz_pools.every((quiz) => quiz.approval_status === "pending_human_review"), "Every quiz pool must remain pending human review");
  assert(request.quiz_pools.reduce((sum, quiz) => sum + quiz.question_count, 0) === 920, "Expected exactly 920 quiz questions");
  assert(request.scope.questions_per_pool === null, "Quizbank must declare variable pool sizes");
  assert(request.scope.questions_per_attempt === null, "Quizbank must serve every question per attempt");
  for (const quiz of quizzes) {
    const binding = request.quiz_pools.find((candidate) =>
      candidate.quiz_source_key === quiz.source_key
    );
    const approval = quizLedger.records.find((candidate) =>
      candidate.quiz_source_key === quiz.source_key
    );
    assert(binding, `${quiz.source_key} is missing from the quiz review request`);
    assert(approval, `${quiz.source_key} is missing from the quiz approval ledger`);
    assert(binding.question_count === quiz.questions.length, `${quiz.source_key} question count drifted from the review request`);
    assert(binding.content_sha256 === quizContentSha256(quiz), `${quiz.source_key} content drifted from the review request`);
    assert(approval.content_sha256 === quizContentSha256(quiz), `${quiz.source_key} content drifted from the approval ledger`);
    assert(quiz.approval_status === "approved", `${quiz.source_key} is not approved in the quizbank manifest`);
  }
  assert(oldGuideRecord, "Existing Slot 16 guide acceptance record is missing");
  assert(
    oldGuideRecord.checksum_sha256 !== guide.checksum_sha256 ||
      oldGuideRecord.size_bytes !== guide.size_bytes,
    "Slot 16 guide already matches the existing course-QA acceptance record",
  );

  return {
    schema_version: "bmh-quiz-guide-review-index/v1",
    index_id: "bmh-employee-training-quiz-guide-review-2026-07-20-v2",
    status: "quiz_approved_guide_pending_human_decision",
    scope_note: "The quiz ledger records Jarrad's checksum-bound approval for all 19 quizbank pools. The separate Slot 16 guide decision remains pending. Neither state authorizes import, publication, or employee access.",
    quiz_review: {
      status: "approved",
      approved_by: [...approvers][0],
      approved_at: [...approvalTimes][0],
      evidence: [...evidence][0],
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
      quiz_pools: request.quiz_pools.map((binding) => ({
        ...binding,
        approval_status: quizzes.find((quiz) => quiz.source_key === binding.quiz_source_key).approval_status,
      })),
      controller_follow_up: "No quiz approval action remains. Preserve the request and 19 exact approval records as the publication binding.",
    },
    guide_review: {
      status: guide.approval_status,
      question: "Do you approve the changed Slot 16 learner guide for course-QA reacceptance?",
      exact_approval_response: guideApprovalWording(guide),
      bare_approved_is_valid: false,
      current_file: {
        source_key: guide.source_key,
        path: guide.local_path,
        sha256: guide.checksum_sha256,
        size_bytes: guide.size_bytes,
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
    "Status: **quizbank approved; separate Slot 16 guide decision still required**.",
    "",
    "> Jarrad's quiz approval is recorded in the checksum-bound ledger. It does not approve the changed Slot 16 guide.",
    "",
    "## 1. Quiz pools: approved",
    "",
    `[Open the full 920-question quizbank review](./${path.basename(index.quiz_review.full_review.path)})`,
    "",
    `- Exact request: [${path.basename(index.quiz_review.request.path)}](./${path.basename(index.quiz_review.request.path)})`,
    `- Request SHA-256: \`${index.quiz_review.request.sha256}\``,
    `- Full review SHA-256: \`${index.quiz_review.full_review.sha256}\``,
    `- Scope: ${index.quiz_review.quiz_pool_count} variable-size pools, ${index.quiz_review.question_count} questions, all questions randomized per attempt`,
    `- Approved by: ${index.quiz_review.approved_by}`,
    `- Approved at: ${index.quiz_review.approved_at}`,
    `- Evidence: ${index.quiz_review.evidence}`,
    "",
    "| Quiz pool | Questions | SHA-256 | Status |",
    "| --- | ---: | --- | --- |",
    ...index.quiz_review.quiz_pools.map(
      (quiz) => `| \`${quiz.quiz_source_key}\` | ${quiz.question_count} | \`${quiz.content_sha256}\` | ${quiz.approval_status} |`,
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
