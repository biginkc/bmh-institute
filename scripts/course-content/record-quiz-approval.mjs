import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderQuizReview, reviewSha256 } from "./quiz-review-surface.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const REQUEST_PATH = path.join(ROOT, "docs/course-production/quiz-content-review-request.v1.json");
const REVIEW_PATH = path.join(ROOT, "docs/course-production/quiz-content-review.quizbank.v1.md");
const MANIFEST_PATH = path.join(ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const LEDGER_PATH = path.join(ROOT, "docs/course-production/quiz-approvals.json");

function flag(name) {
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const approvedBy = flag("--approved-by");
  const approvedAt = flag("--approved-at");
  const evidence = flag("--evidence");
  const confirmedRequest = flag("--request-sha256");
  const confirmedReview = flag("--review-sha256");
  if (!approvedBy || !approvedAt || !evidence || !confirmedRequest || !confirmedReview) {
    throw new Error("Usage: node scripts/course-content/record-quiz-approval.mjs --approved-by=... --approved-at=ISO --evidence=... --request-sha256=... --review-sha256=... [--execute]");
  }
  const [requestBytes, review, manifest] = await Promise.all([
    readFile(REQUEST_PATH),
    readFile(REVIEW_PATH, "utf8"),
    readFile(MANIFEST_PATH, "utf8").then(JSON.parse),
  ]);
  const requestSha256 = createHash("sha256").update(requestBytes).digest("hex");
  const reviewChecksum = reviewSha256(review);
  const request = JSON.parse(requestBytes.toString("utf8"));
  if (requestSha256 !== confirmedRequest || reviewChecksum !== confirmedReview) {
    throw new Error("Approval confirmation does not match the exact request and review packet checksums.");
  }
  if (request.review_surface.sha256 !== reviewChecksum || review !== renderQuizReview(manifest)) {
    throw new Error("Approval refused: review packet is not rendered from the exact canonical manifest.");
  }
  const ledger = {
    schema_version: "bmh-quiz-content-approval-ledger/v1",
    status: "active",
    request_path: "docs/course-production/quiz-content-review-request.v1.json",
    request_sha256: requestSha256,
    records: request.quiz_pools.map((pool) => ({
      quiz_source_key: pool.quiz_source_key,
      content_sha256: pool.content_sha256,
      request_sha256: requestSha256,
      decision: "approved",
      approved_by: approvedBy,
      approved_at: approvedAt,
      evidence,
    })),
  };
  console.log(JSON.stringify({
    execute,
    request_sha256: requestSha256,
    review_sha256: reviewChecksum,
    records: ledger.records.length,
    approved_by: approvedBy,
  }, null, 2));
  if (!execute) {
    console.log("Dry run only. Add --execute only after an independent reviewer returns the exact checksums.");
    return;
  }
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log("Recorded checksum-bound quiz approval ledger.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
