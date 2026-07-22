"use server";

import { emitSandraCourseCompletedForLesson } from "@/lib/integrations/sandra/course-completed";
import {
  buildAttemptSelection,
  restoreAttemptQuestions,
  type AttemptQuestion,
} from "@/lib/quizzes/attempt-selection";
import { computeQuizEligibility } from "@/lib/quizzes/attempts";
import {
  scoreQuizAttempt,
  type ScoringQuestion,
  type ScoringResponses,
} from "@/lib/quizzes/score";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type QuestionReveal =
  | {
      questionId: string;
      isCorrect: false;
    }
  | {
      questionId: string;
      isCorrect: true;
      explanation: string | null;
    };

export type QuizAnswerResult =
  | { ok: true; reveal: QuestionReveal }
  | { ok: false; error: string };

export type QuizStartResult =
  | {
      ok: true;
      attemptId: string;
      questions: AttemptQuestion[];
      resumed: boolean;
      responses: ScoringResponses;
      reveals: QuestionReveal[];
    }
  | { ok: false; error: string };

export type QuizSubmitResult =
  | {
      ok: true;
      score: number;
      passed: boolean;
      earnedPoints: number;
      totalPoints: number;
      attemptId: string;
      review: Array<{
        questionId: string;
        questionNumber: number;
        explanation: string;
      }> | null;
    }
  | { ok: false; error: string };

export async function startQuizAttempt(input: {
  quizId: string;
  lessonId: string;
}): Promise<QuizStartResult> {
  const auth = await authenticatedQuizContext(input);
  if (!auth.ok) return auth;

  const { learner, userId, quiz } = auth;
  const { data: existing, error: existingError } =
    await loadIncompleteAttempt(learner, userId, input.quizId);
  if (existingError) return { ok: false, error: existingError.message };

  const admin = adminClientResult();
  if (!admin.ok) return admin;
  const questionsResult = await loadAttemptQuestions(admin.client, input.quizId);
  if (!questionsResult.ok) return questionsResult;

  if (existing) {
    return resumeAttempt(existing, questionsResult.questions);
  }

  const selection = buildAttemptSelection({
    questions: questionsResult.questions,
    questionsPerAttempt: quiz.questions_per_attempt,
    randomizeQuestions: quiz.randomize_questions,
    randomizeAnswers: quiz.randomize_answers,
  });
  if (selection.questions.length === 0) {
    return { ok: false, error: "This quiz does not have any questions yet." };
  }

  const { data: attempt, error: attemptError } = await admin.client
    .from("user_quiz_attempts")
    .insert({
      user_id: userId,
      quiz_id: input.quizId,
      lesson_id: input.lessonId,
      question_order: selection.questionOrder,
      answer_orders: selection.answerOrders,
      responses: {},
    })
    .select("id")
    .single();
  if (attemptError || !attempt) {
    if (attemptError?.code === "23505") {
      const { data: winner } = await loadIncompleteAttempt(
        learner,
        userId,
        input.quizId,
      );
      if (winner) {
        return resumeAttempt(winner, questionsResult.questions);
      }
    }
    return {
      ok: false,
      error: attemptError?.message ?? "Could not start your attempt.",
    };
  }

  return {
    ok: true,
    attemptId: attempt.id,
    questions: selection.questions,
    resumed: false,
    responses: {},
    reveals: [],
  };
}

