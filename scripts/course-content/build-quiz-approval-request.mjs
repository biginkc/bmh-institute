import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { quizBindingsSha256, quizContentSha256 } from "./build-manifest.mjs";
import { renderQuizReview, reviewSha256 } from "./quiz-review-surface.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MANIFEST_PATH = path.join(ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const REQUEST_PATH = path.join(ROOT, "docs/course-production/quiz-content-review-request.v1.json");
const REVIEW_PATH = path.join(ROOT, "docs/course-production/quiz-content-review.quizbank.v1.md");

function quizzes(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .filter((lesson) => lesson.type === "quiz")
    .map((lesson) => lesson.quiz);
}

export function buildQuizApprovalRequest(manifest, review) {
  const quizPools = quizzes(manifest).map((quiz) => ({
    quiz_source_key: quiz.source_key,
    question_count: quiz.questions.length,
    content_sha256: quizContentSha256(quiz),
    approval_status: "pending_human_review",
  }));
  const questionCount = quizPools.reduce((total, pool) => total + pool.question_count, 0);
  if (quizPools.length !== 19 || questionCount !== 920) {
    throw new Error(`Quiz approval request requires 19 pools and 920 questions; got ${quizPools.length} and ${questionCount}.`);
  }
  return {
    schema_version: "bmh-quiz-content-review-request/v1",
    request_id: "bmh-employee-training-quiz-review-2026-07-22-content-quality-v8",
    status: "pending_human_review",
    created_at: "2026-07-22T13:17:04Z",
    review_instruction: "Review all 19 checksum-bound quiz pools in the canonical packet. Approve only by recording one checksum-bound response per quiz in docs/course-production/quiz-approvals.json; this request is not approval.",
    scope: {
      manifest_path: "content/course-manifests/bmh-employee-training.v1.json",
      import_id: manifest.import_id,
      quiz_pool_count: quizPools.length,
      question_count: questionCount,
      questions_per_pool: null,
      questions_per_attempt: null,
      quiz_bindings_sha256: quizBindingsSha256(quizPools),
    },
    review_surface: {
      path: "docs/course-production/quiz-content-review.quizbank.v1.md",
      sha256: reviewSha256(review),
      format: "markdown",
      quiz_pool_count: quizPools.length,
      question_count: questionCount,
    },
    quiz_pools: quizPools,
    response_contract: {
      schema_version: "bmh-quiz-content-approval/v1",
      decision: "approved",
      required_fields: [
        "quiz_source_key", "content_sha256", "request_sha256",
        "approved_by", "approved_at", "evidence",
      ],
      note: "Approval is per exact quiz checksum. A changed pool returns to pending_human_review.",
    },
  };
}

async function main() {
  const mode = process.argv[2] ?? "--check";
  if (!["--write", "--check"].includes(mode)) {
    throw new Error("Usage: node scripts/course-content/build-quiz-approval-request.mjs --write|--check");
  }
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const review = renderQuizReview(manifest);
  const request = `${JSON.stringify(buildQuizApprovalRequest(manifest, review), null, 2)}\n`;
  if (mode === "--write") {
    await Promise.all([writeFile(REVIEW_PATH, review), writeFile(REQUEST_PATH, request)]);
    console.log(JSON.stringify({
      request_sha256: createHash("sha256").update(request).digest("hex"),
      review_sha256: reviewSha256(review),
    }, null, 2));
    return;
  }
  const [actualReview, actualRequest] = await Promise.all([
    readFile(REVIEW_PATH, "utf8"),
    readFile(REQUEST_PATH, "utf8"),
  ]);
  if (actualReview !== review || actualRequest !== request) {
    throw new Error("Quiz approval request or review packet is stale.");
  }
  console.log("Quiz approval request and review packet are current.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
