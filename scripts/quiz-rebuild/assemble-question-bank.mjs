#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLint } from "./lint-distractor-banks.mjs";
import { sha256OfFile, selectedBySlot } from "./lib/ledger.mjs";
import { deterministicShuffle } from "./lib/shuffle.mjs";
import { stableStringify } from "./lib/stable-json.mjs";
import { POLICY_SAFE_OVERRIDES } from "./policy-safe-overrides.mjs";

export function normalizeLearnerText(value) {
  return String(value)
    .replace(/\$\\\$([^$]+)\$/g, (_match, amount) => `$${amount}`)
    .replace(/\$([^$]+)\$/g, "$1")
    .replaceAll("\\$", "$");
}

function provenanceFor(record, entry, checkerVerdict, slotLabel, status, policyOverride = false) {
  return {
    record_id: record.record_id,
    source_set: record.source_set,
    source_id: record.source_id,
    source_file: record.source_file,
    source_index: record.source_index,
    candidate_slot: record.candidate_slot,
    front_sha256: entry.front_sha256,
    back_sha256: entry.back_sha256,
    correct_answer_source: policyOverride ? "policy_safe_override" : "back_verbatim",
    distractor_bank: `distractor-banks/${slotLabel}.json`,
    checker_verdict: checkerVerdict,
    status,
  };
}

function buildOptions(record, entry, policyOverride) {
  const correctAnswer = policyOverride?.correctAnswer ?? policyOverride?.explanation ?? normalizeLearnerText(record.back);
  const distractors = policyOverride?.distractors ?? entry.distractors;
  if (!policyOverride && entry.question_type === "true_false") {
    return ["True", "False"].map((optionText, index) => ({
      source_key: `question-r-${record.record_id}-opt-${index + 1}`,
      option_text: optionText,
      is_correct: entry.true_false_answer === (optionText === "True"),
      sort_order: index + 1,
    }));
  }

  const shuffled = deterministicShuffle(
    [
      { option_text: correctAnswer, is_correct: true },
      ...distractors.map((optionText) => ({
        option_text: normalizeLearnerText(optionText),
        is_correct: false,
      })),
    ],
    `bmh-quiz-rebuild-v1:${record.record_id}`,
  );
  return shuffled.map((option, index) => ({
    source_key: `question-r-${record.record_id}-opt-${index + 1}`,
    option_text: option.option_text,
    is_correct: option.is_correct,
    sort_order: index + 1,
  }));
}