export async function answerQuizQuestion(input: {
  attemptId: string;
  questionId: string;
  selected: string[];
}): Promise<QuizAnswerResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: attempt, error: attemptError } = await learner
    .from("user_quiz_attempts")
    .select(
      "id, user_id, quiz_id, lesson_id, question_order, answer_orders, responses, answer_results, completed_at",
    )
    .eq("id", input.attemptId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (attemptError || !attempt) {
    return { ok: false, error: attemptError?.message ?? "Attempt not found." };
  }
  const access = await authorizedQuizContext(
    { quizId: attempt.quiz_id, lessonId: attempt.lesson_id },
    learner,
    user.id,
  );
  if (!access.ok) return access;
  if (attempt.completed_at) {
    return { ok: false, error: "This attempt has already been submitted." };
  }

  const questionOrder = stringArray(attempt.question_order);
  if (!questionOrder.includes(input.questionId)) {
    return {
      ok: false,
      error: "The response contains a question outside this attempt.",
    };
  }

  const admin = adminClientResult();
  if (!admin.ok) return admin;
  const questionsResult = await loadPrivateQuestions(admin.client, [input.questionId]);
  if (!questionsResult.ok) return questionsResult;
  const question = questionsResult.questions[0];
  if (!question) {
    return { ok: false, error: "This attempt contains unavailable questions." };
  }
  const scoringQuestion = toScoringQuestion(question);
  const responses = { [input.questionId]: input.selected };
  const cardinalityError = validateResponseCardinality(
    responses,
    [scoringQuestion],
  );
  if (cardinalityError) return { ok: false, error: cardinalityError };

  const allowed = new Set(
    stringArrayRecord(attempt.answer_orders)[input.questionId] ?? [],
  );
  if (input.selected.some((optionId) => !allowed.has(optionId))) {
    return {
      ok: false,
      error: "The response contains an answer outside this attempt.",
    };
  }

  const { data: recorded, error: recordError } = await learner.rpc(
    "fn_record_quiz_answer",
    {
      p_attempt_id: input.attemptId,
      p_question_id: input.questionId,
      p_selected: input.selected,
    },
  );
  if (recordError || !recorded?.[0]) {
    return {
      ok: false,
      error: recordError?.message ?? "Could not check that answer.",
    };
  }

  const persisted = stringArrayRecord(recorded[0].responses)[input.questionId];
  if (!persisted?.length) {
    return { ok: false, error: "Could not check that answer." };
  }
  return {
    ok: true,
    reveal: revealFromAnswerResult(
      input.questionId,
      answerResultRecord(recorded[0].answer_results)[input.questionId],
    ),
  };
}

export async function finalizeQuizAttempt(input: {
  attemptId: string;
}): Promise<QuizSubmitResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: attempt, error: attemptError } = await learner
    .from("user_quiz_attempts")
    .select(
      "id, user_id, quiz_id, lesson_id, question_order, answer_orders, responses, answer_results, score, passed, completed_at",
    )
    .eq("id", input.attemptId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (attemptError || !attempt) {
    return { ok: false, error: attemptError?.message ?? "Attempt not found." };
  }

  const access = await authorizedQuizContext(
    { quizId: attempt.quiz_id, lessonId: attempt.lesson_id },
    learner,
    user.id,
  );
  if (!access.ok) return access;

  if (attempt.completed_at) {
    return completedAttemptResult(
      attempt,
      access.quiz.show_correct_answers_after,
    );
  }

  const eligibility = await quizEligibilityContext(access);
  if (!eligibility.ok) return eligibility;

  const questionOrder = stringArray(attempt.question_order);
  const answerOrders = stringArrayRecord(attempt.answer_orders);
  const responses = stringArrayRecord(attempt.responses);
  const responseError = validateResponses(responses, questionOrder, answerOrders);
  if (responseError) return { ok: false, error: responseError };

  const admin = adminClientResult();
  if (!admin.ok) return admin;
  const questionsResult = await loadPrivateQuestions(admin.client, questionOrder);
  if (!questionsResult.ok) return questionsResult;
  const byId = new Map(
    questionsResult.questions.map((question) => [question.id, question]),
  );
  const scoring = questionOrder.flatMap((questionId) => {
    const question = byId.get(questionId);
    return question ? [toScoringQuestion(question)] : [];
  });
  if (scoring.length !== questionOrder.length) {
    return { ok: false, error: "This attempt contains unavailable questions." };
  }
  const cardinalityError = validateResponseCardinality(responses, scoring);
  if (cardinalityError) return { ok: false, error: cardinalityError };

  const result = scoreQuizAttempt(scoring, responses, access.quiz.passing_score);
  const completedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin.client
    .from("user_quiz_attempts")
    .update({
      score: result.score,
      passed: result.passed,
      completed_at: completedAt,
    })
    .eq("id", attempt.id)
    .eq("user_id", user.id)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated) {
    const { data: landed, error: landedError } = await learner
      .from("user_quiz_attempts")
      .select(
        "id, user_id, quiz_id, lesson_id, question_order, answer_orders, responses, answer_results, score, passed, completed_at",
      )
      .eq("id", attempt.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (landedError || !landed?.completed_at) {
      return {
        ok: false,
        error: landedError?.message ?? "This attempt was already submitted.",
      };
    }
    return completedAttemptResult(
      landed,
      access.quiz.show_correct_answers_after,
    );
  }

  if (result.passed) {
    await emitSandraCourseCompletedForLesson(learner, {
      userId: user.id,
      lessonId: attempt.lesson_id,
    });
  }

  return buildSubmitResult({
    attemptId: attempt.id,
    result,
    questionOrder,
    answerResults: answerResultRecord(attempt.answer_results),
    revealPolicy: access.quiz.show_correct_answers_after,
  });
}

