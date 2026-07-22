import { createHash } from "node:crypto";

export const QUIZ_BANK_SCHEMA = "bmh.quiz-question-bank.v1";
export const QUIZ_BANK_SELECTED_TOTAL = 977;

const QUIZ_CONFIG = {
  passing_score: 80,
  questions_per_attempt: null,
  randomize_questions: true,
  randomize_answers: true,
  max_attempts: null,
  retake_cooldown_hours: 0,
  show_correct_answers_after: "after_pass",
};

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireNonNegativeInteger(value, label, errors) {
  if (!Number.isInteger(value) || value < 0) errors.push(`${label} must be a non-negative integer`);
}

export function quizBankSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function projectQuizBankQuestion(question, normalizeText) {
  const manifestQuestion = { ...question };
  delete manifestQuestion.provenance;
  const normalize = (value) => normalizeText(value).replaceAll("\u2014", "-");
  return {
    ...manifestQuestion,
    question_text: normalize(manifestQuestion.question_text),
    explanation: typeof manifestQuestion.explanation === "string"
      ? normalize(manifestQuestion.explanation)
      : manifestQuestion.explanation,
    options: manifestQuestion.options.map((option) => ({
      ...option,
      option_text: normalize(option.option_text),
    })),
  };
}

export function validateQuizBank(bank) {
  const errors = [];
  if (!isRecord(bank)) return ["Question bank must be a JSON object"];
  if (bank.schema_version !== QUIZ_BANK_SCHEMA) {
    errors.push(`Question bank schema_version must be ${QUIZ_BANK_SCHEMA}`);
  }
  if (!isRecord(bank.quiz_config)) {
    errors.push("Question bank quiz_config must be an object");
  } else {
    const expectedFields = Object.keys(QUIZ_CONFIG);
    const actualFields = Object.keys(bank.quiz_config);
    if (
      actualFields.length !== expectedFields.length
      || actualFields.some((field) => !expectedFields.includes(field))
    ) {
      errors.push(`Question bank quiz_config fields must be exactly: ${expectedFields.join(", ")}`);
    }
    for (const [field, expected] of Object.entries(QUIZ_CONFIG)) {
      if (bank.quiz_config[field] !== expected) {
        errors.push(`Question bank quiz_config.${field} must be ${JSON.stringify(expected)}`);
      }
    }
  }
  if (!isRecord(bank.totals)) {
    errors.push("Question bank totals must be an object");
  } else if (bank.totals.selected !== QUIZ_BANK_SELECTED_TOTAL) {
    errors.push(`Question bank totals.selected must be ${QUIZ_BANK_SELECTED_TOTAL}`);
  }
  if (!Array.isArray(bank.slots) || bank.slots.length !== 19) {
    errors.push("Question bank must contain exactly 19 slots");
    return errors;
  }

  const seenSlots = new Set();
  const sourceKeys = new Set();
  const totals = { selected: 0, generated: 0, needs_human_review: 0 };
  for (const slot of bank.slots) {
    if (!isRecord(slot)) {
      errors.push("Every question bank slot must be an object");
      continue;
    }
    const label = `Question bank slot ${slot.slot ?? "?"}`;
    if (!Number.isInteger(slot.slot) || slot.slot < 1 || slot.slot > 19) {
      errors.push(`${label} has an invalid slot number`);
    } else if (seenSlots.has(slot.slot)) {
      errors.push(`${label} is duplicated`);
    } else {
      seenSlots.add(slot.slot);
    }
    requireNonNegativeInteger(slot.selected_count, `${label} selected_count`, errors);
    requireNonNegativeInteger(slot.generated_count, `${label} generated_count`, errors);
    requireNonNegativeInteger(slot.needs_human_review_count, `${label} needs_human_review_count`, errors);
    if (
      Number.isInteger(slot.generated_count)
      && Number.isInteger(slot.needs_human_review_count)
      && slot.generated_count + slot.needs_human_review_count !== slot.selected_count
    ) {
      errors.push(`${label} generated_count + needs_human_review_count must equal selected_count`);
    }
    if (!Array.isArray(slot.questions) || slot.questions.length !== slot.generated_count) {
      errors.push(`${label} questions length must equal generated_count`);
    }
    if (!Array.isArray(slot.needs_human_review) || slot.needs_human_review.length !== slot.needs_human_review_count) {
      errors.push(`${label} needs_human_review length must equal needs_human_review_count`);
    }
    const questionSortOrders = new Set();
    for (const question of Array.isArray(slot.questions) ? slot.questions : []) {
      if (!isRecord(question) || typeof question.source_key !== "string" || !question.source_key.trim()) {
        errors.push(`${label} contains a question without a source_key`);
        continue;
      }
      if (sourceKeys.has(question.source_key)) errors.push(`Duplicate question source_key ${question.source_key}`);
      sourceKeys.add(question.source_key);
      if (typeof question.question_text !== "string" || !question.question_text.trim()) {
        errors.push(`${question.source_key} needs question_text`);
      }
      if (!["single_choice", "multi_select", "true_false"].includes(question.question_type)) {
        errors.push(`${question.source_key} has an invalid question_type`);
      }
      if (typeof question.explanation !== "string" || !question.explanation.trim()) {
        errors.push(`${question.source_key} needs an explanation`);
      }
      if (!Number.isInteger(question.points) || question.points < 0) {
        errors.push(`${question.source_key} points must be a non-negative integer`);
      }
      if (!Number.isInteger(question.sort_order) || question.sort_order < 1) {
        errors.push(`${question.source_key} sort_order must be a positive integer`);
      } else if (questionSortOrders.has(question.sort_order)) {
        errors.push(`${label} contains duplicate question sort_order ${question.sort_order}`);
      } else {
        questionSortOrders.add(question.sort_order);
      }
      if (!Array.isArray(question.options) || question.options.length < 2) {
        errors.push(`${question.source_key} must contain at least two options`);
      }
      let correctCount = 0;
      const optionSortOrders = new Set();
      for (const option of Array.isArray(question.options) ? question.options : []) {
        if (!isRecord(option) || typeof option.source_key !== "string" || !option.source_key.trim()) {
          errors.push(`${question.source_key} contains an option without a source_key`);
          continue;
        }
        if (sourceKeys.has(option.source_key)) errors.push(`Duplicate option source_key ${option.source_key}`);
        sourceKeys.add(option.source_key);
        if (typeof option.option_text !== "string" || !option.option_text.trim()) {
          errors.push(`${option.source_key} needs option_text`);
        }
        if (typeof option.is_correct !== "boolean") {
          errors.push(`${option.source_key} is_correct must be boolean`);
        } else if (option.is_correct) {
          correctCount += 1;
        }
        if (!Number.isInteger(option.sort_order) || option.sort_order < 1) {
          errors.push(`${option.source_key} sort_order must be a positive integer`);
        } else if (optionSortOrders.has(option.sort_order)) {
          errors.push(`${question.source_key} contains duplicate option sort_order ${option.sort_order}`);
        } else {
          optionSortOrders.add(option.sort_order);
        }
      }
      if (question.question_type === "multi_select" ? correctCount < 2 : correctCount !== 1) {
        errors.push(`${question.source_key} has an invalid number of correct options`);
      }
    }
    totals.selected += Number.isInteger(slot.selected_count) ? slot.selected_count : 0;
    totals.generated += Number.isInteger(slot.generated_count) ? slot.generated_count : 0;
    totals.needs_human_review += Number.isInteger(slot.needs_human_review_count)
      ? slot.needs_human_review_count
      : 0;
  }
  for (let slot = 1; slot <= 19; slot += 1) {
    if (!seenSlots.has(slot)) errors.push(`Question bank is missing slot ${slot}`);
  }
  for (const [field, total] of Object.entries(totals)) {
    if (bank.totals?.[field] !== total) {
      errors.push(`Question bank totals.${field} must equal the slot total ${total}`);
    }
  }
  return errors;
}
