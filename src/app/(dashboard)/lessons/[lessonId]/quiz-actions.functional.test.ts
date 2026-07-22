import { beforeEach, describe, expect, it, vi } from "vitest";

type DbError = { message: string; code?: string } | null;
type QueryResult = { data: unknown; error: DbError };
type Query = PromiseLike<QueryResult> & {
  eq: (...args: unknown[]) => Query;
  in: (...args: unknown[]) => Query;
  is: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  limit: (...args: unknown[]) => Query;
  select: (...args: unknown[]) => Query;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
};

function query(data: unknown, error: DbError = null): Query {
  const result = { data, error };
  const value = {} as Query;
  value.eq = () => value;
  value.in = () => value;
  value.is = () => value;
  value.order = () => value;
  value.limit = () => value;
  value.select = () => value;
  value.maybeSingle = async () => result;
  value.single = async () => result;
  value.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return value;
}

const authoredQuestions = [
  {
    id: "q-1",
    question_text: "Question one",
    question_type: "single_choice",
    points: 1,
    explanation: "Because one is correct.",
    sort_order: 1,
    answer_options: [
      { id: "q1-good", option_text: "Good", is_correct: true, sort_order: 1 },
      { id: "q1-bad", option_text: "Bad", is_correct: false, sort_order: 2 },
    ],
  },
  {
    id: "q-2",
    question_text: "Question two",
    question_type: "multi_select",
    points: 1,
    explanation: "Choose both.",
    sort_order: 2,
    answer_options: [
      { id: "q2-a", option_text: "A", is_correct: true, sort_order: 1 },
      { id: "q2-b", option_text: "B", is_correct: true, sort_order: 2 },
      { id: "q2-bad", option_text: "No", is_correct: false, sort_order: 3 },
    ],
  },
];
let availableQuestions = authoredQuestions;

let currentUser: { id: string } | null;
let lessonQuizId: string;
let unlocked: boolean;
let priorAttempts: Array<{
  passed: boolean | null;
  score: number | null;
  completed_at: string | null;
}>;
let priorAttemptsError: DbError;
let quizPolicy: "never" | "after_pass" | "always";
let quizCooldownHours: number;
let quizQuestionsPerAttempt: number | null;
let incompleteAttempt: Record<string, unknown> | null;
let raceWinner: Record<string, unknown> | null;
let attempt: Record<string, unknown> | null;
let landedAttempt: Record<string, unknown> | null;
let insertError: DbError;
let updateData: unknown;
let insertedAttempt: Record<string, unknown> | null;
let updatedAttempt: Record<string, unknown> | null;
let incompleteReads: number;
let finalizeReads: number;
let recordRpcData: unknown;
let recordRpcError: DbError;

const rpc = vi.fn(async (name: string) => {
  if (name === "fn_lesson_is_unlocked") {
    return { data: unlocked, error: null };
  }
  if (name === "fn_record_quiz_answer") {
    return { data: recordRpcData, error: recordRpcError };
  }
  throw new Error(`Unexpected RPC: ${name}`);
});

const learnerClient = {
  auth: {
    getUser: async () => ({ data: { user: currentUser }, error: null }),
  },
  rpc,
  from: (table: string) => ({
    select: (columns: string) => {
      if (table === "lessons") {
        return columns === "prerequisite_lesson_id"
          ? query({ prerequisite_lesson_id: "content-lesson-1" })
          : query({ quiz_id: lessonQuizId });
      }
      if (table === "quizzes") {
        return query({
          id: "quiz-1",
          passing_score: 80,
          max_attempts: 3,
          retake_cooldown_hours: quizCooldownHours,
          questions_per_attempt: quizQuestionsPerAttempt,
          randomize_questions: false,
          randomize_answers: false,
          show_correct_answers_after: quizPolicy,
        });
      }
      if (table === "user_quiz_attempts") {
        if (columns.startsWith("passed")) {
          return query(priorAttemptsError ? null : priorAttempts, priorAttemptsError);
        }
        if (columns.startsWith("id, question_order")) {
          incompleteReads += 1;
          return query(incompleteReads > 1 && raceWinner ? raceWinner : incompleteAttempt);
        }
        if (columns.includes("score")) {
          finalizeReads += 1;
          return query(finalizeReads > 1 && landedAttempt ? landedAttempt : attempt);
        }
        return query(attempt);
      }
      throw new Error(`Unexpected learner table: ${table}`);
    },
  }),
};

