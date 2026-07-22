import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildQuestionBank, normalizeLearnerText } from "./assemble-question-bank.mjs";
import { classifyFront } from "./lib/classify-front.mjs";
import { loadSnapshot, sha256OfFile, selectedBySlot, validateSnapshot } from "./lib/ledger.mjs";
import { deterministicShuffle } from "./lib/shuffle.mjs";
import { runLint } from "./lint-distractor-banks.mjs";
import { POLICY_SAFE_OVERRIDES } from "./policy-safe-overrides.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotPath = path.join(repoRoot, "content/quiz-generation/source-ledger.v1.json");
const sidecarPath = path.join(repoRoot, "content/quiz-generation/source-ledger.v1.sha256");
const questionBankPath = path.join(repoRoot, "content/quiz-generation/question-bank.v1.json");
const EXPECTED_SELECTED_BY_SLOT = [55, 50, 50, 81, 78, 44, 40, 35, 78, 50, 60, 38, 60, 40, 35, 38, 55, 38, 52];

test("deterministic shuffle stays pinned to the production algorithm", () => {
  const input = ["a", "b", "c", "d"];
  assert.deepEqual(deterministicShuffle(input, "bmh-quiz-rebuild-v1:fixture"), ["a", "b", "d", "c"]);
  assert.deepEqual(
    deterministicShuffle(input, "bmh-quiz-rebuild-v1:fixture"),
    deterministicShuffle(input, "bmh-quiz-rebuild-v1:fixture"),
  );
  assert.deepEqual(deterministicShuffle(["only"], "any-seed"), ["only"]);
  assert.deepEqual(input, ["a", "b", "c", "d"]);
});

test("source ledger snapshot hash and counts are pinned", (t) => {
  if (!existsSync(snapshotPath)) {
    t.skip("source ledger snapshot has not been created");
    return;
  }
  assert.ok(existsSync(sidecarPath), "snapshot SHA-256 sidecar exists");
  assert.equal(sha256OfFile(snapshotPath), readFileSync(sidecarPath, "utf8").trim());
  const ledger = validateSnapshot(loadSnapshot(repoRoot));
  assert.equal(ledger.records.length, 1224);
  assert.equal(ledger.records.filter((record) => record.disposition === "selected").length, 977);
  assert.equal(ledger.records.filter((record) => record.disposition === "superseded_by_newer_slot_bank").length, 198);
  assert.equal(ledger.records.filter((record) => record.disposition === "excluded_deleted_track").length, 49);
  const bySlot = selectedBySlot(ledger);
  assert.deepEqual(Array.from({ length: 19 }, (_, index) => bySlot.get(index + 1).length), EXPECTED_SELECTED_BY_SLOT);
});

test("authored banks satisfy strict lint and deterministic assembly invariants", (t) => {
  const bankPaths = Array.from({ length: 19 }, (_, index) =>
    path.join(repoRoot, "content/quiz-generation/distractor-banks", `slot-${String(index + 1).padStart(2, "0")}.json`),
  );
  if (!bankPaths.some(existsSync)) {
    t.skip("distractor bank files have not been authored");
    return;
  }

  const { ledger, findings } = runLint(repoRoot, { strictReviews: true });
  assert.deepEqual(findings.filter((item) => item.severity === "error"), []);
  const assembled = buildQuestionBank(repoRoot);
  assert.ok(existsSync(questionBankPath), "assembled question bank is committed beside the authored banks");
  assert.deepEqual(assembled, JSON.parse(readFileSync(questionBankPath, "utf8")));

  const ledgerSelected = ledger.records.filter((record) => record.disposition === "selected");
  const ledgerBySlot = selectedBySlot(ledger);
  const recordsById = new Map(ledgerSelected.map((record) => [record.record_id, record]));
  const actualRecordIds = [];
  const sourceKeys = new Set();
  assert.deepEqual(assembled.slots.map((slot) => slot.slot), Array.from({ length: 19 }, (_, index) => index + 1));
  for (const slot of assembled.slots) {
    const expectedSlotRecordIds = ledgerBySlot.get(slot.slot).map((record) => record.record_id).toSorted();
    const actualSlotRecordIds = [
      ...slot.questions.map((question) => question.provenance.record_id),
      ...slot.needs_human_review.map((entry) => entry.record_id),
    ].toSorted();
    assert.equal(slot.selected_count, expectedSlotRecordIds.length);
    assert.deepEqual(actualSlotRecordIds, expectedSlotRecordIds, `slot ${slot.slot} contains exactly its selected ledger records`);
    assert.equal(slot.generated_count + slot.needs_human_review_count, slot.selected_count);
    assert.equal(slot.questions.length, slot.generated_count);
    assert.equal(slot.needs_human_review.length, slot.needs_human_review_count);
    assert.deepEqual(slot.questions.map((question) => question.sort_order), Array.from({ length: slot.questions.length }, (_, index) => index + 1));

    for (const question of slot.questions) {
      const record = recordsById.get(question.provenance.record_id);
      assert.ok(record, `${question.provenance.record_id} is selected in the source ledger`);
      actualRecordIds.push(record.record_id);
      const policyOverride = POLICY_SAFE_OVERRIDES.get(record.record_id);
      assert.equal(question.question_text, policyOverride?.questionText ?? normalizeLearnerText(record.front));
      assert.equal(question.explanation, policyOverride?.explanation ?? normalizeLearnerText(record.back));
      assert.ok(question.explanation.trim(), `${question.source_key} has an explanation`);
      const correctOptions = question.options.filter((option) => option.is_correct);
      assert.equal(correctOptions.length, 1, `${question.source_key} has exactly one correct option`);
      assert.equal(
        correctOptions[0].option_text,
        policyOverride?.correctAnswer ?? policyOverride?.explanation ?? normalizeLearnerText(record.back),
        `${question.source_key} preserves the approved answer source`,
      );
      assert.ok(!sourceKeys.has(question.source_key), `${question.source_key} is globally unique`);
      sourceKeys.add(question.source_key);
      assert.deepEqual(question.options.map((option) => option.sort_order), Array.from({ length: question.options.length }, (_, index) => index + 1));
      for (const option of question.options) {
        assert.ok(option.option_text.trim(), `${option.source_key} has option text`);
        assert.ok(!sourceKeys.has(option.source_key), `${option.source_key} is globally unique`);
        sourceKeys.add(option.source_key);
      }
      if (question.question_type === "single_choice") {
        assert.equal(question.options.length, 4);
      } else if (question.question_type === "true_false") {
        assert.equal(question.options.length, 2);
        assert.deepEqual(question.options.map((option) => option.option_text), ["True", "False"]);
      } else {
        assert.fail(`unexpected question type ${question.question_type}`);
      }
    }
    for (const flagged of slot.needs_human_review) actualRecordIds.push(flagged.record_id);
  }

  assert.deepEqual(actualRecordIds.toSorted(), ledgerSelected.map((record) => record.record_id).toSorted());
});

