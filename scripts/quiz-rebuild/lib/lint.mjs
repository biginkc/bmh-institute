import { classifyFront } from "./classify-front.mjs";
import { selectedBySlot, sha256OfText } from "./ledger.mjs";
import { jaccard, normalizeForComparison, tokenSet } from "./normalize.mjs";

const REVIEW_REASONS = new Set([
  "imperative_front_cannot_be_mcq_stem",
  "concept_cue_front",
  "phrase_cue_front",
  "insufficient_content_for_fair_distractors",
  "back_too_ambiguous",
  "checker_escalation",
  "stale_role_terms_need_rewrite_decision",
]);
const QUESTION_TYPES = new Set(["single_choice", "true_false"]);
const BANNED_OPTION_PATTERN = /\b(all|none|both) of the above\b|\ball of these\b|\bnone of these\b/i;
const STALE_ROLE_BOUND_COURSE_PATTERN = /\b(?:navigators?|virtual onboarding specialists?|lead sourcing specialists?|lead sourcing seats?|lead generators?|SDRs?)\b/i;

function dataOf(value) {
  return value?.data ?? value;
}

function finding(code, severity, slot, recordId, detail) {
  return { code, severity, slot, record_id: recordId, detail };
}

function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function lintAll({ ledger, banks, reviews, strictReviews = false }) {
  const findings = [];
  const selected = selectedBySlot(ledger);

  for (let slot = 1; slot <= 19; slot++) {
    const records = selected.get(slot);
    const recordsById = new Map(records.map((record) => [record.record_id, record]));
    const recordOrder = new Map(records.map((record, index) => [record.record_id, index]));
    const bank = dataOf(banks.get(slot));
    if (!bank) {
      findings.push(finding("missing_bank_file", "error", slot, null, `distractor-banks/slot-${String(slot).padStart(2, "0")}.json is missing`));
      continue;
    }

    const entries = Array.isArray(bank.entries) ? bank.entries : [];
    const orderedEntries = entries.toSorted((a, b) => {
      const aRank = recordOrder.get(a.record_id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = recordOrder.get(b.record_id) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      const idOrder = compareCodeUnits(String(a.record_id), String(b.record_id));
      return idOrder || compareCodeUnits(JSON.stringify(a), JSON.stringify(b));
    });
    const entryCounts = new Map();
    for (const entry of orderedEntries) {
      entryCounts.set(entry.record_id, (entryCounts.get(entry.record_id) ?? 0) + 1);
    }
    for (const [recordId, count] of entryCounts) {
      if (count > 1) {
        findings.push(finding("duplicate_entry", "error", slot, recordId, `record_id appears ${count} times in the bank`));
      }
    }
    for (const record of records) {
      if (!entryCounts.has(record.record_id)) {
        findings.push(finding("missing_bank_entry", "error", slot, record.record_id, "selected ledger record is absent from the bank"));
      }
    }

    const authoredFronts = new Map();
    for (const entry of orderedEntries) {
      const record = recordsById.get(entry.record_id);
      if (!record) {
        findings.push(finding("unknown_record", "error", slot, entry.record_id ?? null, "bank entry is not a selected ledger record for this slot"));
        continue;
      }

      const expectedFrontHash = sha256OfText(record.front);
      const expectedBackHash = sha256OfText(record.back);
      if (entry.front_sha256 !== expectedFrontHash) {
        findings.push(finding("front_hash_mismatch", "error", slot, record.record_id, `expected ${expectedFrontHash}, got ${JSON.stringify(entry.front_sha256)}`));
      }
      if (entry.back_sha256 !== expectedBackHash) {
        findings.push(finding("back_hash_mismatch", "error", slot, record.record_id, `expected ${expectedBackHash}, got ${JSON.stringify(entry.back_sha256)}`));
      }
      if (!QUESTION_TYPES.has(entry.question_type)) {
        findings.push(finding("bad_question_type", "error", slot, record.record_id, `question_type must be single_choice or true_false, got ${JSON.stringify(entry.question_type)}`));
      }

      const distractors = Array.isArray(entry.distractors) ? entry.distractors : [];
      const emptyDistractor = distractors.some((value) => typeof value !== "string" || value.trim() === "");
      if ((entry.status === "authored" && entry.question_type === "single_choice" && distractors.length !== 3) || emptyDistractor) {
        findings.push(finding("wrong_distractor_count", "error", slot, record.record_id, `${entry.status} ${entry.question_type} entry has ${distractors.length} distractors${emptyDistractor ? " including an empty value" : ""}`));
      }
      if (
        entry.status === "needs_human_review" &&
        (typeof entry.review_reason !== "string" || !REVIEW_REASONS.has(entry.review_reason))
      ) {
        findings.push(finding("flagged_entry_invalid", "error", slot, record.record_id, `review_reason is missing or outside the allowed taxonomy: ${JSON.stringify(entry.review_reason)}`));
      }

      if (entry.status === "authored") {
        const normalizedBack = normalizeForComparison(record.back);
        const normalizedOptions = [record.back, ...distractors].map(normalizeForComparison);
        const seenOptions = new Set();
        for (const normalized of normalizedOptions) {
          if (seenOptions.has(normalized)) {
            findings.push(finding("dup_option_within_item", "error", slot, record.record_id, `normalized option collision on ${JSON.stringify(normalized)}`));
            break;
          }
          seenOptions.add(normalized);
        }
        if (distractors.some((value) => normalizeForComparison(String(value)) === normalizedBack)) {
          findings.push(finding("distractor_equals_back", "error", slot, record.record_id, "a distractor normalizes to the source back"));
        }
        if ([record.back, ...distractors].some((value) => BANNED_OPTION_PATTERN.test(String(value)))) {
          findings.push(finding("banned_phrase", "error", slot, record.record_id, "an option contains an all, none, or both of the above phrase"));
        }
        if (/\bnot\b/i.test(record.front) && distractors.some((value) => /\bnot\b/i.test(String(value)))) {
          findings.push(finding("double_negative", "error", slot, record.record_id, "the front and at least one distractor both contain 'not'"));
        }
        if (
          entry.question_type === "true_false" &&
          (typeof entry.true_false_answer !== "boolean" || distractors.length !== 0 || !["true", "false"].includes(normalizedBack))
        ) {
          findings.push(finding("true_false_invalid", "error", slot, record.record_id, "authored true_false entries require a boolean answer, no distractors, and a source back of literal true or false"));
        }

        const normalizedFront = normalizeForComparison(record.front);
        const priorRecordId = authoredFronts.get(normalizedFront);
        if (priorRecordId) {
          findings.push(finding("dup_question_within_slot", "error", slot, record.record_id, `front duplicates authored record ${priorRecordId}`));
        } else {
          authoredFronts.set(normalizedFront, record.record_id);
        }

        if (entry.question_type === "single_choice" && distractors.length > 0) {
          const meanDistractorLength = distractors.reduce((sum, value) => sum + String(value).trim().length, 0) / distractors.length;
          const correctLength = record.back.trim().length;
          if (meanDistractorLength > 0 && (correctLength > 2 * meanDistractorLength || correctLength < 0.5 * meanDistractorLength)) {
            findings.push(finding("length_clue", "warning", slot, record.record_id, `correct answer length ${correctLength} differs from distractor mean ${meanDistractorLength.toFixed(2)}`));
          }
        }
        for (let index = 0; index < distractors.length; index++) {
          const score = jaccard(tokenSet(String(distractors[index])), tokenSet(record.back));
          if (score > 0.6) {
            findings.push(finding("near_synonym_suspect", "warning", slot, record.record_id, `distractor ${index} has token Jaccard ${score.toFixed(3)} with the source back`));
          }
        }
      }

      if (record.back.trim().split(/\s+/).filter(Boolean).length <= 2) {
        findings.push(finding("short_answer_card", "warning", slot, record.record_id, "source back contains two words or fewer"));
      }
      const category = classifyFront(record.front);
      if (category !== "question") {
        findings.push(finding("non_question_front", "warning", slot, record.record_id, `front category: ${category}`));
      }
      if ([record.front, record.back, ...distractors].some((value) => STALE_ROLE_BOUND_COURSE_PATTERN.test(String(value)))) {
        findings.push(finding("stale_role_term", "warning", slot, record.record_id, "front, back, or distractor contains a stale role-bound term"));
      }
    }

    const review = dataOf(reviews.get(slot));
    if (!review) {
      findings.push(finding("missing_review_file", strictReviews ? "error" : "warning", slot, null, `distractor-reviews/slot-${String(slot).padStart(2, "0")}.json is missing`));
      continue;
    }

    const bankEntriesById = new Map();
    for (const entry of orderedEntries) {
      if (!bankEntriesById.has(entry.record_id)) bankEntriesById.set(entry.record_id, entry);
    }
    const verdicts = (Array.isArray(review.verdicts) ? review.verdicts : []).toSorted((a, b) => {
      const aRank = recordOrder.get(a.record_id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = recordOrder.get(b.record_id) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      const idOrder = compareCodeUnits(String(a.record_id), String(b.record_id));
      return idOrder || compareCodeUnits(JSON.stringify(a), JSON.stringify(b));
    });
    const verdictsById = new Map();
    for (const verdict of verdicts) {
      const entry = bankEntriesById.get(verdict.record_id);
      if (!entry) {
        findings.push(finding("unknown_review_record", "error", slot, verdict.record_id ?? null, "review verdict has no matching bank entry"));
        continue;
      }
      if (["pass", "revise", "needs_human_review"].includes(verdict.verdict) && !verdictsById.has(verdict.record_id)) {
        verdictsById.set(verdict.record_id, verdict);
      }
      const expectedHash = sha256OfText(JSON.stringify(entry.distractors));
      if (verdict.distractors_sha256 !== expectedHash) {
        findings.push(finding("stale_verdict", strictReviews ? "error" : "warning", slot, verdict.record_id, `expected ${expectedHash}, got ${JSON.stringify(verdict.distractors_sha256)}`));
      }
      if (verdict.verdict === "revise") {
        findings.push(finding("outstanding_revise", "error", slot, verdict.record_id, "checker verdict is revise"));
      }
    }
    for (const entry of orderedEntries) {
      if (entry.status === "authored" && !verdictsById.has(entry.record_id)) {
        findings.push(finding("unreviewed_entry", "error", slot, entry.record_id, "authored bank entry has no checker verdict"));
      }
    }
  }

  return findings;
}