async function resumeAttempt(
  attempt: {
    id: string;
    question_order: unknown;
    answer_orders: unknown;
    responses: unknown;
    answer_results: unknown;
  },
  publicQuestions: AttemptQuestion[],
): Promise<QuizStartResult> {
  const questionOrder = stringArray(attempt.question_order);
  const answerOrders = stringArrayRecord(attempt.answer_orders);
  const responses = stringArrayRecord(attempt.responses);
  const answerResults = answerResultRecord(attempt.answer_results);
  const answeredIds = questionOrder.filter((id) => responses[id]?.length);
  const reveals = answeredIds.map((id) =>
    revealFromAnswerResult(id, answerResults[id]),
  );
  const restoredQuestions = restoreAttemptQuestions({
    questions: publicQuestions,
    questionOrder,
    answerOrders,
  });
  if (
    questionOrder.length === 0 ||
    new Set(questionOrder).size !== questionOrder.length ||
    questionOrder.some((questionId) => {
      const persistedOrder = answerOrders[questionId] ?? [];
      return (
        persistedOrder.length === 0 ||
        new Set(persistedOrder).size !== persistedOrder.length
      );
    }) ||
    restoredQuestions.length !== questionOrder.length ||
    restoredQuestions.some(
      (question) => question.options.length !== (answerOrders[question.id]?.length ?? 0),
    )
  ) {
    return { ok: false, error: "This attempt contains unavailable questions." };
  }
  return {
    ok: true,
    attemptId: attempt.id,
    questions: restoredQuestions,
    resumed: true,
    responses,
    reveals,
  };
}

async function completedAttemptResult(attempt: {
  id: string;
  quiz_id: string;
  question_order: unknown;
  responses: unknown;
  answer_results: unknown;
  score: number | null;
  passed: boolean | null;
}, revealPolicy: string): Promise<QuizSubmitResult> {
  if (attempt.score === null || attempt.passed === null) {
    return { ok: false, error: "This attempt has no stored result." };
  }
  const admin = adminClientResult();
  if (!admin.ok) return admin;
  const questionOrder = stringArray(attempt.question_order);
  const questionsResult = await loadPrivateQuestions(admin.client, questionOrder);
  if (!questionsResult.ok) return questionsResult;
  const byId = new Map(
    questionsResult.questions.map((question) => [question.id, question]),
  );
  const scoring = questionOrder.flatMap((id) => {
    const question = byId.get(id);
    return question ? [toScoringQuestion(question)] : [];
  });
  if (scoring.length !== questionOrder.length) {
    return { ok: false, error: "This attempt contains unavailable questions." };
  }
  const score = scoreQuizAttempt(scoring, stringArrayRecord(attempt.responses), 0);
  return buildSubmitResult({
    attemptId: attempt.id,
    result: {
      ...score,
      score: attempt.score,
      passed: attempt.passed,
    },
    questionOrder,
    answerResults: answerResultRecord(attempt.answer_results),
    revealPolicy,
  });
}

function buildSubmitResult({
  attemptId,
  result,
  questionOrder,
  answerResults,
  revealPolicy,
}: {
  attemptId: string;
  result: ReturnType<typeof scoreQuizAttempt>;
  questionOrder: string[];
  answerResults: AnswerResultRecord;
  revealPolicy: string;
}): Extract<QuizSubmitResult, { ok: true }> {
  const review = shouldRevealAnswers(revealPolicy, result.passed)
    ? questionOrder.flatMap((questionId, index) => {
        const answerResult = answerResults[questionId];
        const explanation = answerResult?.isCorrect
          ? answerResult.explanation?.trim()
          : "";
        if (!explanation) return [];
        return [{
          questionId,
          questionNumber: index + 1,
          explanation,
        }];
      })
    : [];
  return {
    ok: true,
    score: result.score,
    passed: result.passed,
    earnedPoints: result.earnedPoints,
    totalPoints: result.totalPoints,
    attemptId,
    review: review.length ? review : null,
  };
}

