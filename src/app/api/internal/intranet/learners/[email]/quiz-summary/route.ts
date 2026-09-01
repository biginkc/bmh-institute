import { createHash, timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" };
const PASSING_SCORE = 85;
const MIN_SERVICE_TOKEN_BYTES = 32;
const CANONICAL_COURSE_IMPORT_ID = "bmh-employee-training-v1";
const SERVICE_TOKEN_PLACEHOLDER =
  "replace_with_long_random_intranet_service_token";

type CourseRelation = {
  content_import_id: string | null;
  id: string;
  is_published: boolean;
};

type ModuleRelation = {
  courses: CourseRelation | CourseRelation[] | null;
  sort_order: number;
};

type QuizLessonRow = {
  id: string;
  is_required_for_completion: boolean;
  modules: ModuleRelation | ModuleRelation[] | null;
  quiz_id: string | null;
  sort_order: number;
};

type OrderedQuiz = {
  courseId: string;
  lessonOrder: number;
  lessonId: string;
  moduleOrder: number;
  quizId: string;
};

type Profile = { email: string; id: string };

type ProfileResult =
  | { state: "found"; profile: Profile }
  | { state: "missing" }
  | { state: "unavailable" };

type AttemptSummary = {
  attempts: number;
  bestFinalQuizScore: number | null;
  lastAttemptAt: string | null;
};

type AdminClient = ReturnType<typeof createAdminClient>;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  if (!hasValidAuthorization(request)) {
    return json({ error: "unauthorized" }, 401);
  }

  const { email: rawEmail } = await params;
  const requestedEmail = rawEmail.trim().toLowerCase();
  if (!requestedEmail || requestedEmail.length > 320) {
    return json({ error: "learner not found" }, 404);
  }

  try {
    const supabase = createAdminClient();
    const profileResult = await loadProfile(supabase, requestedEmail);
    if (profileResult.state === "missing") {
      return json({ error: "learner not found" }, 404);
    }
    if (profileResult.state === "unavailable") {
      return json({ error: "quiz summary unavailable" }, 503);
    }
    const { profile } = profileResult;
    const finalQuiz = await loadFinalQuiz(supabase);
    if (!finalQuiz) {
      return json({ error: "quiz summary unavailable" }, 503);
    }
    const summary = await loadAttemptSummary(supabase, profile.id, finalQuiz);
    if (!summary) {
      return json({ error: "quiz summary unavailable" }, 503);
    }

    return json({
      email: profile.email,
      bestFinalQuizScore: summary.bestFinalQuizScore,
      passed85:
        summary.bestFinalQuizScore !== null &&
        summary.bestFinalQuizScore >= PASSING_SCORE,
      attempts: summary.attempts,
      lastAttemptAt: summary.lastAttemptAt,
    });
  } catch {
    return json({ error: "quiz summary unavailable" }, 503);
  }
}

async function loadProfile(
  supabase: AdminClient,
  requestedEmail: string,
): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", escapeIlikePattern(requestedEmail))
    .limit(2);
  const profiles = data ?? [];

  if (error || profiles.length > 1) return { state: "unavailable" };
  if (profiles.length === 0) return { state: "missing" };
  return { state: "found", profile: profiles[0] };
}

async function loadFinalQuiz(
  supabase: AdminClient,
): Promise<OrderedQuiz | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id, quiz_id, sort_order, is_required_for_completion, modules!inner(sort_order, courses!inner(id, content_import_id, is_published))",
    )
    .eq("lesson_type", "quiz")
    .not("quiz_id", "is", null)
    .eq("is_required_for_completion", true)
    .eq("modules.courses.is_published", true)
    .eq("modules.courses.content_import_id", CANONICAL_COURSE_IMPORT_ID);

  return error ? null : findFinalPublishedQuiz((data ?? []) as QuizLessonRow[]);
}

async function loadAttemptSummary(
  supabase: AdminClient,
  userId: string,
  finalQuiz: OrderedQuiz,
): Promise<AttemptSummary | null> {
  const { count, error: countError } = await supabase
    .from("user_quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("quiz_id", finalQuiz.quizId)
    .eq("lesson_id", finalQuiz.lessonId)
    .not("completed_at", "is", null)
    .limit(1);

  const { data: bestAttempt, error: bestError } = await supabase
    .from("user_quiz_attempts")
    .select("score")
    .eq("user_id", userId)
    .eq("quiz_id", finalQuiz.quizId)
    .eq("lesson_id", finalQuiz.lessonId)
    .not("completed_at", "is", null)
    .not("score", "is", null)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastAttempt, error: lastError } = await supabase
    .from("user_quiz_attempts")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("quiz_id", finalQuiz.quizId)
    .eq("lesson_id", finalQuiz.lessonId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (hasQueryError(countError, bestError, lastError) || count === null) {
    return null;
  }

  const lastAttemptAt = lastAttempt?.completed_at ?? null;
  if (!hasConsistentAttemptSummary(count, bestAttempt, lastAttemptAt)) {
    return null;
  }

  return {
    attempts: count,
    bestFinalQuizScore: bestAttempt?.score ?? null,
    lastAttemptAt,
  };
}

function hasQueryError(...errors: unknown[]): boolean {
  return errors.some(Boolean);
}

function hasConsistentAttemptSummary(
  count: number,
  bestAttempt: { score: number | null } | null,
  lastAttemptAt: string | null,
): boolean {
  if (count === 0) return !bestAttempt && !lastAttemptAt;
  return Boolean(lastAttemptAt);
}

function hasValidAuthorization(request: Request): boolean {
  const secret = process.env.INTRANET_SERVICE_TOKEN;
  const authorization = request.headers.get("authorization");
  if (
    !secret ||
    !authorization ||
    secret !== secret.trim() ||
    Buffer.byteLength(secret, "utf8") < MIN_SERVICE_TOKEN_BYTES ||
    secret === SERVICE_TOKEN_PLACEHOLDER
  ) {
    return false;
  }

  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, received);
}

function findFinalPublishedQuiz(rows: QuizLessonRow[]): OrderedQuiz | null {
  const candidates = rows.flatMap<OrderedQuiz>((row) => {
    const moduleRelation = firstRelation(row.modules);
    const course = firstRelation(moduleRelation?.courses ?? null);
    if (
      !row.quiz_id ||
      !row.is_required_for_completion ||
      !moduleRelation ||
      !course?.is_published ||
      course.content_import_id !== CANONICAL_COURSE_IMPORT_ID
    ) {
      return [];
    }

    return [
      {
        courseId: course.id,
        lessonId: row.id,
        lessonOrder: row.sort_order,
        moduleOrder: moduleRelation.sort_order,
        quizId: row.quiz_id,
      },
    ];
  });

  if (
    candidates.length === 0 ||
    new Set(candidates.map((candidate) => candidate.courseId)).size !== 1
  ) {
    return null;
  }

  const finalOrder = candidates.reduce(
    (latest, candidate) =>
      compareQuizOrder(candidate, latest) > 0 ? candidate : latest,
    candidates[0],
  );
  const finalCandidates = candidates.filter(
    (candidate) => compareQuizOrder(candidate, finalOrder) === 0,
  );

  return finalCandidates.length === 1 ? finalCandidates[0] : null;
}

function compareQuizOrder(left: OrderedQuiz, right: OrderedQuiz): number {
  return (
    left.moduleOrder - right.moduleOrder ||
    left.lessonOrder - right.lessonOrder
  );
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}
