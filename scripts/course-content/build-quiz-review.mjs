import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { quizContentSha256 } from "./build-manifest.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MANIFEST_PATH = path.join(ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const OUTPUT_PATH = path.join(ROOT, "docs/course-production/quiz-content-review.v1.md");
const POLICY_SAFE_REPLACEMENTS = new Set([
  "question-slot-16-07",
  "question-slot-16-12",
]);

function clean(value) {
  return String(value ?? "").replaceAll("\r", "").replaceAll("\n", " ").trim();
}

export function renderQuizReview(manifest) {
  const quizzes = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .filter((lesson) => lesson.type === "quiz")
    .map((lesson) => lesson.quiz);
  const lines = [
    "# BMH employee training quiz content review",
    "",
    "Status: **pending human review**. This packet is review evidence, not approval.",
    "",
    `Manifest import: \`${manifest.import_id}\``,
    `Quiz pools: ${quizzes.length}`,
    `Questions: ${quizzes.reduce((count, quiz) => count + quiz.questions.length, 0)}`,
    "",
    "Correct options are marked `[correct]`. Slot 16 policy-safe replacements are called out explicitly.",
    "",
  ];

  for (const [quizIndex, quiz] of quizzes.entries()) {
    lines.push(
      `## ${quizIndex + 1}. ${clean(quiz.title)}`,
      "",
      `- Pool key: \`${quiz.source_key}\``,
      `- Pool SHA-256: \`${quizContentSha256(quiz)}\``,
      `- Approval status: \`${quiz.approval_status}\``,
      "",
    );
    for (const [questionIndex, question] of quiz.questions.entries()) {
      lines.push(
        `### ${questionIndex + 1}. ${clean(question.question_text)}`,
        "",
        `- Question key: \`${question.source_key}\``,
        `- Type: \`${question.question_type}\``,
        "",
      );
      if (POLICY_SAFE_REPLACEMENTS.has(question.source_key)) {
        lines.push(
          "> **Policy-safe Slot 16 replacement.** This item replaces a fixed numeric KPI target and requires human review of the exact wording below.",
          "",
        );
      }
      for (const option of question.options) {
        lines.push(`- ${option.is_correct ? "[correct]" : "[ ]"} ${clean(option.option_text)}`);
      }
      lines.push("", `Explanation: ${clean(question.explanation)}`, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function reviewSha256(markdown) {
  return createHash("sha256").update(markdown).digest("hex");
}

async function main() {
  const mode = process.argv[2] ?? "--check";
  if (!["--check", "--write"].includes(mode)) {
    throw new Error("Usage: node scripts/course-content/build-quiz-review.mjs [--check|--write]");
  }
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const markdown = renderQuizReview(manifest);
  if (mode === "--write") {
    await writeFile(OUTPUT_PATH, markdown);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${reviewSha256(markdown)})`);
    return;
  }
  const existing = await readFile(OUTPUT_PATH, "utf8");
  if (existing !== markdown) throw new Error("Quiz review surface is stale");
  console.log(`Verified ${path.relative(ROOT, OUTPUT_PATH)} (${reviewSha256(markdown)})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