const adminClient = {
  from: (table: string) => {
    if (table === "questions") {
      return {
        select: () => ({
          eq: () => ({ order: async () => ({ data: availableQuestions, error: null }) }),
          in: async (_column: string, ids: string[]) => ({
            data: availableQuestions.filter((question) => ids.includes(question.id)),
            error: null,
          }),
        }),
      };
    }
    if (table === "quizzes") {
      return { select: () => query({ show_correct_answers_after: quizPolicy }) };
    }
    if (table === "user_quiz_attempts") {
      return {
        insert: (row: Record<string, unknown>) => {
          insertedAttempt = row;
          return query(insertError ? null : { id: "attempt-new" }, insertError);
        },
        update: (row: Record<string, unknown>) => {
          updatedAttempt = row;
          return query(updateData);
        },
      };
    }
    throw new Error(`Unexpected admin table: ${table}`);
  },
};

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => learnerClient),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminClient),
}));
vi.mock("@/lib/integrations/sandra/course-completed", () => ({
  emitSandraCourseCompletedForLesson: vi.fn(async () => ({
    ok: false,
    reason: "not_configured",
  })),
}));

import {
  answerQuizQuestion,
  finalizeQuizAttempt,
  startQuizAttempt,
} from "./quiz-actions";

describe("quiz server actions", () => {
  beforeEach(() => {
    currentUser = { id: "user-1" };
    lessonQuizId = "quiz-1";
    unlocked = true;
    priorAttempts = [];
    priorAttemptsError = null;
    quizPolicy = "after_pass";
    quizCooldownHours = 0;
    quizQuestionsPerAttempt = 1;
    incompleteAttempt = null;
    raceWinner = null;
    attempt = {
      id: "attempt-1",
      user_id: "user-1",
      quiz_id: "quiz-1",
      lesson_id: "lesson-1",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
      responses: { "q-1": ["q1-good"] },
      answer_results: {
        "q-1": {
          is_correct: true,
          explanation: "Because one is correct.",
          points: 1,
          question_type: "single_choice",
        },
      },
      score: null,
      passed: null,
      completed_at: null,
    };
    landedAttempt = null;
    insertError = null;
    updateData = { id: "attempt-1" };
    insertedAttempt = null;
    updatedAttempt = null;
    incompleteReads = 0;
    finalizeReads = 0;
    recordRpcData = [{
      responses: { "q-1": ["q1-good"] },
      answer_results: {
        "q-1": {
          is_correct: true,
          explanation: "Because one is correct.",
          points: 1,
          question_type: "single_choice",
        },
      },
      completed_at: null,
      already_answered: false,
    }];
    recordRpcError = null;
    availableQuestions = authoredQuestions;
    vi.clearAllMocks();
  });

  it("starts and persists the exact question subset without answer data", async () => {
    const result = await startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" });

    expect(result).toMatchObject({
      ok: true,
      attemptId: "attempt-new",
      resumed: false,
      responses: {},
      reveals: [],
    });
    expect(insertedAttempt).toMatchObject({
      user_id: "user-1",
      quiz_id: "quiz-1",
      lesson_id: "lesson-1",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
      responses: {},
    });
    if (result.ok) {
      expect(JSON.stringify(result.questions)).not.toContain("is_correct");
      expect(JSON.stringify(result.questions)).not.toContain("explanation");
    }
  });

  it("resumes with persisted responses and reveals only answered questions", async () => {
    incompleteAttempt = {
      id: "attempt-existing",
      question_order: ["q-1", "q-2"],
      answer_orders: {
        "q-1": ["q1-good", "q1-bad"],
        "q-2": ["q2-b", "q2-a", "q2-bad"],
      },
      responses: { "q-1": ["q1-bad"] },
      answer_results: { "q-1": { is_correct: false } },
    };

    const result = await startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" });

    expect(result).toMatchObject({
      ok: true,
      attemptId: "attempt-existing",
      resumed: true,
      responses: { "q-1": ["q1-bad"] },
      reveals: [{
        questionId: "q-1",
        isCorrect: false,
      }],
    });
    if (result.ok) {
      expect(result.reveals.map((reveal) => reveal.questionId)).toEqual(["q-1"]);
      expect(JSON.stringify(result.reveals)).not.toContain("q1-good");
      expect(JSON.stringify(result.reveals)).not.toContain("Because one is correct.");
      expect(JSON.stringify(result.questions)).not.toContain("is_correct");
      expect(JSON.stringify(result.questions)).not.toContain("explanation");
    }
  });

  it("keeps a resumed wrong answer private after the authored key changes", async () => {
    incompleteAttempt = {
      id: "attempt-existing",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
      responses: { "q-1": ["q1-bad"] },
      answer_results: { "q-1": { is_correct: false } },
    };
    availableQuestions = authoredQuestions.map((question) =>
      question.id === "q-1"
        ? {
            ...question,
            explanation: "The changed key must stay private.",
            answer_options: question.answer_options.map((option) => ({
              ...option,
              is_correct: option.id === "q1-bad",
            })),
          }
        : question,
    );

    const result = await startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" });

    expect(result).toMatchObject({
      ok: true,
      reveals: [{ questionId: "q-1", isCorrect: false }],
    });
    expect(JSON.stringify(result)).not.toContain("The changed key must stay private.");
  });

  it("fails closed instead of mislabeling a legacy response without a grading snapshot", async () => {
    incompleteAttempt = {
      id: "attempt-existing",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
      responses: { "q-1": ["q1-good"] },
      answer_results: {},
    };

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "This attempt has no stored grading result.",
    });
  });

  it("fails closed when a resumed question is no longer available", async () => {
    incompleteAttempt = {
      id: "attempt-existing",
      question_order: ["q-1", "q-2"],
      answer_orders: {
        "q-1": ["q1-good", "q1-bad"],
        "q-2": ["q2-a", "q2-b", "q2-bad"],
      },
      responses: {},
    };
    availableQuestions = authoredQuestions.filter((question) => question.id !== "q-2");

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "This attempt contains unavailable questions.",
    });
  });

  it("fails closed when a resumed attempt has an empty question snapshot", async () => {
    incompleteAttempt = {
      id: "attempt-existing",
      question_order: [],
      answer_orders: {},
      responses: {},
    };

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "This attempt contains unavailable questions.",
    });
  });

  it("fails closed when a resumed answer option is no longer available", async () => {
    incompleteAttempt = {
      id: "attempt-existing",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
      responses: {},
    };
    availableQuestions = authoredQuestions.map((question) =>
      question.id === "q-1"
        ? {
            ...question,
            answer_options: question.answer_options.filter(
              (option) => option.id !== "q1-bad",
            ),
          }
        : question,
    );

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "This attempt contains unavailable questions.",
    });
  });

  it("resumes the race winner when concurrent starts hit the unique index", async () => {
    insertError = { code: "23505", message: "duplicate incomplete attempt" };
    raceWinner = {
      id: "attempt-winner",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
      responses: {},
    };

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toMatchObject({ ok: true, attemptId: "attempt-winner", resumed: true });
  });

  it("rejects a quiz that is not attached to the lesson", async () => {
    lessonQuizId = "quiz-other";

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "This quiz does not belong to the lesson.",
    });
    expect(insertedAttempt).toBeNull();
  });

  it("enforces cooldown before creating an attempt", async () => {
    quizCooldownHours = 24;
    priorAttempts = [{ passed: false, score: 50, completed_at: new Date().toISOString() }];

    const result = await startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toContain("Retake cooldown");
    expect(insertedAttempt).toBeNull();
  });

  it("rejects a stale start after the learner has passed without inserting", async () => {
    priorAttempts = [{
      passed: true,
      score: 100,
      completed_at: new Date().toISOString(),
    }];

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "You've already passed this quiz.",
    });
    expect(insertedAttempt).toBeNull();
  });

  it("rejects a stale start after max attempts without inserting", async () => {
    priorAttempts = [
      { passed: false, score: 50, completed_at: "2026-07-21T10:00:00.000Z" },
      { passed: false, score: 60, completed_at: "2026-07-21T11:00:00.000Z" },
      { passed: false, score: 70, completed_at: "2026-07-21T12:00:00.000Z" },
    ];

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "You've used all of your attempts on this quiz.",
    });
    expect(insertedAttempt).toBeNull();
  });

  it("fails closed when prior-attempt eligibility cannot be read", async () => {
    priorAttemptsError = { message: "read unavailable" };

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toEqual({
      ok: false,
      error: "Your quiz eligibility could not be verified. Try again.",
    });
    expect(insertedAttempt).toBeNull();
  });

  it("persists the first answer through the learner RPC and reveals only that question", async () => {
    const result = await answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good"],
    });

    expect(rpc).toHaveBeenCalledWith("fn_record_quiz_answer", {
      p_attempt_id: "attempt-1",
      p_question_id: "q-1",
      p_selected: ["q1-good"],
    });
    expect(result).toEqual({
      ok: true,
      reveal: {
        questionId: "q-1",
        isCorrect: true,
        explanation: "Because one is correct.",
      },
    });
  });

  it("does not return answer-key material after a wrong answer", async () => {
    recordRpcData = [{
      responses: { "q-1": ["q1-bad"] },
      answer_results: { "q-1": { is_correct: false } },
      completed_at: null,
      already_answered: false,
    }];

    const result = await answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-bad"],
    });

    expect(result).toEqual({
      ok: true,
      reveal: { questionId: "q-1", isCorrect: false },
    });
    expect(JSON.stringify(result)).not.toContain("q1-good");
    expect(JSON.stringify(result)).not.toContain("Because one is correct.");
  });

  it("uses the atomic grading snapshot instead of re-reading a changed key", async () => {
    recordRpcData = [{
      responses: { "q-1": ["q1-good"] },
      answer_results: { "q-1": { is_correct: false } },
      completed_at: null,
      already_answered: false,
    }];

    await expect(answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good"],
    })).resolves.toEqual({
      ok: true,
      reveal: { questionId: "q-1", isCorrect: false },
    });
  });

  it("rejects answer grading after current lesson access is revoked", async () => {
    unlocked = false;

    await expect(answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good"],
    })).resolves.toEqual({
      ok: false,
      error: "Complete the prerequisite lessons first.",
    });
    expect(rpc).not.toHaveBeenCalledWith("fn_record_quiz_answer", expect.anything());
  });

  it("reveals a correct zero-point answer as correct without changing final scoring", async () => {
    availableQuestions = authoredQuestions.map((question) =>
      question.id === "q-1" ? { ...question, points: 0 } : question,
    );

    await expect(answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good"],
    })).resolves.toMatchObject({
      ok: true,
      reveal: { isCorrect: true },
    });
  });

  it("returns the same reveal for an idempotent same-selection resubmit", async () => {
    recordRpcData = [{
      responses: { "q-1": ["q1-good"] },
      answer_results: {
        "q-1": {
          is_correct: true,
          explanation: "Because one is correct.",
          points: 1,
          question_type: "single_choice",
        },
      },
      completed_at: null,
      already_answered: true,
    }];

    await expect(answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good"],
    })).resolves.toMatchObject({ ok: true, reveal: { isCorrect: true } });
  });

  it("surfaces a different-selection first-answer-lock rejection", async () => {
    recordRpcData = null;
    recordRpcError = { message: "This question has already been answered." };

    await expect(answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-bad"],
    })).resolves.toEqual({
      ok: false,
      error: "This question has already been answered.",
    });
  });

  it("rejects an out-of-attempt question before the RPC", async () => {
    const result = await answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-2",
      selected: ["q2-a"],
    });

    expect(result).toEqual({
      ok: false,
      error: "The response contains a question outside this attempt.",
    });
    expect(rpc).not.toHaveBeenCalledWith("fn_record_quiz_answer", expect.anything());
  });

  it("rejects invalid cardinality before the RPC", async () => {
    const result = await answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good", "q1-bad"],
    });

    expect(result).toEqual({
      ok: false,
      error: "Choose one answer for each single-choice question.",
    });
    expect(rpc).not.toHaveBeenCalledWith("fn_record_quiz_answer", expect.anything());
  });

  it("rejects an option outside the persisted answer order before the RPC", async () => {
    const result = await answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["forged-option"],
    });

    expect(result).toEqual({
      ok: false,
      error: "The response contains an answer outside this attempt.",
    });
    expect(rpc).not.toHaveBeenCalledWith("fn_record_quiz_answer", expect.anything());
  });

  it("rejects an answer after completion before the RPC", async () => {
    attempt = { ...attempt, completed_at: "2026-07-21T12:00:00Z" };

    await expect(answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good"],
    })).resolves.toEqual({
      ok: false,
      error: "This attempt has already been submitted.",
    });
  });

  it("rejects an unauthenticated answer", async () => {
    currentUser = null;

    await expect(answerQuizQuestion({
      attemptId: "attempt-1",
      questionId: "q-1",
      selected: ["q1-good"],
    })).resolves.toEqual({ ok: false, error: "You must be signed in." });
  });

  it("rejects an unauthenticated finalize", async () => {
    currentUser = null;

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toEqual({
      ok: false,
      error: "You must be signed in.",
    });
  });

  it("finalizes only persisted responses and does not rewrite them", async () => {
    const result = await finalizeQuizAttempt({ attemptId: "attempt-1" });

    expect(result).toMatchObject({ ok: true, score: 100, passed: true });
    expect(updatedAttempt).toEqual(expect.objectContaining({ score: 100, passed: true }));
    expect(updatedAttempt).not.toHaveProperty("responses");
    expect(revalidatePath).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.review).toEqual([{
        questionId: "q-1",
        questionNumber: 1,
        explanation: "Because one is correct.",
      }]);
    }
  });

  it("excludes missed-question answers and explanations from final review", async () => {
    quizPolicy = "always";
    quizQuestionsPerAttempt = 2;
    attempt = {
      ...attempt,
      question_order: ["q-1", "q-2"],
      answer_orders: {
        "q-1": ["q1-good", "q1-bad"],
        "q-2": ["q2-a", "q2-b", "q2-bad"],
      },
      responses: {
        "q-1": ["q1-good"],
        "q-2": ["q2-bad"],
      },
      answer_results: {
        "q-1": {
          is_correct: true,
          explanation: "Because one is correct.",
          points: 1,
          question_type: "single_choice",
        },
        "q-2": { is_correct: false, points: 1, question_type: "multi_select" },
      },
    };

    const result = await finalizeQuizAttempt({ attemptId: "attempt-1" });

    expect(result).toMatchObject({ ok: true, review: [{
      questionId: "q-1",
      questionNumber: 1,
      explanation: "Because one is correct.",
    }] });
    expect(JSON.stringify(result)).not.toContain("q2-a");
    expect(JSON.stringify(result)).not.toContain("q2-b");
    expect(JSON.stringify(result)).not.toContain("Choose both.");
  });

  it("keeps final review private when the authored key changes after locking", async () => {
    quizPolicy = "always";
    attempt = {
      ...attempt,
      responses: { "q-1": ["q1-bad"] },
      answer_results: {
        "q-1": {
          is_correct: false,
          points: 1,
          question_type: "single_choice",
        },
      },
    };
    availableQuestions = authoredQuestions.map((question) =>
      question.id === "q-1"
        ? {
            ...question,
            explanation: "Changed explanation must stay private.",
            answer_options: question.answer_options.map((option) => ({
              ...option,
              is_correct: option.id === "q1-bad",
            })),
          }
        : question,
    );

    const result = await finalizeQuizAttempt({ attemptId: "attempt-1" });

    expect(result).toMatchObject({ ok: true, review: null });
    expect(result).toMatchObject({ ok: true, score: 0, passed: false });
    expect(JSON.stringify(result)).not.toContain("Changed explanation must stay private.");
  });

  it("scores from the locked grading snapshot after the authored key changes", async () => {
    attempt = {
      ...attempt,
      responses: { "q-1": ["q1-good"] },
      answer_results: {
        "q-1": {
          is_correct: true,
          explanation: "Because one is correct.",
          points: 1,
          question_type: "single_choice",
        },
      },
    };
    availableQuestions = authoredQuestions.map((question) =>
      question.id === "q-1"
        ? {
            ...question,
            answer_options: question.answer_options.map((option) => ({
              ...option,
              is_correct: option.id === "q1-bad",
            })),
          }
        : question,
    );

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toMatchObject({
      ok: true,
      score: 100,
      passed: true,
      earnedPoints: 1,
      totalPoints: 1,
    });
  });

  it("rejects finalize when a persisted question is unanswered", async () => {
    attempt = { ...attempt, responses: {} };

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toEqual({
      ok: false,
      error: "Answer every question before submitting.",
    });
    expect(updatedAttempt).toBeNull();
  });

  it("rejects invalid persisted single-choice cardinality", async () => {
    attempt = { ...attempt, responses: { "q-1": ["q1-good", "q1-bad"] } };

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toEqual({
      ok: false,
      error: "Choose one answer for each single-choice question.",
    });
  });

  it("returns a stored success when finalize is retried after completion", async () => {
    attempt = {
      ...attempt,
      score: 100,
      passed: true,
      completed_at: "2026-07-21T12:00:00Z",
    };

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toMatchObject({
      ok: true,
      score: 100,
      passed: true,
      attemptId: "attempt-1",
    });
    expect(updatedAttempt).toBeNull();
  });

  it("rejects a completed-attempt retry after current access is revoked", async () => {
    unlocked = false;
    attempt = {
      ...attempt,
      score: 100,
      passed: true,
      completed_at: "2026-07-21T12:00:00Z",
    };

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toEqual({
      ok: false,
      error: "Complete the prerequisite lessons first.",
    });
  });

  it("re-reads and returns a concurrent landed finalize as success", async () => {
    updateData = null;
    landedAttempt = {
      ...attempt,
      score: 100,
      passed: true,
      completed_at: "2026-07-21T12:00:00Z",
    };

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toMatchObject({
      ok: true,
      score: 100,
      passed: true,
    });
  });

  it("returns a concurrent landed result even when the other finalize changed eligibility", async () => {
    priorAttempts = [{
      passed: true,
      score: 100,
      completed_at: "2026-07-21T12:00:00Z",
    }];
    updateData = null;
    landedAttempt = {
      ...attempt,
      score: 100,
      passed: true,
      completed_at: "2026-07-21T12:00:00Z",
    };

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toMatchObject({
      ok: true,
      score: 100,
      passed: true,
    });
  });

  it("keeps the end-of-attempt answer policy unchanged", async () => {
    quizPolicy = "never";

    await expect(finalizeQuizAttempt({ attemptId: "attempt-1" })).resolves.toMatchObject({
      ok: true,
      review: null,
    });
  });
});