test("assembled learner text contains no raw TeX delimiters", () => {
  const assembled = buildQuestionBank(repoRoot);
  const learnerText = assembled.slots.flatMap((slot) => slot.questions.flatMap((question) => [
    question.question_text,
    question.explanation,
    ...question.options.map((option) => option.option_text),
  ]));
  assert.equal(learnerText.filter((value) => /\$\\?\$|\$\d[^$]*\$/.test(value)).length, 0);
});

test("policy-safe overrides do not reuse boilerplate distractor trios", () => {
  const assembled = buildQuestionBank(repoRoot);
  const policyQuestions = assembled.slots.flatMap((slot) =>
    slot.questions.filter((question) => question.provenance.correct_answer_source === "policy_safe_override"),
  );
  const legacyBoilerplate = [
    "A superseded training example, even when its effective date has passed.",
    "An informal verbal estimate that was never issued as policy.",
    "Whichever number appears most favorable in the moment.",
  ].toSorted();
  const distractorSignatures = policyQuestions.map((question) =>
    question.options
      .filter((option) => !option.is_correct)
      .map((option) => option.option_text)
      .toSorted(),
  );

  assert.ok(policyQuestions.length > 0, "policy-safe overrides are present");
  assert.equal(policyQuestions.length, POLICY_SAFE_OVERRIDES.size, "every policy-safe override is represented once");
  assert.ok(
    [...POLICY_SAFE_OVERRIDES.values()].every((override) => override.distractorStrategy === "authored"),
    "every effective policy-safe override uses authored distractors",
  );
  assert.equal(
    distractorSignatures.filter((signature) => signature.every((value, index) => value === legacyBoilerplate[index])).length,
    0,
    "the rejected boilerplate trio is absent",
  );

  const serializedSignatures = distractorSignatures.map((signature) => JSON.stringify(signature));
  assert.equal(
    new Set(serializedSignatures).size,
    serializedSignatures.length,
    "every policy-safe override has a distinct distractor trio",
  );

  const distractorUses = new Map();
  for (const question of policyQuestions) {
    for (const option of question.options.filter((option) => !option.is_correct)) {
      const normalized = option.option_text.toLowerCase();
      const uses = distractorUses.get(normalized) ?? [];
      uses.push(question.provenance.record_id);
      distractorUses.set(normalized, uses);
    }
  }
  assert.deepEqual(
    [...distractorUses.entries()].filter(([, recordIds]) => recordIds.length > 1),
    [],
    "no policy-safe distractor string is recycled across questions",
  );

  for (const question of policyQuestions) {
    const distractors = question.options
      .filter((option) => !option.is_correct)
      .map((option) => option.option_text);
    assert.ok(
      distractors.every((text) => !/current written source/i.test(text)),
      `${question.provenance.record_id} does not mark every wrong answer with the rejected source suffix`,
    );
    assert.ok(
      distractors.every((text) => !/without\b.{0,100}\bwithout\b/i.test(text)),
      `${question.provenance.record_id} contains no concatenated duplicate without-clause`,
    );
    const terminalPhrases = distractors.map((text) =>
      text.toLowerCase().replaceAll(/[^a-z0-9 ]/g, "").split(/\s+/).slice(-5).join(" "),
    );
    assert.ok(
      new Set(terminalPhrases).size > 1,
      `${question.provenance.record_id} does not expose the answer through one repeated terminal phrase`,
    );
  }

  const finalReviewSlots = assembled.slots.filter((slot) => slot.slot >= 16);
  for (const slot of finalReviewSlots) {
    const slotPolicyQuestions = slot.questions.filter(
      (question) => question.provenance.correct_answer_source === "policy_safe_override",
    );
    for (const question of slotPolicyQuestions) {
      assert.ok(
        !/^where\b/i.test(question.question_text),
        `${question.provenance.record_id} avoids a Where-stem grammatical-answer giveaway`,
      );
      const correctLength = question.options.find((option) => option.is_correct).option_text.length;
      const distractorLengths = question.options
        .filter((option) => !option.is_correct)
        .map((option) => option.option_text.length);
      const meanDistractorLength = distractorLengths.reduce((total, length) => total + length, 0) / distractorLengths.length;
      assert.ok(
        correctLength / meanDistractorLength <= 1.25,
        `${question.provenance.record_id} does not expose the key as a much longer option`,
      );
      const correctFirstWord = question.options
        .find((option) => option.is_correct)
        .option_text.toLowerCase().match(/[a-z0-9]+/)?.[0];
      const distractorFirstWords = question.options
        .filter((option) => !option.is_correct)
        .map((option) => option.option_text.toLowerCase().match(/[a-z0-9]+/)?.[0]);
      assert.ok(
        new Set(distractorFirstWords).size > 1 || distractorFirstWords[0] === correctFirstWord,
        `${question.provenance.record_id} does not expose the key by breaking a unanimous option frame`,
      );
      for (const option of question.options) {
        assert.ok(
          !/a personal note based on|for the governing rule|for the controlling definition|as the source|for this case/i.test(option.option_text),
          `${question.provenance.record_id} contains no rejected phrase-bank fusion`,
        );
      }
      for (const option of question.options.filter((option) => !option.is_correct)) {
        assert.ok(
          !/\b(?:regardless|guaranteed|automatically|always|every|old|former)\b|without checking|even when/i.test(option.option_text),
          `${question.provenance.record_id} contains no distractor-only disqualifier vocabulary`,
        );
      }
    }

    const correctLengthRanks = slot.questions.map((question) => {
      const correctLength = question.options.find((option) => option.is_correct).option_text.length;
      return question.options.map((option) => option.option_text.length).toSorted((left, right) => left - right).indexOf(correctLength);
    });
    for (const rank of [0, 3]) {
      const share = correctLengthRanks.filter((candidate) => candidate === rank).length / correctLengthRanks.length;
      assert.ok(
        share >= 0.15 && share <= 0.4,
        `slot ${slot.slot} keeps correct-option length rank ${rank} near the 25% chance baseline`,
      );
    }

    for (const marker of ["current", "approved", "documented", "plan", "applicable"]) {
      const correctUses = slotPolicyQuestions.filter((question) =>
        new RegExp(`\\b${marker}\\b`, "i").test(question.options.find((option) => option.is_correct).option_text)
      ).length;
      const distractorUses = slotPolicyQuestions.flatMap((question) =>
        question.options.filter((option) => !option.is_correct)
      ).filter((option) => new RegExp(`\\b${marker}\\b`, "i").test(option.option_text)).length;
      if (correctUses >= 3) {
        assert.ok(distractorUses > 0, `slot ${slot.slot} does not reserve ${marker} vocabulary for correct options`);
      }
    }
  }

  for (const recordId of [
    "legacy-ch12-002",
    "legacy-ch12-020",
    "legacy-ch12-038",
    "legacy-ch12-037",
    "legacy-ch12-047",
    "legacy-ch12-053",
    "legacy-ch13-001",
    "legacy-ch13-006",
    "legacy-ch13-018",
  ]) {
    const question = policyQuestions.find((candidate) => candidate.provenance.record_id === recordId);
    assert.ok(question, `${recordId} is present in the policy-safe review cohort`);
    assert.equal(
      POLICY_SAFE_OVERRIDES.get(recordId)?.distractorStrategy,
      "authored",
      `${recordId} keeps authored stem-specific near misses`,
    );
  }
});

test("front classifier honors its ordered categories", () => {
  assert.equal(classifyFront("The lead is _____"), "fill_blank");
  assert.equal(classifyFront("List three examples"), "imperative");
  assert.equal(classifyFront("Concept: X"), "concept_cue");
  assert.equal(classifyFront("Phrase cue: 'y'"), "phrase_cue");
  assert.equal(classifyFront("True or false: ..."), "true_false_ish");
  assert.equal(classifyFront("What is X?"), "question");
});
