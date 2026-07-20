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
  const bankBuilt = Boolean(manifest.quiz_bank_ref);
  const quizzes = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .filter((lesson) => lesson.type === "quiz")
    .map((lesson) => lesson.quiz);
  const allApproved = quizzes.length > 0
    && quizzes.every((quiz) => quiz.approval_status === "approved");
  const lines = [
    "# BMH employee training quiz content review",
    "",
    allApproved
      ? "Status: **all quiz pools marked approved in this manifest**. This packet is review evidence, not independent approval."
      : "Status: **pending human review**. This packet is review evidence, not approval.",
    "",
    `Manifest import: \`${manifest.import_id}\``,
    `Quiz pools: ${quizzes.length}`,
    `Questions: ${quizzes.reduce((count, quiz) => count + quiz.questions.length, 0)}`,
    "",
    bankBuilt
      ? "Correct options are marked `[correct]`. Questions are sourced from the checksum-bound question bank."
      : "Correct options are marked `[correct]`. Slot 16 policy-safe replacements are called out explicitly.",
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
      if (!bankBuilt && POLICY_SAFE_REPLACEMENTS.has(question.source_key)) {
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
  let mode = "--check";
  let manifestPath = MANIFEST_PATH;
  let outputPath = OUTPUT_PATH;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--check" || token === "--write") {
      mode = token;
      continue;
    }
    const equals = token.match(/^--(manifest|out)=(.+)$/);
    if (equals) {
      if (equals[1] === "manifest") manifestPath = path.resolve(equals[2]);
      else outputPath = path.resolve(equals[2]);
      continue;
    }
    const split = token.match(/^--(manifest|out)$/);
    if (split && args[index + 1] && !args[index + 1].startsWith("--")) {
      if (split[1] === "manifest") manifestPath = path.resolve(args[index + 1]);
      else outputPath = path.resolve(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(
      "Usage: node scripts/course-content/build-quiz-review.mjs [--check|--write] [--manifest PATH] [--out PATH]",
    );
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const markdown = renderQuizReview(manifest);
  if (mode === "--write") {
    await writeFile(outputPath, markdown);
    console.log(`Wrote ${path.relative(ROOT, outputPath)} (${reviewSha256(markdown)})`);
    return;
  }
  const existing = await readFile(outputPath, "utf8");
  if (existing !== markdown) throw new Error("Quiz review surface is stale");
  console.log(`Verified ${path.relative(ROOT, outputPath)} (${reviewSha256(markdown)})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
