#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQuestionBank } from "./assemble-question-bank.mjs";
import { runLint } from "./lint-distractor-banks.mjs";
import { EXPECTED_SELECTED_BY_SLOT } from "./lib/ledger.mjs";
import { jaccard, normalizeForComparison, tokenSet } from "./lib/normalize.mjs";
import { deterministicShuffle } from "./lib/shuffle.mjs";
import { stableStringify } from "./lib/stable-json.mjs";

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function buildCoverage(questionBank) {
  const slots = questionBank.slots.map((slot) => ({
    slot: slot.slot,
    lesson: slot.lesson,
    selected: slot.selected_count,
    generated: slot.generated_count,
    needs_review: slot.needs_human_review_count,
    sum_ok: slot.generated_count + slot.needs_human_review_count === slot.selected_count,
  }));
  const totals = {
    selected: slots.reduce((sum, slot) => sum + slot.selected, 0),
    generated: slots.reduce((sum, slot) => sum + slot.generated, 0),
    needs_review: slots.reduce((sum, slot) => sum + slot.needs_review, 0),
    sum_ok: slots.every((slot) => slot.sum_ok),
    expected_selected: 977,
    expected_selected_by_slot: EXPECTED_SELECTED_BY_SLOT,
    selected_vector_ok: JSON.stringify(slots.map((slot) => slot.selected)) === JSON.stringify(EXPECTED_SELECTED_BY_SLOT),
  };
  if (slots.length !== 19) throw new Error(`coverage requires 19 slots, got ${slots.length}`);
  if (totals.selected !== 977) throw new Error(`coverage selected total must be 977, got ${totals.selected}`);
  if (!totals.sum_ok) throw new Error("coverage generated plus needs review does not equal selected in every slot");
  if (!totals.selected_vector_ok) throw new Error("coverage selected per-slot vector does not match the pinned source ledger vector");
  return {
    schema_version: "bmh.quiz-coverage-report.v1",
    slots,
    totals,
  };
}

function coverageMarkdown(coverage) {
  const lines = [
    "# Quiz rebuild coverage",
    "",
    "| Slot | Lesson | Selected | Generated | Needs review | Sum OK |",
    "| ---: | --- | ---: | ---: | ---: | :---: |",
  ];
  for (const slot of coverage.slots) {
    lines.push(`| ${slot.slot} | ${markdownCell(slot.lesson)} | ${slot.selected} | ${slot.generated} | ${slot.needs_review} | ${slot.sum_ok ? "yes" : "NO"} |`);
  }
  const totals = coverage.totals;
  lines.push(`| Total | All 19 slots | ${totals.selected} | ${totals.generated} | ${totals.needs_review} | ${totals.sum_ok ? "yes" : "NO"} |`);
  lines.push(
    "",
    `Expected selected total: 977. Actual: ${totals.selected}.`,
    `Expected per-slot vector: [${EXPECTED_SELECTED_BY_SLOT.join(", ")}].`,
    `Vector assertion: ${totals.selected_vector_ok ? "pass" : "FAIL"}.`,
    "",
  );
  return lines.join("\n");
}

