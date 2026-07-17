import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge as BmhBadge } from "@/components/bmh-ds/badge";
import { Card as BmhCard } from "@/components/bmh-ds/card";
import { createClient } from "@/lib/supabase/server";
import {
  ContentBlockRenderer,
  type ContentBlock,
} from "@/components/content-blocks";
import { enrichBlocksWithSignedUrls } from "@/lib/content-blocks/sign-urls";
import { computeQuizEligibility } from "@/lib/quizzes/attempts";
import { mintRolePlayEmbedToken } from "@/lib/role-plays/embed-token";
import { QuizGateCard } from "./quiz-gate-card";
import { QuizRunner } from "./quiz-runner";
import {
  AssignmentRunner,
  type AssignmentDescriptor,
  type PriorSubmission,
} from "./assignment-runner";
import {
  LessonChapters,
} from "./lesson-chapters";
import {
  buildContentLessonNavigation,
  type ContentLessonNavigation,
  type NavigationLessonRow,
} from "./lesson-navigation";

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
  if (!user) notFound();

  const [{ data: unlocked }, { data: completion }] = await Promise.all([
    supabase.rpc("fn_lesson_is_unlocked", {
      p_user_id: user.id,
      p_lesson_id: lessonId,
    }),
    supabase
      .from("user_lesson_completions")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);

  const alreadyComplete = Boolean(completion);
  const moduleJoin = firstRow(lesson.modules);
  const courseJoin = firstRow(moduleJoin?.courses);
  const courseId = courseJoin?.id;
  const contentNavigationPromise =
    lesson.lesson_type === "content" && courseId
      ? loadContentLessonNavigation({
          supabase,
          courseId,
          lessonId,
          userId: user.id,
        })
      : Promise.resolve(null);

  return (
    <div
      className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10"
      data-bmh-lesson-page
    >
      <div>
        {courseId ? (
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--action)]"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to course
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--action)]"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to dashboard
          </Link>
        )}
      </div>

      <header className="mb-8 mt-5 max-w-4xl">
        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] font-extrabold tracking-[-0.025em] text-[var(--ink-900)]">
          {lesson.title}
        </h1>
        {lesson.description ? (
          <p className="mt-2 max-w-3xl text-base leading-relaxed font-semibold text-[var(--text-muted)]">
            {lesson.description}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <LessonTypePill type={lesson.lesson_type} />
          {moduleJoin?.title ? (
            <BmhBadge tone="neutral" size="sm">
              {moduleJoin.title}
            </BmhBadge>
          ) : null}
          {lesson.lesson_type === "content" ? (
            <LessonPosition navigationPromise={contentNavigationPromise} />
          ) : null}
        </div>
      </header>

      {!unlocked ? (
        <div className="max-w-3xl">
          <BmhCard padding="lg" tint>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink-900)]">
              Locked
            </h2>
            <p className="mt-2 text-sm font-semibold text-[var(--text-muted)]">
              You haven&apos;t completed the prerequisite yet. Go back and finish earlier lessons first.
            </p>
          </BmhCard>
        </div>
      ) : lesson.lesson_type === "content" ? (
        <ContentLessonBody
          lessonId={lessonId}
          userId={user.id}
          alreadyComplete={alreadyComplete}
          navigationPromise={contentNavigationPromise}
        />
      ) : lesson.lesson_type === "quiz" ? (
        <div className="mx-auto max-w-3xl">
          <QuizLessonBody
            quizId={lesson.quiz_id}
            lessonId={lessonId}
            userId={user.id}
            backHref={courseId ? `/courses/${courseId}` : "/dashboard"}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl">
          <AssignmentLessonBody
            assignmentId={lesson.assignment_id}
            lessonId={lessonId}
            userId={user.id}
          />
        </div>
      )}
    </div>
  );
}

