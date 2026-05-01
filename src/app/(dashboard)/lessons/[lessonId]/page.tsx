import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  ContentBlockRenderer,
  type ContentBlock,
} from "@/components/content-blocks";
import { enrichBlocksWithSignedUrls } from "@/lib/content-blocks/sign-urls";
import { computeQuizEligibility } from "@/lib/quizzes/attempts";
import { MarkCompleteButton } from "./mark-complete-button";
import { QuizRunner, type QuizQuestion } from "./quiz-runner";
import {
  AssignmentRunner,
  type AssignmentDescriptor,
  type PriorSubmission,
} from "./assignment-runner";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select(
      `
      id,
      title,
      description,
      lesson_type,
      quiz_id,
      assignment_id,
      module_id,
      modules (
        id,
        title,
        course_id,
        courses (
          id,
          title
        )
      )
    `,
    )
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: unlocked }, { data: completion }] = await Promise.all([
    supabase.rpc("fn_lesson_is_unlocked", {
      p_user_id: user?.id ?? "",
      p_lesson_id: lessonId,
    }),
    supabase
      .from("user_lesson_completions")
      .select("lesson_id")
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);

  const alreadyComplete = Boolean(completion);
  const moduleJoin = firstRow(lesson.modules);
  const courseJoin = firstRow(moduleJoin?.courses);
  const courseId = courseJoin?.id as string | undefined;
  const courseTitle = courseJoin?.title as string | undefined;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        {courseId ? (
          <Link
            href={`/courses/${courseId}`}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            ← {courseTitle ?? "Back to course"}
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            ← Back to dashboard
          </Link>
        )}
      </div>

      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <LessonTypePill type={lesson.lesson_type as string} />
        </div>
        <h1 className="text-2xl font-semibold">{lesson.title}</h1>
        {lesson.description ? (
          <p className="text-muted-foreground mt-1 text-sm">
            {lesson.description}
          </p>
        ) : null}
      </div>

      {!unlocked ? (
        <Card>
          <CardHeader>
            <CardTitle>Locked</CardTitle>
            <CardDescription>
              You haven&apos;t completed the prerequisite yet. Go back and finish earlier lessons first.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : lesson.lesson_type === "content" ? (
        <ContentLessonBody
          lessonId={lessonId}
          alreadyComplete={alreadyComplete}
        />
      ) : lesson.lesson_type === "quiz" ? (
        <QuizLessonBody
          quizId={lesson.quiz_id as string | null}
          lessonId={lessonId}
          backHref={courseId ? `/courses/${courseId}` : "/dashboard"}
        />
      ) : (
        <AssignmentLessonBody
          assignmentId={lesson.assignment_id as string | null}
          lessonId={lessonId}
        />
      )}
    </main>
  );
}

async function ContentLessonBody({
  lessonId,
  alreadyComplete,
}: {
  lessonId: string;
  alreadyComplete: boolean;
}) {
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from("content_blocks")
    .select("id, block_type, content, sort_order, is_required_for_completion")
    .eq("lesson_id", lessonId)
    .order("sort_order");

  const rows = (blocks ?? []) as ContentBlock[];
  const enriched = await enrichBlocksWithSignedUrls(rows);

  if (enriched.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Empty lesson</CardTitle>
          <CardDescription>No content has been added yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {enriched.map((block) => (
          <ContentBlockRenderer key={block.id} block={block} />
        ))}
      </div>
      <div className="border-border mt-8 flex items-center justify-end border-t pt-6">
        <MarkCompleteButton
          lessonId={lessonId}
          alreadyComplete={alreadyComplete}
        />
      </div>
    </>
  );
}

