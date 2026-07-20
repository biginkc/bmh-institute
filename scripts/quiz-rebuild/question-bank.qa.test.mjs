import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildQuestionBank } from "./assemble-question-bank.mjs";
import { classifyFront } from "./lib/classify-front.mjs";
import { loadSnapshot, sha256OfFile, selectedBySlot, validateSnapshot } from "./lib/ledger.mjs";
import { deterministicShuffle } from "./lib/shuffle.mjs";
import { runLint } from "./lint-distractor-banks.mjs";

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
      assert.equal(question.question_text, record.front);
      assert.equal(question.explanation, record.back);
      assert.ok(question.explanation.trim(), `${question.source_key} has an explanation`);
      const correctOptions = question.options.filter((option) => option.is_correct);
      assert.equal(correctOptions.length, 1, `${question.source_key} has exactly one correct option`);
      assert.equal(correctOptions[0].option_text, record.back, `${question.source_key} preserves the source back as its correct answer`);
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

test("front classifier honors its ordered categories", () => {
  assert.equal(classifyFront("The lead is _____"), "fill_blank");
  assert.equal(classifyFront("List three examples"), "imperative");
  assert.equal(classifyFront("Concept: X"), "concept_cue");
  assert.equal(classifyFront("Phrase cue: 'y'"), "phrase_cue");
  assert.equal(classifyFront("True or false: ..."), "true_false_ish");
  assert.equal(classifyFront("What is X?"), "question");
});