async function ContentLessonBody({
  lessonId,
  userId,
  alreadyComplete,
  navigationPromise,
}: {
  lessonId: string;
  userId: string;
  alreadyComplete: boolean;
  navigationPromise: Promise<ContentLessonNavigation | null>;
}) {
  const supabase = await createClient();
  const [{ data: blocks }, navigation] = await Promise.all([
    supabase
      .from("content_blocks")
      .select("id, block_type, content, sort_order, is_required_for_completion")
      .eq("lesson_id", lessonId)
      .order("sort_order"),
    navigationPromise,
  ]);

  const rows = (blocks ?? []) as ContentBlock[];
  const [{ data: completedRows }, enriched] = await Promise.all([
    rows.length > 0
      ? supabase
          .from("user_block_progress")
          .select("block_id")
          .eq("user_id", userId)
          .in("block_id", rows.map((block) => block.id))
      : Promise.resolve({ data: [] }),
    attachRolePlayEmbeds(
      await enrichBlocksWithSignedUrls(rows),
      lessonId,
      supabase,
    ),
  ]);
  const completedBlockIds = new Set(
    (completedRows ?? []).flatMap((row) =>
      typeof row.block_id === "string" ? [row.block_id] : [],
    ),
  );

  if (enriched.length === 0) {
    return (
      <div className="max-w-3xl">
        <BmhCard padding="lg">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink-900)]">
            Empty lesson
          </h2>
          <p className="mt-2 text-sm font-semibold text-[var(--text-muted)]">
            No content has been added yet.
          </p>
        </BmhCard>
      </div>
    );
  }

  return (
    <div
      className={
        navigation
          ? "grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_330px]"
          : "max-w-4xl"
      }
    >
      <div className="min-w-0">
        <div className="flex flex-col gap-5">
          {enriched.map((block) => (
            <ContentBlockRenderer
              key={block.id}
              block={block}
              completed={completedBlockIds.has(block.id)}
            />
          ))}
        </div>

        {navigation ? (
          <nav aria-label="Lesson navigation" className="mt-8 flex flex-wrap gap-3">
            {navigation.previous ? (
              <LessonNavigationLink
                href={`/lessons/${navigation.previous.id}`}
                label="Previous"
                title={navigation.previous.title}
                direction="previous"
              />
            ) : null}
            {navigation.next ? (
              <LessonNavigationLink
                href={`/lessons/${navigation.next.id}`}
                label="Next lesson"
                title={navigation.next.title}
                direction="next"
              />
            ) : null}
          </nav>
        ) : null}

        <div className="mt-8 flex flex-col gap-4 border-t border-[var(--border-hairline)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-[var(--text-muted)]">
            {alreadyComplete
              ? "Nice. This lesson is complete."
              : "Required videos complete after 90% of their content has been watched."}
          </p>
        </div>
      </div>

      {navigation ? (
        <LessonChapters
          chapters={navigation.chapters}
          completedCount={navigation.completedCount}
        />
      ) : null}
    </div>
  );
}

async function LessonPosition({
  navigationPromise,
}: {
  navigationPromise: Promise<ContentLessonNavigation | null>;
}) {
  const navigation = await navigationPromise;
  if (!navigation) return null;

  return (
    <span className="ml-1 text-xs font-extrabold text-[var(--text-muted)]">
      Chapter {navigation.chapterIndex} of {navigation.chapters.length}
    </span>
  );
}