async function QuizLessonBody({
  quizId,
  lessonId,
  backHref,
}: {
  quizId: string | null;
  lessonId: string;
  backHref: string;
}) {
  if (!quizId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quiz unavailable</CardTitle>
          <CardDescription>No quiz is attached to this lesson.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const supabase = await createClient();
  const [{ data: quiz }, questionsResult, { data: attempts }] =
    await Promise.all([
      supabase
        .from("quizzes")
        .select("id, passing_score, max_attempts, retake_cooldown_hours")
        .eq("id", quizId)
        .maybeSingle(),
      // HARDEN-04: read from answer_options_public view; is_correct is not
      // exposed to learner sessions. Two queries + in-process join avoids the
      // PostgREST embedded-FK cache surprise on views (see PATTERNS.md Path 1).
      supabase
        .from("questions")
        .select("id, question_text, question_type, sort_order")
        .eq("quiz_id", quizId)
        .order("sort_order"),
      supabase
        .from("user_quiz_attempts")
        .select("passed, score, completed_at")
        .eq("quiz_id", quizId)
        .order("completed_at", { ascending: false }),
    ]);

  const rawQuestions = questionsResult.data;
  const questionIds = (rawQuestions ?? []).map((q) => q.id as string);
  const { data: rawOptions } = questionIds.length
    ? await supabase
        .from("answer_options_public")
        .select("id, question_id, option_text, sort_order")
        .in("question_id", questionIds)
        .order("sort_order")
    : {
        data: [] as Array<{
          id: string;
          question_id: string;
          option_text: string;
          sort_order: number;
        }>,
      };

  const optionsByQuestion = new Map<
    string,
    Array<{ id: string; option_text: string; sort_order: number | null }>
  >();
  for (const opt of rawOptions ?? []) {
    const arr = optionsByQuestion.get(opt.question_id as string) ?? [];
    arr.push({
      id: opt.id as string,
      option_text: opt.option_text as string,
      sort_order: opt.sort_order as number | null,
    });
    optionsByQuestion.set(opt.question_id as string, arr);
  }

  if (!quiz) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quiz unavailable</CardTitle>
          <CardDescription>
            The quiz for this lesson couldn&apos;t be loaded.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const eligibility = computeQuizEligibility({
    maxAttempts: quiz.max_attempts as number | null,
    retakeCooldownHours: (quiz.retake_cooldown_hours as number) ?? 0,
    attempts: (attempts ?? []).map((a) => ({
      passed: a.passed as boolean | null,
      score: a.score as number | null,
      completed_at: a.completed_at as string | null,
    })),
    now: new Date(),
  });

  if (eligibility.state !== "open") {
    return (
      <QuizGateCard
        state={eligibility.state}
        bestScore={eligibility.bestScore}
        attemptsUsed={eligibility.attemptsUsed}
        maxAttempts={quiz.max_attempts as number | null}
        nextAvailableAt={
          eligibility.state === "cooldown"
            ? eligibility.nextAvailableAt
            : null
        }
        backHref={backHref}
      />
    );
  }

  const questions: QuizQuestion[] = (rawQuestions ?? []).map((q) => ({
    id: q.id as string,
    question_text: q.question_text as string,
    question_type: q.question_type as QuizQuestion["question_type"],
    options: (optionsByQuestion.get(q.id as string) ?? [])
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((o) => ({ id: o.id, option_text: o.option_text })),
  }));

  return (
    <QuizRunner
      quizId={quizId}
      lessonId={lessonId}
      passingScore={quiz.passing_score as number}
      questions={questions}
      backHref={backHref}
      attemptsUsed={eligibility.attemptsUsed}
      attemptsLeft={eligibility.attemptsLeft}
    />
  );
}

function QuizGateCard({
  state,
  bestScore,
  attemptsUsed,
  maxAttempts,
  nextAvailableAt,
  backHref,
}: {
  state: "passed" | "max_reached" | "cooldown";
  bestScore: number | null;
  attemptsUsed: number;
  maxAttempts: number | null;
  nextAvailableAt: string | null;
  backHref: string;
}) {
  if (state === "passed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Passed</CardTitle>
          <CardDescription>
            You already passed this quiz with a score of {bestScore ?? 0}%.
            You don&apos;t need to retake it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={backHref}
            className="text-sm underline-offset-2 hover:underline"
          >
            Back to course →
          </Link>
        </CardContent>
      </Card>
    );
  }
  if (state === "max_reached") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No attempts left</CardTitle>
          <CardDescription>
            You&apos;ve used all {maxAttempts ?? attemptsUsed} attempts. Ask an
            admin to reset if this blocks your progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Best score so far: {bestScore ?? 0}%.
        </CardContent>
      </Card>
    );
  }
  const when = nextAvailableAt ? new Date(nextAvailableAt) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Retake cooldown in effect</CardTitle>
        <CardDescription>
          Your next attempt opens{" "}
          {when ? when.toLocaleString() : "soon"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Attempts used: {attemptsUsed}
        {maxAttempts !== null ? ` / ${maxAttempts}` : ""}. Best score:{" "}
        {bestScore ?? 0}%.
      </CardContent>
    </Card>
  );
}

async function AssignmentLessonBody({
  assignmentId,
  lessonId,
}: {
  assignmentId: string | null;
  lessonId: string;
}) {
  if (!assignmentId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assignment unavailable</CardTitle>
          <CardDescription>
            No assignment is attached to this lesson.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const supabase = await createClient();
  const [{ data: assignment }, { data: subs }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, instructions, submission_type, requires_review")
      .eq("id", assignmentId)
      .maybeSingle(),
    supabase
      .from("assignment_submissions")
      .select("id, status, submitted_at, reviewer_notes")
      .eq("lesson_id", lessonId)
      .order("submitted_at", { ascending: false }),
  ]);

  if (!assignment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assignment unavailable</CardTitle>
          <CardDescription>The assignment couldn&apos;t be loaded.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <AssignmentRunner
      lessonId={lessonId}
      assignment={assignment as AssignmentDescriptor}
      priorSubmissions={(subs ?? []) as PriorSubmission[]}
    />
  );
}

function LessonTypePill({ type }: { type: string }) {
  if (type === "quiz") return <Badge variant="outline">Quiz</Badge>;
  if (type === "assignment") return <Badge variant="outline">Assignment</Badge>;
  return <Badge variant="secondary">Lesson</Badge>;
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