async function authenticatedQuizContext(
  input: { quizId: string; lessonId: string },
  existingLearner?: Awaited<ReturnType<typeof createClient>>,
  existingUserId?: string,
) {
  const access = await authorizedQuizContext(
    input,
    existingLearner,
    existingUserId,
  );
  if (!access.ok) return access;
  return quizEligibilityContext(access);
}

async function authorizedQuizContext(
  input: { quizId: string; lessonId: string },
  existingLearner?: Awaited<ReturnType<typeof createClient>>,
  existingUserId?: string,
) {
  const learner = existingLearner ?? await createClient();
  let userId = existingUserId;
  if (!userId) {
    const {
      data: { user },
    } = await learner.auth.getUser();
    if (!user) return { ok: false as const, error: "You must be signed in." };
    userId = user.id;
  }

  const [{ data: lesson }, { data: unlocked }, { data: quiz, error: quizError }] =
    await Promise.all([
      learner
        .from("lessons")
        .select("quiz_id")
        .eq("id", input.lessonId)
        .maybeSingle(),
      learner.rpc("fn_lesson_is_unlocked", {
        p_user_id: userId,
        p_lesson_id: input.lessonId,
      }),
      learner
        .from("quizzes")
        .select(
          "id, passing_score, max_attempts, retake_cooldown_hours, questions_per_attempt, randomize_questions, randomize_answers, show_correct_answers_after",
        )
        .eq("id", input.quizId)
        .maybeSingle(),
    ]);
  if (lesson?.quiz_id !== input.quizId) {
    return { ok: false as const, error: "This quiz does not belong to the lesson." };
  }
  if (unlocked !== true) {
    return { ok: false as const, error: "Complete the prerequisite lessons first." };
  }
  if (quizError || !quiz) {
    return { ok: false as const, error: quizError?.message ?? "Quiz not found." };
  }

  return { ok: true as const, learner, userId, quiz };
}

async function quizEligibilityContext(access: Extract<
  Awaited<ReturnType<typeof authorizedQuizContext>>,
  { ok: true }
>) {
  const { learner, userId, quiz } = access;
  const { data: priorAttempts, error: priorAttemptsError } = await learner
    .from("user_quiz_attempts")
    .select("passed, score, completed_at")
    .eq("user_id", userId)
    .eq("quiz_id", quiz.id);
  if (priorAttemptsError) {
    return {
      ok: false as const,
      error: "Your quiz eligibility could not be verified. Try again.",
    };
  }
  const eligibility = computeQuizEligibility({
    maxAttempts: quiz.max_attempts,
    retakeCooldownHours: quiz.retake_cooldown_hours ?? 0,
    attempts: priorAttempts ?? [],
    now: new Date(),
  });
  if (eligibility.state === "max_reached") {
    return { ok: false as const, error: "You've used all of your attempts on this quiz." };
  }
  if (eligibility.state === "cooldown") {
    return {
      ok: false as const,
      error: `Retake cooldown is in effect. Try again after ${new Date(
        eligibility.nextAvailableAt,
      ).toLocaleString()}.`,
    };
  }
  if (eligibility.state === "passed") {
    return { ok: false as const, error: "You've already passed this quiz." };
  }

  return access;
}

function adminClientResult():
  | { ok: true; client: ReturnType<typeof createAdminClient> }
  | { ok: false; error: string } {
  try {
    return { ok: true, client: createAdminClient() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Admin client unavailable.",
    };
  }
}

async function loadAttemptQuestions(
  admin: ReturnType<typeof createAdminClient>,
  quizId: string,
): Promise<
  | { ok: true; questions: AttemptQuestion[] }
  | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from("questions")
    .select(
      `
      id,
      question_text,
      question_type,
      sort_order,
      answer_options (
        id,
        option_text,
        sort_order
      )
    `,
    )
    .eq("quiz_id", quizId)
    .order("sort_order");
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Questions not found." };
  }
  return {
    ok: true,
    questions: data.map((question) => ({
      id: question.id,
      question_text: question.question_text,
      question_type: question.question_type as AttemptQuestion["question_type"],
      sort_order: question.sort_order,
      options: toPublicOptionArray(question.answer_options),
    })),
  };
}

