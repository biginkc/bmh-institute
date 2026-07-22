import { createHash } from "node:crypto";

function clean(value) {
  return String(value ?? "").replaceAll("\r", "").replaceAll("\n", " ").trim();
}

function quizContentSha256({ source_key, title, questions }) {
  return createHash("sha256")
    .update(JSON.stringify({ source_key, title, questions }).replaceAll("\u2014", "-"))
    .digest("hex");
}

export function renderQuizReview(manifest) {
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
    "Correct options are marked `[correct]`. Questions are sourced from the checksum-bound question bank.",
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
