"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emitSandraCourseCompletedForLesson } from "@/lib/integrations/sandra/course-completed";
import { computeQuizEligibility } from "@/lib/quizzes/attempts";
import {
  buildAttemptSelection,
  restoreAttemptQuestions,
  type AttemptQuestion,
} from "@/lib/quizzes/attempt-selection";
import {
  scoreQuizAttempt,
  type ScoringQuestion,
  type ScoringResponses,
} from "@/lib/quizzes/score";

export type QuizStartResult =
  | {
      ok: true;
      attemptId: string;
      questions: AttemptQuestion[];
      resumed: boolean;
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
        explanation: string | null;
        correctOptions: string[];
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
    return {
      ok: true,
      attemptId: existing.id,
      questions: restoreAttemptQuestions({
        questions: questionsResult.questions,
        questionOrder: stringArray(existing.question_order),
        answerOrders: stringArrayRecord(existing.answer_orders),
      }),
      resumed: true,
    };
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
        return {
          ok: true,
          attemptId: winner.id,
          questions: restoreAttemptQuestions({
            questions: questionsResult.questions,
            questionOrder: stringArray(winner.question_order),
            answerOrders: stringArrayRecord(winner.answer_orders),
          }),
          resumed: true,
        };
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
  };
}

export async function submitQuizAttempt(input: {
  attemptId: string;
  responses: ScoringResponses;
}): Promise<QuizSubmitResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: attempt, error: attemptError } = await learner
    .from("user_quiz_attempts")
    .select(
      "id, user_id, quiz_id, lesson_id, question_order, answer_orders, completed_at",
    )
    .eq("id", input.attemptId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (attemptError || !attempt) {
    return { ok: false, error: attemptError?.message ?? "Attempt not found." };
  }
  if (attempt.completed_at) {
    return { ok: false, error: "This attempt has already been submitted." };
  }

  const auth = await authenticatedQuizContext({
    quizId: attempt.quiz_id,
    lessonId: attempt.lesson_id,
  }, learner, user.id);
  if (!auth.ok) return auth;

  const questionOrder = stringArray(attempt.question_order);
  const answerOrders = stringArrayRecord(attempt.answer_orders);
  const responseError = validateResponses(
    input.responses,
    questionOrder,
    answerOrders,
  );
  if (responseError) return { ok: false, error: responseError };

  const admin = adminClientResult();
  if (!admin.ok) return admin;
  const { data: rawQuestions, error: questionsError } = await admin.client
    .from("questions")
    .select(
      `
      id,
      question_type,
      points,
      explanation,
      answer_options (
        id,
        is_correct,
        option_text
      )
    `,
    )
    .in("id", questionOrder);
  if (questionsError || !rawQuestions) {
    return {
      ok: false,
      error: questionsError?.message ?? "Questions not found.",
    };
  }

  const byId = new Map(rawQuestions.map((question) => [question.id, question]));
  const scoring: ScoringQuestion[] = questionOrder.flatMap((questionId) => {
    const question = byId.get(questionId);
    if (!question) return [];
    return [{
      id: question.id,
      type: question.question_type as ScoringQuestion["type"],
      points: question.points ?? 1,
      correctOptionIds: toOptionArray(question.answer_options)
        .filter((option) => option.is_correct === true)
        .map((option) => option.id),
    }];
  });
  if (scoring.length !== questionOrder.length) {
    return { ok: false, error: "This attempt contains unavailable questions." };
  }
  const cardinalityError = validateResponseCardinality(
    input.responses,
    scoring,
  );
  if (cardinalityError) return { ok: false, error: cardinalityError };

  const result = scoreQuizAttempt(
    scoring,
    input.responses,
    auth.quiz.passing_score,
  );
  const completedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin.client
    .from("user_quiz_attempts")
    .update({
      score: result.score,
      passed: result.passed,
      responses: input.responses,
      completed_at: completedAt,
    })
    .eq("id", attempt.id)
    .eq("user_id", user.id)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    return {
      ok: false,
      error: updateError?.message ?? "This attempt was already submitted.",
    };
  }

  revalidatePath(`/lessons/${attempt.lesson_id}`);
  revalidatePath("/dashboard");
  if (result.passed) {
    await emitSandraCourseCompletedForLesson(learner, {
      userId: user.id,
      lessonId: attempt.lesson_id,
    });
  }

  return {
    ok: true,
    score: result.score,
    passed: result.passed,
    earnedPoints: result.earnedPoints,
    totalPoints: result.totalPoints,
    attemptId: attempt.id,
    review: shouldRevealAnswers(
      auth.quiz.show_correct_answers_after,
      result.passed,
    )
      ? questionOrder.flatMap((questionId) => {
          const question = byId.get(questionId);
          if (!question) return [];
          return [{
            questionId,
            explanation: question.explanation ?? null,
            correctOptions: toOptionArray(question.answer_options)
              .filter((option) => option.is_correct)
              .map((option) => option.option_text),
          }];
        })
      : null,
  };
}

async function authenticatedQuizContext(
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
    return {
      ok: false as const,
      error: quizError?.message ?? "Quiz not found.",
    };
  }

  const { data: priorAttempts, error: priorAttemptsError } = await learner
    .from("user_quiz_attempts")
    .select("passed, score, completed_at")
    .eq("user_id", userId)
    .eq("quiz_id", input.quizId);
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

  return { ok: true as const, learner, userId, quiz };
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

async function loadIncompleteAttempt(
  learner: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  quizId: string,
) {
  return learner
    .from("user_quiz_attempts")
    .select("id, question_order, answer_orders")
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

type RawOption = { id: string; is_correct: boolean; option_text: string };

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