function LessonNavigationLink({
  href,
  label,
  title,
  direction,
}: {
  href: string;
  label: string;
  title: string;
  direction: "previous" | "next";
}) {
  const primary = direction === "next";
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--bmh-radius-md)] border-[2.5px] px-4 font-extrabold transition-colors focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
        primary
          ? "border-transparent bg-[var(--action)] text-white shadow-[var(--bmh-shadow-sm)] hover:bg-[var(--action-hover)]"
          : "border-[var(--ink-900)] bg-[var(--paper)] text-[var(--ink-900)] hover:bg-[var(--ink-050)]"
      }`}
      aria-label={`${label}: ${title}`}
    >
      {direction === "previous" ? (
        <ChevronLeft aria-hidden="true" className="size-4" />
      ) : null}
      {label}
      {direction === "next" ? (
        <ChevronRight aria-hidden="true" className="size-4" />
      ) : null}
    </Link>
  );
}

type NavigationModuleRow = {
  id: string;
  sort_order: number;
  lessons: NavigationLessonRow[] | null;
};

async function loadContentLessonNavigation({
  supabase,
  courseId,
  lessonId,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  courseId: string;
  lessonId: string;
  userId: string;
}): Promise<ContentLessonNavigation | null> {
  const [modulesResult, completionsResult] = await Promise.all([
    supabase
      .from("modules")
      .select(
        "id, sort_order, lessons(id, title, lesson_type, sort_order, prerequisite_lesson_id)",
      )
      .eq("course_id", courseId)
      .order("sort_order"),
    supabase
      .from("user_lesson_completions")
      .select("lesson_id")
      .eq("user_id", userId),
  ]);

  const moduleRows = (modulesResult.data ?? []) as NavigationModuleRow[];
  const lessons = [...moduleRows]
    .sort((left, right) => left.sort_order - right.sort_order)
    .flatMap((module) =>
      [...(module.lessons ?? [])].sort(
        (left, right) => left.sort_order - right.sort_order,
      ),
    );
  const completedLessonIds = new Set(
    (completionsResult.data ?? []).map((completion) =>
      String(completion.lesson_id),
    ),
  );
  const unlockResults = await Promise.all(
    lessons.map(async (lesson) => {
      const { data } = await supabase.rpc("fn_lesson_is_unlocked", {
        p_user_id: userId,
        p_lesson_id: lesson.id,
      });
      return [lesson.id, data === true] as const;
    }),
  );
  const unlockedLessonIds = new Set(
    unlockResults
      .filter(([, unlocked]) => unlocked)
      .map(([unlockedLessonId]) => unlockedLessonId),
  );

  return buildContentLessonNavigation({
    lessons,
    lessonId,
    completedLessonIds,
    unlockedLessonIds,
  });
}

async function attachRolePlayEmbeds(
  blocks: ContentBlock[],
  lessonId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ContentBlock[]> {
  if (!blocks.some((block) => block.block_type === "role_play")) {
    return blocks;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return blocks;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const learnerName =
    typeof profile?.full_name === "string" && profile.full_name.trim()
      ? profile.full_name
      : (user.email ?? "Learner");
  const baseUrl = getRolePlayBaseUrl();

  return blocks.map((block) => {
    if (block.block_type !== "role_play") return block;
    const scenarioId = stringOr(block.content.scenario_id, "");
    if (!scenarioId || !baseUrl) return block;

    try {
      const token = mintRolePlayEmbedToken({
        userId: user.id,
        lessonId,
        blockId: block.id,
        learnerName,
        scenarioId,
      });
      const iframeUrl = new URL(
        `/embed/role-play/${encodeURIComponent(scenarioId)}`,
        baseUrl,
      );
      iframeUrl.searchParams.set("token", token);

      return {
        ...block,
        content: {
          ...block.content,
          iframe_src: iframeUrl.toString(),
        },
      };
    } catch {
      return block;
    }
  });
}

function getRolePlayBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL;
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

async function QuizLessonBody({
  quizId,
  lessonId,
  userId,
  backHref,
}: {
  quizId: string | null;
  lessonId: string;
  userId: string;
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
  const [{ data: quiz }, { data: attempts }] = await Promise.all([
      supabase
        .from("quizzes")
        .select("id, passing_score, max_attempts, retake_cooldown_hours")
        .eq("id", quizId)
        .maybeSingle(),
      supabase
        .from("user_quiz_attempts")
        .select("passed, score, completed_at")
        .eq("user_id", userId)
        .eq("quiz_id", quizId)
        .order("completed_at", { ascending: false }),
    ]);

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
    maxAttempts: quiz.max_attempts,
    retakeCooldownHours: (quiz.retake_cooldown_hours) ?? 0,
    attempts: (attempts ?? []).map((a) => ({
      passed: a.passed,
      score: a.score,
      completed_at: a.completed_at,
    })),
    now: new Date(),
  });

  if (eligibility.state !== "open") {
    return (
      <QuizGateCard
        state={eligibility.state}
        bestScore={eligibility.bestScore}
        attemptsUsed={eligibility.attemptsUsed}
        maxAttempts={quiz.max_attempts}
        nextAvailableAt={
          eligibility.state === "cooldown"
            ? eligibility.nextAvailableAt
            : null
        }
        backHref={backHref}
      />
    );
  }

  return (
    <QuizRunner
      quizId={quizId}
      lessonId={lessonId}
      passingScore={quiz.passing_score}
      backHref={backHref}
      attemptsUsed={eligibility.attemptsUsed}
      attemptsLeft={eligibility.attemptsLeft}
      retakeCooldownHours={quiz.retake_cooldown_hours ?? 0}
    />
  );
}

async function AssignmentLessonBody({
  assignmentId,
  lessonId,
  userId,
}: {
  assignmentId: string | null;
  lessonId: string;
  userId: string;
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
      .eq("user_id", userId)
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
  if (type === "quiz") {
    return (
      <BmhBadge tone="blue" size="sm">
        Quiz
      </BmhBadge>
    );
  }
  if (type === "assignment") {
    return (
      <BmhBadge tone="orange" size="sm">
        Assignment
      </BmhBadge>
    );
  }
  return (
    <BmhBadge tone="blue" size="sm">
      Lesson
    </BmhBadge>
  );
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
