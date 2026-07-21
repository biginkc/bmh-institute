import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./quiz-actions.ts", import.meta.url), "utf8");

describe("quiz action security contract", () => {
  it("persists a started attempt before returning its randomized questions", () => {
    expect(source).toContain("buildAttemptSelection");
    expect(source).toContain("question_order: selection.questionOrder");
    expect(source).toContain("answer_orders: selection.answerOrders");
  });

  it("resumes the winning attempt when concurrent starts hit the unique index", () => {
    expect(source).toContain('attemptError?.code === "23505"');
    expect(source).toContain("loadIncompleteAttempt");
    expect(source).toContain("resumed: true");
  });

  it("submits only the authenticated learner's incomplete persisted attempt", () => {
    expect(source).toContain('.eq("id", attempt.id)');
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('.is("completed_at", null)');
    expect(source).toContain("validateResponseCardinality");
  });

  it("records each answer through the atomic learner RPC", () => {
    expect(source).toContain('"fn_record_quiz_answer"');
    expect(source).toContain("completedAttemptResult");
  });

  it("applies the configured answer-review policy", () => {
    expect(source).toContain("show_correct_answers_after");
    expect(source).toContain("shouldRevealAnswers");
  });
});