export function buildQuestionBank(repoRoot) {
  const { ledger, banks, reviews, findings } = runLint(repoRoot, { strictReviews: true });
  const errors = findings.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    const summary = errors.slice(0, 5).map((item) => `${item.code}@slot-${String(item.slot).padStart(2, "0")}${item.record_id ? `:${item.record_id}` : ""}`).join(", ");
    throw new Error(`question bank assembly refused: strict lint has ${errors.length} error(s): ${summary}`);
  }

  const snapshotPath = path.join(repoRoot, "content/quiz-generation/source-ledger.v1.json");
  const selected = selectedBySlot(ledger);
  const bankHashes = {};
  const reviewHashes = {};
  for (let slot = 1; slot <= 19; slot++) {
    const key = `slot-${String(slot).padStart(2, "0")}`;
    bankHashes[key] = sha256OfFile(banks.get(slot).path);
    reviewHashes[key] = sha256OfFile(reviews.get(slot).path);
  }

  const slots = [];
  let generatedTotal = 0;
  let needsReviewTotal = 0;
  for (let slot = 1; slot <= 19; slot++) {
    const slotLabel = `slot-${String(slot).padStart(2, "0")}`;
    const records = selected.get(slot);
    const bank = banks.get(slot).data;
    const review = reviews.get(slot).data;
    const entriesById = new Map(bank.entries.map((entry) => [entry.record_id, entry]));
    const verdictsById = new Map(review.verdicts.map((verdict) => [verdict.record_id, verdict]));
    const questions = [];
    const needsHumanReview = [];

    for (const record of records) {
      const entry = entriesById.get(record.record_id);
      const policyOverride = POLICY_SAFE_OVERRIDES.get(record.record_id);
      const rawCheckerVerdict = verdictsById.get(record.record_id)?.verdict;
      const checkerVerdict = ["pass", "revise", "needs_human_review"].includes(rawCheckerVerdict) ? rawCheckerVerdict : null;
      if (entry.status === "authored" && checkerVerdict !== "needs_human_review") {
        const sortOrder = questions.length + 1;
        questions.push({
          source_key: `question-r-${record.record_id}`,
          question_text: policyOverride?.questionText ?? normalizeLearnerText(record.front),
          question_type: policyOverride ? "single_choice" : entry.question_type,
          explanation: policyOverride?.explanation ?? normalizeLearnerText(record.back),
          points: 1,
          sort_order: sortOrder,
          options: buildOptions(record, entry, policyOverride),
          provenance: provenanceFor(record, entry, checkerVerdict, slotLabel, "generated", Boolean(policyOverride)),
        });
      } else if (entry.status === "needs_human_review" || checkerVerdict === "needs_human_review") {
        needsHumanReview.push({
          record_id: record.record_id,
          front: record.front,
          back: record.back,
          review_reason: entry.status === "authored" && checkerVerdict === "needs_human_review" ? "checker_escalation" : entry.review_reason ?? null,
          notes: entry.notes ?? null,
          provenance: provenanceFor(record, entry, checkerVerdict, slotLabel, "needs_human_review"),
        });
      }
    }

    if (questions.length + needsHumanReview.length !== records.length) {
      throw new Error(`slot ${slot} assembly invariant failed: ${questions.length} generated + ${needsHumanReview.length} needs review != ${records.length} selected`);
    }
    generatedTotal += questions.length;
    needsReviewTotal += needsHumanReview.length;
    slots.push({
      slot,
      quiz_source_key: `quiz-${slotLabel}`,
      lesson: ledger.lesson_slots.find((item) => item.slot === slot)?.lesson ?? records[0]?.candidate_lesson ?? null,
      selected_count: records.length,
      generated_count: questions.length,
      needs_human_review_count: needsHumanReview.length,
      questions,
      needs_human_review: needsHumanReview,
    });
  }

  return {
    schema_version: "bmh.quiz-question-bank.v1",
    generation: {
      method: "fnv1a+mulberry32 Fisher-Yates option shuffle, seed 'bmh-quiz-rebuild-v1:<record_id>'",
      source_ledger_sha256: sha256OfFile(snapshotPath),
      distractor_bank_sha256: bankHashes,
      distractor_review_sha256: reviewHashes,
      policy_safe_override_sha256: sha256OfFile(path.join(repoRoot, "scripts/quiz-rebuild/policy-safe-overrides.mjs")),
    },
    quiz_config: {
      passing_score: 80,
      questions_per_attempt: null,
      randomize_questions: true,
      randomize_answers: true,
      max_attempts: null,
      retake_cooldown_hours: 0,
      show_correct_answers_after: "after_pass",
    },
    totals: {
      selected: 977,
      generated: generatedTotal,
      needs_human_review: needsReviewTotal,
    },
    slots,
  };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--write", "--check"].includes(args[0])) {
    throw new Error("usage: node scripts/quiz-rebuild/assemble-question-bank.mjs --write|--check");
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputPath = path.join(repoRoot, "content/quiz-generation/question-bank.v1.json");
  const serialized = stableStringify(buildQuestionBank(repoRoot));
  if (args[0] === "--write") {
    writeFileSync(outputPath, serialized);
    console.log(`wrote ${path.relative(repoRoot, outputPath)}`);
  } else {
    if (!existsSync(outputPath)) throw new Error("question-bank.v1.json is missing");
    if (!readFileSync(outputPath).equals(Buffer.from(serialized))) {
      throw new Error("question-bank.v1.json has drifted from deterministic assembly");
    }
    console.log("question-bank.v1.json is current");
  }
}
