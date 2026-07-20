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
    ],
  },
];

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
let attemptToSubmit: Record<string, unknown> | null;
let insertError: DbError;
let updateData: unknown;
let insertedAttempt: Record<string, unknown> | null;
let updatedAttempt: Record<string, unknown> | null;
let incompleteReads: number;

const learnerClient = {
  auth: {
    getUser: async () => ({ data: { user: currentUser }, error: null }),
  },
  rpc: async () => ({ data: unlocked, error: null }),
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
        return query(attemptToSubmit);
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
          eq: () => ({ order: async () => ({ data: authoredQuestions, error: null }) }),
          in: async () => ({ data: authoredQuestions, error: null }),
        }),
      };
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

import { startQuizAttempt, submitQuizAttempt } from "./quiz-actions";

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
    attemptToSubmit = {
      id: "attempt-1",
      user_id: "user-1",
      quiz_id: "quiz-1",
      lesson_id: "lesson-1",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
      completed_at: null,
    };
    insertError = null;
    updateData = { id: "attempt-1" };
    insertedAttempt = null;
    updatedAttempt = null;
    incompleteReads = 0;
    vi.clearAllMocks();
  });

  it("starts and persists the exact question subset before returning it", async () => {
    const result = await startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" });

    expect(result).toMatchObject({ ok: true, attemptId: "attempt-new", resumed: false });
    expect(insertedAttempt).toMatchObject({
      user_id: "user-1",
      quiz_id: "quiz-1",
      lesson_id: "lesson-1",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
    });
  });

  it("resumes an existing incomplete attempt without inserting another", async () => {
    incompleteAttempt = {
      id: "attempt-existing",
      question_order: ["q-2"],
      answer_orders: { "q-2": ["q2-b", "q2-a"] },
    };

    const result = await startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" });

    expect(result).toMatchObject({ ok: true, attemptId: "attempt-existing", resumed: true });
    expect(insertedAttempt).toBeNull();
    if (result.ok) {
      expect(result.questions[0].options.map((option) => option.id)).toEqual([
        "q2-b",
        "q2-a",
      ]);
    }
  });

  it("resumes the race winner when concurrent starts hit the unique index", async () => {
    insertError = { code: "23505", message: "duplicate incomplete attempt" };
    raceWinner = {
      id: "attempt-winner",
      question_order: ["q-1"],
      answer_orders: { "q-1": ["q1-good", "q1-bad"] },
    };

    await expect(
      startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" }),
    ).resolves.toMatchObject({
      ok: true,
      attemptId: "attempt-winner",
      resumed: true,
    });
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
    priorAttempts = [{
      passed: false,
      score: 50,
      completed_at: new Date().toISOString(),
    }];

    const result = await startQuizAttempt({ quizId: "quiz-1", lessonId: "lesson-1" });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toContain("Retake cooldown");
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

  it("rejects an unauthenticated attempt lookup", async () => {
    currentUser = null;

    await expect(
      submitQuizAttempt({ attemptId: "attempt-1", responses: {} }),
    ).resolves.toEqual({ ok: false, error: "You must be signed in." });
  });

  it("scores only the persisted subset and reveals answers after a pass", async () => {
    const result = await submitQuizAttempt({
      attemptId: "attempt-1",
      responses: { "q-1": ["q1-good"] },
    });

    expect(result).toMatchObject({ ok: true, score: 100, passed: true });
    expect(updatedAttempt).toMatchObject({
      score: 100,
      passed: true,
      responses: { "q-1": ["q1-good"] },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/lessons/lesson-1");
    expect(revalidatePath).toHaveBeenCalledWith("/lessons/content-lesson-1");
    if (result.ok) {
      expect(result.review).toEqual([{
        questionId: "q-1",
        explanation: "Because one is correct.",
        correctOptions: ["Good"],
      }]);
    }
  });

  it("rejects invalid single-choice cardinality before updating", async () => {
    const result = await submitQuizAttempt({
      attemptId: "attempt-1",
      responses: { "q-1": ["q1-good", "q1-bad"] },
    });

    expect(result).toEqual({
      ok: false,
      error: "Choose one answer for each single-choice question.",
    });
    expect(updatedAttempt).toBeNull();
  });

  it("rejects completed and concurrently submitted attempts atomically", async () => {
    attemptToSubmit = { ...attemptToSubmit, completed_at: "2026-01-01T00:00:00Z" };
    await expect(
      submitQuizAttempt({
        attemptId: "attempt-1",
        responses: { "q-1": ["q1-good"] },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "This attempt has already been submitted.",
    });

    attemptToSubmit = { ...attemptToSubmit, completed_at: null };
    updateData = null;
    await expect(
      submitQuizAttempt({
        attemptId: "attempt-1",
        responses: { "q-1": ["q1-good"] },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "This attempt was already submitted.",
    });
  });

  it("does not disclose correct answers when the quiz policy is never", async () => {
    quizPolicy = "never";

    const result = await submitQuizAttempt({
      attemptId: "attempt-1",
      responses: { "q-1": ["q1-good"] },
    });

    expect(result).toMatchObject({ ok: true, review: null });
  });
});
