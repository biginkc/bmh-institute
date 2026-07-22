import { createHash } from "node:crypto";

import type { ImportPlan, ImportOperation } from "./operations";

export type ReleasedQuizGraph = {
  quizzes: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  answer_options: Record<string, unknown>[];
};

const TABLE_KEYS = {
  quizzes: [
    "description", "id", "max_attempts", "passing_score",
    "questions_per_attempt", "randomize_answers", "randomize_questions",
    "retake_cooldown_hours", "show_correct_answers_after", "title",
  ],
  questions: [
    "explanation", "id", "points", "question_text", "question_type",
    "quiz_id", "sort_order",
  ],
  answer_options: [
    "id", "is_correct", "option_text", "question_id", "sort_order",
  ],
} as const;

function exactRow(operation: ImportOperation, keys: readonly string[]) {
  const row = Object.fromEntries(keys.map((key) => [key, operation.row[key]]));
  if (Object.values(row).some((value) => value === undefined)) {
    throw new Error(`${operation.table}:${operation.sourceKey} is missing a released quiz revision field.`);
  }
  return row;
}

export function extractQuizGraph(plan: ImportPlan): ReleasedQuizGraph {
  const graph: ReleasedQuizGraph = {
    quizzes: [],
    questions: [],
    answer_options: [],
  };
  for (const operation of plan.operations) {
    if (operation.table === "quizzes") {
      graph.quizzes.push(exactRow(operation, TABLE_KEYS.quizzes));
    } else if (operation.table === "questions") {
      graph.questions.push(exactRow(operation, TABLE_KEYS.questions));
    } else if (operation.table === "answer_options") {
      graph.answer_options.push(exactRow(operation, TABLE_KEYS.answer_options));
    }
  }
  for (const rows of Object.values(graph)) {
    rows.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }
  return graph;
}

export function buildReleasedQuizGraph(plan: ImportPlan): ReleasedQuizGraph {
  const graph = extractQuizGraph(plan);
  if (graph.quizzes.length !== 19 || graph.questions.length !== 920) {
    throw new Error(
      `Released quiz revision requires exactly 19 quizzes and 920 questions; received ${graph.quizzes.length} and ${graph.questions.length}.`,
    );
  }
  if (graph.quizzes.some((quiz) => quiz.questions_per_attempt !== null)) {
    throw new Error("Released quiz revision requires exhaustive questions_per_attempt=null for every quiz.");
  }
  return graph;
}

export function releasedQuizGraphSha256(graph: ReleasedQuizGraph) {
  return createHash("sha256").update(JSON.stringify(graph)).digest("hex");
}

export function releasedQuizRevisionConfirmation(args: {
  importId: string;
  priorManifestSha256: string;
  manifestSha256: string;
}) {
  return [
    "REVISE-RELEASED-QUIZZES",
    args.importId,
    args.priorManifestSha256,
    args.manifestSha256,
    "19",
    "920",
  ].join(":");
}

export function releasedQuizRollbackConfirmation(args: {
  importId: string;
  expectedRevision: number;
  manifestSha256: string;
  priorManifestSha256: string;
}) {
  return [
    "ROLLBACK-RELEASED-QUIZZES",
    args.importId,
    String(args.expectedRevision),
    args.manifestSha256,
    args.priorManifestSha256,
  ].join(":");
}