async function loadPrivateQuestions(
  admin: ReturnType<typeof createAdminClient>,
  questionIds: string[],
): Promise<
  | { ok: true; questions: PrivateQuestion[] }
  | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from("questions")
    .select(
      `
      id,
      question_type,
      points,
      explanation,
      answer_options (
        id,
        is_correct
      )
    `,
    )
    .in("id", questionIds);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Questions not found." };
  }
  return { ok: true, questions: data as PrivateQuestion[] };
}

async function loadIncompleteAttempt(
  learner: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  quizId: string,
) {
  return learner
    .from("user_quiz_attempts")
    .select("id, question_order, answer_orders, responses, answer_results")
    .eq("user_id", userId)
    .eq("quiz_id", quizId)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

function validateResponses(
  responses: ScoringResponses,
  questionOrder: string[],
  answerOrders: Record<string, string[]>,
): string | null {
  if (questionOrder.length === 0) return "This attempt has no questions.";
  if (Object.keys(responses).some((id) => !questionOrder.includes(id))) {
    return "The response contains a question outside this attempt.";
  }
  for (const questionId of questionOrder) {
    const selected = responses[questionId] ?? [];
    if (selected.length === 0) return "Answer every question before submitting.";
    const allowed = new Set(answerOrders[questionId] ?? []);
    if (selected.some((optionId) => !allowed.has(optionId))) {
      return "The response contains an answer outside this attempt.";
    }
  }
  return null;
}

function validateResponseCardinality(
  responses: ScoringResponses,
  questions: ScoringQuestion[],
): string | null {
  for (const question of questions) {
    const selected = responses[question.id] ?? [];
    if (question.type !== "multi_select" && selected.length !== 1) {
      return "Choose one answer for each single-choice question.";
    }
    if (new Set(selected).size !== selected.length) {
      return "A response contains the same answer more than once.";
    }
  }
  return null;
}

function shouldRevealAnswers(policy: string, passed: boolean) {
  return policy === "always" || (policy === "after_pass" && passed);
}

function revealFromAnswerResult(
  questionId: string,
  result: AnswerResultSnapshot | undefined,
): QuestionReveal {
  if (!result?.isCorrect) return { questionId, isCorrect: false };
  return {
    questionId,
    isCorrect: true,
    explanation: result.explanation,
  };
}

function answerResultRecord(value: unknown): AnswerResultRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const parsed: AnswerResultRecord = {};
  for (const [questionId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const result = raw as { is_correct?: unknown; explanation?: unknown };
    parsed[questionId] = result.is_correct === true
      ? {
        isCorrect: true,
        explanation: typeof result.explanation === "string"
          ? result.explanation
          : null,
      }
      : { isCorrect: false };
  }
  return parsed;
}

function toScoringQuestion(question: PrivateQuestion): ScoringQuestion {
  return {
    id: question.id,
    type: question.question_type as ScoringQuestion["type"],
    points: question.points ?? 1,
    correctOptionIds: toOptionArray(question.answer_options)
      .filter((option) => option.is_correct === true)
      .map((option) => option.id),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringArrayRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entries]) => [key, stringArray(entries)]),
  );
}

type RawOption = { id: string; is_correct: boolean };
type PrivateQuestion = {
  id: string;
  question_type: string;
  points: number | null;
  explanation: string | null;
  answer_options: unknown;
};
type AnswerResultSnapshot =
  | { isCorrect: false }
  | { isCorrect: true; explanation: string | null };
type AnswerResultRecord = Record<string, AnswerResultSnapshot>;

function toOptionArray(value: unknown): RawOption[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as RawOption[];
  return [value as RawOption];
}

function toPublicOptionArray(value: unknown) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.map((option) => {
    const row = option as {
      id: string;
      option_text: string;
      sort_order: number | null;
    };
    return {
      id: row.id,
      option_text: row.option_text,
      sort_order: row.sort_order,
    };
  });
}
