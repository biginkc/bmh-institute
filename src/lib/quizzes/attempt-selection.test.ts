import { describe, expect, it } from "vitest";

import { buildAttemptSelection, restoreAttemptQuestions } from "./attempt-selection";

const QUESTIONS = [
  {
    id: "q-1",
    question_text: "Question one",
    question_type: "single_choice" as const,
    sort_order: 1,
    options: [
      { id: "q1-a", option_text: "A", sort_order: 1 },
      { id: "q1-b", option_text: "B", sort_order: 2 },
    ],
  },
  {
    id: "q-2",
    question_text: "Question two",
    question_type: "multi_select" as const,
    sort_order: 2,
    options: [
      { id: "q2-a", option_text: "A", sort_order: 1 },
      { id: "q2-b", option_text: "B", sort_order: 2 },
    ],
  },
  {
    id: "q-3",
    question_text: "Question three",
    question_type: "true_false" as const,
    sort_order: 3,
    options: [
      { id: "q3-a", option_text: "True", sort_order: 1 },
      { id: "q3-b", option_text: "False", sort_order: 2 },
    ],
  },
];

describe("quiz attempt selection", () => {
  it("persists the selected question subset and each answer order", () => {
    const randomValues = [0.9, 0.1, 0.7, 0.8, 0.2, 0.6, 0.3];
    let index = 0;

    const selection = buildAttemptSelection({
      questions: QUESTIONS,
      questionsPerAttempt: 2,
      randomizeQuestions: true,
      randomizeAnswers: true,
      random: () => randomValues[index++] ?? 0.5,
    });

    expect(selection.questionOrder).toHaveLength(2);
    expect(Object.keys(selection.answerOrders)).toEqual(
      expect.arrayContaining(selection.questionOrder),
    );
    for (const questionId of selection.questionOrder) {
      expect(selection.answerOrders[questionId]).toHaveLength(2);
    }
  });

  it("restores the exact persisted order instead of reshuffling on resume", () => {
    const restored = restoreAttemptQuestions({
      questions: QUESTIONS,
      questionOrder: ["q-3", "q-1"],
      answerOrders: {
        "q-3": ["q3-b", "q3-a"],
        "q-1": ["q1-b", "q1-a"],
      },
    });

    expect(restored.map((question) => question.id)).toEqual(["q-3", "q-1"]);
    expect(restored[0].options.map((option) => option.id)).toEqual([
      "q3-b",
      "q3-a",
    ]);
  });

  it("uses authored order when randomization is disabled", () => {
    const selection = buildAttemptSelection({
      questions: QUESTIONS,
      questionsPerAttempt: null,
      randomizeQuestions: false,
      randomizeAnswers: false,
    });

    expect(selection.questionOrder).toEqual(["q-1", "q-2", "q-3"]);
    expect(selection.answerOrders["q-1"]).toEqual(["q1-a", "q1-b"]);
  });
});