function reviewReport(questionBank, findings, reviews, ledger) {
  const warningsByCode = new Map();
  for (const warning of findings.filter((item) => item.severity === "warning")) {
    if (!warningsByCode.has(warning.code)) warningsByCode.set(warning.code, []);
    warningsByCode.get(warning.code).push(warning);
  }
  const lines = ["# Quiz rebuild review report", "", "## Automated warnings", ""];
  if (warningsByCode.size === 0) lines.push("No automated warnings.", "");
  for (const code of [...warningsByCode.keys()].sort()) {
    const warnings = warningsByCode.get(code);
    lines.push(`### ${code} (${warnings.length})`, "");
    for (const warning of warnings) {
      lines.push(`- Slot ${warning.slot}, ${warning.record_id ?? "slot-level"}: ${warning.detail}`);
    }
    lines.push("");
  }

  lines.push("## Flagged cards", "");
  const flagged = questionBank.slots.flatMap((slot) => slot.needs_human_review.map((entry) => ({ slot: slot.slot, ...entry })));
  if (flagged.length === 0) lines.push("No cards are flagged.", "");
  for (const entry of flagged) {
    lines.push(
      `### Slot ${entry.slot}: ${entry.record_id}`,
      "",
      `- Front: ${JSON.stringify(entry.front)}`,
      `- Back: ${JSON.stringify(entry.back)}`,
      `- Reason: ${entry.review_reason}`,
      `- Notes: ${entry.notes === null ? "none" : JSON.stringify(entry.notes)}`,
      "",
    );
  }

  const checkerIssues = [];
  const recordOrder = new Map(
    ledger.records
      .filter((record) => record.disposition === "selected")
      .map((record, index) => [record.record_id, index]),
  );
  let issueSequence = 0;
  for (let slot = 1; slot <= 19; slot++) {
    const verdicts = reviews.get(slot)?.data.verdicts ?? [];
    for (const verdict of verdicts) {
      for (const issue of verdict.issues ?? []) checkerIssues.push({ slot, record_id: verdict.record_id, sequence: issueSequence++, ...issue });
    }
  }
  checkerIssues.sort((a, b) => a.slot - b.slot || (recordOrder.get(a.record_id) ?? Number.MAX_SAFE_INTEGER) - (recordOrder.get(b.record_id) ?? Number.MAX_SAFE_INTEGER) || a.sequence - b.sequence);
  const issueCounts = new Map();
  for (const issue of checkerIssues) issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1);
  lines.push("## Checker issue summary", "");
  if (checkerIssues.length === 0) lines.push("No checker issues.", "");
  for (const code of [...issueCounts.keys()].sort()) lines.push(`- ${code}: ${issueCounts.get(code)}`);
  if (checkerIssues.length > 0) lines.push("");
  for (const issue of checkerIssues) {
    lines.push(`- Slot ${issue.slot}, ${issue.record_id}, distractor ${issue.distractor_index}: ${issue.code}. ${issue.note}`);
  }
  if (checkerIssues.length > 0) lines.push("");

  lines.push(
    "## Non-automatable review dimensions",
    "",
    "Human authors and checkers remain responsible for these judgments:",
    "",
    "- `unsupported_fact`",
    "- `ambiguous_correctness`",
    "- `partially_correct_distractor`",
    "- `specificity_mismatch`",
    "- `grammatical_mismatch`",
    "",
  );
  return lines.join("\n");
}

function sampleIndices(questionCount, slot) {
  if (questionCount < 6) return Array.from({ length: questionCount }, (_, index) => index);
  const middleIndices = Array.from({ length: questionCount - 2 }, (_, index) => index + 1);
  const chosenMiddle = deterministicShuffle(middleIndices, `sample-v1:slot-${slot}`).slice(0, 4);
  return [0, ...chosenMiddle, questionCount - 1].sort((a, b) => a - b);
}

function samplesMarkdown(questionBank) {
  const lines = ["# Quiz rebuild deterministic samples", ""];
  for (const slot of questionBank.slots) {
    lines.push(`## Slot ${slot.slot}: ${slot.lesson}`, "");
    if (slot.questions.length === 0) {
      lines.push("No generated questions.", "");
      continue;
    }
    for (const index of sampleIndices(slot.questions.length, slot.slot)) {
      const question = slot.questions[index];
      lines.push(`### ${question.sort_order}. ${question.question_text}`, "");
      for (const option of question.options) {
        lines.push(`- [${option.is_correct ? "correct" : " "}] ${option.option_text}`);
      }
      lines.push(
        "",
        `Explanation: ${question.explanation}`,
        "",
        `Provenance: ${question.provenance.record_id} | ${question.provenance.source_set}:${question.provenance.source_id} | ${question.provenance.distractor_bank} | checker ${question.provenance.checker_verdict}`,
        "",
      );
    }
  }
  return lines.join("\n");
}

function manifestQuizSlots(manifest) {
  const result = new Map();
  for (const course of manifest.program.courses) {
    for (const courseModule of course.modules) {
      for (const lesson of courseModule.lessons) {
        if (lesson.type !== "quiz") continue;
        const match = lesson.source_key.match(/slot-(\d+)/);
        if (match) result.set(Number(match[1]), lesson.quiz);
      }
    }
  }
  return result;
}

function quizContentSha256(quiz) {
  return createHash("sha256")
    .update(JSON.stringify({ source_key: quiz.source_key, title: quiz.title, questions: quiz.questions }))
    .digest("hex");
}

function bestFrontMatch(oldText, newQuestions) {
  const normalizedOld = normalizeForComparison(oldText);
  let best = { classification: "old_only_content", score: -1 };
  for (const question of newQuestions) {
    const normalizedNew = normalizeForComparison(question.question_text);
    const containment = normalizedOld && normalizedNew && (normalizedOld.includes(normalizedNew) || normalizedNew.includes(normalizedOld));
    const exact = normalizedOld === normalizedNew;
    const score = exact ? 1 : containment ? 0.999 : jaccard(tokenSet(normalizedOld), tokenSet(normalizedNew));
    if (score > best.score) {
      best = { classification: exact || containment ? "superseded_duplicate" : "old_only_content", score };
    }
  }
  return best;
}

