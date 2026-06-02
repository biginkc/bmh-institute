"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitSandraCourseCompletedForLesson } from "@/lib/integrations/sandra/course-completed";
import {
  scoreQuizAttempt,
  type ScoringQuestion,
  type ScoringResponses,
} from "@/lib/quizzes/score";
import { computeQuizEligibility } from "@/lib/quizzes/attempts";

export type QuizSubmitResult =
  | {
      ok: true;
      score: number;
      passed: boolean;
      earnedPoints: number;
      totalPoints: number;
      attemptId: string;
    }
  | { ok: false; error: string };

export async function submitQuizAttempt(input: {
  quizId: string;
  lessonId: string;
  responses: ScoringResponses;
}): Promise<QuizSubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: quiz, error: quizErr } = await supabase
    .from("quizzes")
    .select("id, passing_score, max_attempts, retake_cooldown_hours")
    .eq("id", input.quizId)
    .maybeSingle();
  if (quizErr || !quiz) {
    return { ok: false, error: quizErr?.message ?? "Quiz not found." };
  }

  // Defense in depth: re-check eligibility server-side so a stale or
  // manipulated client can't bypass max_attempts / cooldown.
  const { data: priorAttempts } = await supabase
    .from("user_quiz_attempts")
    .select("passed, score, completed_at")
    .eq("user_id", user.id)
    .eq("quiz_id", input.quizId);

  const eligibility = computeQuizEligibility({
    maxAttempts: quiz.max_attempts,
    retakeCooldownHours: (quiz.retake_cooldown_hours) ?? 0,
    attempts: (priorAttempts ?? []).map((a) => ({
      passed: a.passed,
      score: a.score,
      completed_at: a.completed_at,
    })),
    now: new Date(),
  });
  if (eligibility.state === "max_reached") {
    return { ok: false, error: "You've used all of your attempts on this quiz." };
  }
  if (eligibility.state === "cooldown") {
    return {
      ok: false,
      error: `Retake cooldown is in effect. Try again after ${new Date(
        eligibility.nextAvailableAt,
      ).toLocaleString()}.`,
    };
  }
  if (eligibility.state === "passed") {
    return {
      ok: false,
      error: "You've already passed this quiz.",
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Admin client unavailable.";
    return { ok: false, error: message };
  }

  // HARDEN-04 / D-10: is_correct is RLS-revoked from learner sessions, so the
  // scoring fetch uses the service-role client. Eligibility checks above
  // already ran against the learner's session.
  const { data: rawQuestions, error: qErr } = await admin
    .from("questions")
    .select(
      `
      id,
      question_type,
      points,
      sort_order,
      answer_options (
        id,
        is_correct
      )
    `,
    )
    .eq("quiz_id", input.quizId)
    .order("sort_order");
  if (qErr || !rawQuestions) {
    return { ok: false, error: qErr?.message ?? "Questions not found." };
  }

  const scoring: ScoringQuestion[] = rawQuestions.map((q) => ({
    id: q.id,
    type: q.question_type as ScoringQuestion["type"],
    points: (q.points) ?? 1,
    correctOptionIds: toOptionArray(q.answer_options)
      .filter((o) => o.is_correct === true)
      .map((o) => o.id),
  }));

  const result = scoreQuizAttempt(
    scoring,
    input.responses,
    quiz.passing_score,
  );

  const { data: attempt, error: attemptErr } = await supabase
    .from("user_quiz_attempts")
    .insert({
      user_id: user.id,
      quiz_id: input.quizId,
      lesson_id: input.lessonId,
      score: result.score,
      passed: result.passed,
      question_order: scoring.map((q) => q.id),
      answer_orders: {},
      responses: input.responses,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (attemptErr || !attempt) {
    return {
      ok: false,
      error: attemptErr?.message ?? "Could not record your attempt.",
    };
  }

  revalidatePath(`/lessons/${input.lessonId}`);
  revalidatePath(`/dashboard`);

  if (result.passed) {
    await emitSandraCourseCompletedForLesson(supabase, {
      userId: user.id,
      lessonId: input.lessonId,
    });
  }

  return {
    ok: true,
    score: result.score,
    passed: result.passed,
    earnedPoints: result.earnedPoints,
    totalPoints: result.totalPoints,
    attemptId: attempt.id,
  };
}

type RawOption = { id: string; is_correct: boolean };

function toOptionArray(value: unknown): RawOption[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as RawOption[];
  return [value as RawOption];
}