function manifestComparisonMarkdown(manifest, questionBank) {
  const oldBySlot = manifestQuizSlots(manifest);
  const lines = [
    "# Quiz manifest comparison",
    "",
    "| Slot | Old pool | New generated | Superseded duplicate | Old only content |",
    "| ---: | ---: | ---: | ---: | ---: |",
  ];
  const oldOnly = [];
  let oldTotal = 0;
  let allChecksumsChanged = true;
  for (let slot = 1; slot <= 19; slot++) {
    const oldQuiz = oldBySlot.get(slot);
    if (!oldQuiz) throw new Error(`manifest comparison is missing old quiz slot ${slot}`);
    const oldQuestions = oldQuiz.questions;
    if (oldQuestions.length !== 18) throw new Error(`manifest comparison slot ${slot} must have 18 old questions, got ${oldQuestions.length}`);
    const newSlot = questionBank.slots.find((item) => item.slot === slot);
    const prospectiveQuiz = {
      source_key: oldQuiz.source_key,
      title: oldQuiz.title,
      questions: newSlot.questions.map(({ provenance: _provenance, ...question }) => question),
    };
    if (quizContentSha256(oldQuiz) === quizContentSha256(prospectiveQuiz)) allChecksumsChanged = false;
    let duplicateCount = 0;
    for (const question of oldQuestions) {
      const match = bestFrontMatch(question.question_text, newSlot.questions);
      if (match.classification === "superseded_duplicate") duplicateCount += 1;
      else oldOnly.push({ slot, text: question.question_text });
    }
    oldTotal += oldQuestions.length;
    lines.push(`| ${slot} | ${oldQuestions.length} | ${newSlot.generated_count} | ${duplicateCount} | ${oldQuestions.length - duplicateCount} |`);
  }
  if (oldTotal !== 342) throw new Error(`manifest comparison requires 342 old questions, got ${oldTotal}`);
  if (!allChecksumsChanged) throw new Error("manifest comparison found an unchanged quiz pool checksum");
  lines.push(
    `| Total | ${oldTotal} | ${questionBank.totals.generated} | ${oldTotal - oldOnly.length} | ${oldOnly.length} |`,
    "",
    "Every quiz pool checksum changes. Every quiz therefore reverts to `pending_human_review`.",
    "",
    "Delivery semantics change from 10 of 18 questions to exhaustive randomized delivery with `questions_per_attempt: null`.",
    "",
    "## Old only content",
    "",
  );
  if (oldOnly.length === 0) lines.push("No old-only questions.", "");
  for (const item of oldOnly) lines.push(`- Slot ${item.slot}: ${item.text}`);
  lines.push("");
  return lines.join("\n");
}

function buildOutputs(repoRoot, questionBank) {
  const { ledger, findings, reviews } = runLint(repoRoot);
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "content/course-manifests/bmh-employee-training.v1.json"), "utf8"));
  const coverage = buildCoverage(questionBank);
  return new Map([
    ["coverage.v1.json", stableStringify(coverage)],
    ["coverage.v1.md", coverageMarkdown(coverage)],
    ["review-report.v1.md", reviewReport(questionBank, findings, reviews, ledger)],
    ["samples.v1.md", samplesMarkdown(questionBank)],
    ["manifest-comparison.v1.md", manifestComparisonMarkdown(manifest, questionBank)],
  ]);
}

const args = process.argv.slice(2);
if (args.length !== 1 || !["--write", "--check"].includes(args[0])) {
  throw new Error("usage: node scripts/quiz-rebuild/build-reports.mjs --write|--check");
}
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const questionBankPath = path.join(repoRoot, "content/quiz-generation/question-bank.v1.json");
if (!existsSync(questionBankPath)) {
  console.log("question bank not yet assembled");
  process.exit(0);
}
const committedQuestionBankBytes = readFileSync(questionBankPath);
const questionBank = buildQuestionBank(repoRoot);
if (!committedQuestionBankBytes.equals(Buffer.from(stableStringify(questionBank)))) {
  throw new Error("question-bank.v1.json has drifted from strict deterministic assembly");
}
const outputs = buildOutputs(repoRoot, questionBank);
const reportsDirectory = path.join(repoRoot, "content/quiz-generation/reports");
if (args[0] === "--write") {
  mkdirSync(reportsDirectory, { recursive: true });
  for (const [fileName, content] of outputs) writeFileSync(path.join(reportsDirectory, fileName), content);
  console.log(`wrote ${outputs.size} quiz rebuild reports`);
} else {
  for (const [fileName, content] of outputs) {
    const filePath = path.join(reportsDirectory, fileName);
    if (!existsSync(filePath)) throw new Error(`${fileName} is missing`);
    if (!readFileSync(filePath).equals(Buffer.from(content))) throw new Error(`${fileName} has drifted`);
  }
  console.log(`${outputs.size} quiz rebuild reports are current`);
}
