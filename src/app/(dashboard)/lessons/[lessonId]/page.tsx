import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Badge } from "@/components/bmh-ds/badge";
import { Card as BmhCard } from "@/components/bmh-ds/card";
import {
  ProgressRail,
  type ProgressRailEntry,
} from "@/components/bmh-ds/progress-rail";
import {
  ContentBlockRenderer,
  type ContentBlock,
} from "@/components/content-blocks";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildLearnerLessonParts,
  type LearnerLessonPart,
} from "@/lib/content-blocks/learner-parts";
import { prepareLearnerPart } from "@/lib/content-blocks/prepare-learner-part";
import { enrichBlocksWithSignedUrls } from "@/lib/content-blocks/sign-urls";
import type {
  LearnerContentTile,
  LearnerCourseTile,
  LearnerQuizTile,
} from "@/lib/courses/learner-outline";
import { computeQuizEligibility } from "@/lib/quizzes/attempts";
import { getAppUrl } from "@/lib/app-url";
import { mintRolePlayEmbedToken } from "@/lib/role-plays/embed-token";
import { isConfiguredRolePlayScenarioId } from "@/lib/role-plays/scenario-id";
import { createClient } from "@/lib/supabase/server";
import { getRequestAuthContext } from "@/lib/auth/request-context";
import { withLessonTiming } from "@/lib/performance/lesson-timing";

import { loadLearnerLessonOutline } from "../../load-learner-lesson-outline";
import {
  AssignmentRunner,
  type AssignmentDescriptor,
  type PriorSubmission,
} from "./assignment-runner";
import { QuizGateCard } from "./quiz-gate-card";
import { QuizRunner } from "./quiz-runner";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ part?: string | string[] }>;
}) {
  return withLessonTiming("lesson-server-render-total", () =>
    renderLessonPage({ params, searchParams }),
  );
}

async function renderLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ part?: string | string[] }>;
}) {
  const [{ lessonId }, query] = await Promise.all([params, searchParams]);
  const { supabase, user, profile } = await getRequestAuthContext();
  if (!user) notFound();
  const { data: lesson, error: lessonError } = await withLessonTiming(
    "lesson-membership",
    async () =>
      supabase
        .from("lessons")
        .select("id, lesson_type, module_id, modules(course_id)")
        .eq("id", lessonId)
        .maybeSingle(),
  );
  if (lessonError || !lesson) notFound();
  const moduleRow = firstRow(lesson.modules);
  const courseId = moduleRow?.course_id;
  if (!courseId) notFound();

  const result = await loadLearnerLessonOutline({
    supabase,
    courseId,
    lessonId,
    userId: user.id,
  });
  if (!result.ok) {
    return <LessonError error={result.error} courseId={courseId} />;
  }
  const { outline } = result;
  if (lesson.lesson_type === "quiz") {
    const parent = outline.tiles.find(
      (tile): tile is LearnerContentTile =>
        tile.kind === "content" && tile.pairedQuizLessonId === lessonId,
    );
    if (parent) redirect(`/lessons/${parent.id}?part=quiz`);
  }

  const tile = outline.tiles.find((candidate) => candidate.id === lessonId);
  if (!tile) notFound();
  if (!tile.unlocked) return <LockedLesson courseId={courseId} />;

  if (tile.kind === "quiz") {
    return (
      <StandaloneQuizLesson
        courseId={courseId}
        tile={tile}
        total={outline.totalCount}
        userId={user.id}
      />
    );
  }

  if (tile.kind === "assignment") {
    return (
      <LessonShell courseId={courseId} tile={tile} total={outline.totalCount}>
        <div className="mx-auto max-w-3xl">
          <AssignmentLessonBody assignmentId={tile.assignmentId} lessonId={tile.id} userId={user.id} />
        </div>
      </LessonShell>
    );
  }

  return (
    <ContentCompositeLesson
      tile={tile}
      courseId={courseId}
      total={outline.totalCount}
      userId={user.id}
      learnerName={profile?.full_name || user.email || "Learner"}
      requestedPart={firstQueryValue(query.part)}
      nextTile={outline.tiles[tile.lessonNumber] ?? null}
    />
  );
}

async function StandaloneQuizLesson({
  courseId,
  tile,
  total,
  userId,
}: {
  courseId: string;
  tile: LearnerQuizTile;
  total: number;
  userId: string;
}) {
  return (
    <main className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10" data-bmh-lesson-page>
      <a href={`/courses/${courseId}`} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] hover:underline">
        <ArrowLeft className="size-4" /> Back to course
      </a>
      <header className="mx-auto mb-7 mt-5 max-w-3xl border-b border-[var(--border-hairline)] pb-5">
        <Badge tone="blue" size="sm">Quiz</Badge>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)]">{tile.title}</h1>
        <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">Lesson {tile.lessonNumber} of {total} · {tile.moduleTitle}</p>
      </header>
      <div className="mx-auto max-w-3xl">
        <QuizLessonBody
          quizId={tile.quizId}
          lessonId={tile.id}
          userId={userId}
          backHref={`/courses/${courseId}`}
        />
      </div>
    </main>
  );
}

async function ContentCompositeLesson({
  tile,
  courseId,
  total,
  userId,
  learnerName,
  requestedPart,
  nextTile,
}: {
  tile: LearnerContentTile;
  courseId: string;
  total: number;
  userId: string;
  learnerName: string;
  requestedPart: string | null;
  nextTile: LearnerCourseTile | null;
}) {
  const parts = buildLearnerLessonParts({
    blocks: tile.blocks,
    completedBlockIds: tile.completedBlockIds,
    quizComplete: tile.quizComplete,
    quizUnlocked: tile.quizUnlocked,
    compositeComplete: tile.complete,
    includeQuiz: tile.quizId !== null && tile.pairedQuizLessonId !== null,
  });
  const selected = await prepareLearnerPart({
    parts,
    requestedPart,
    signBlocks: (blocks) => withLessonTiming(
      "selected-part-media-signing",
      () => enrichBlocksWithSignedUrls(blocks),
    ),
    attachEmbeds: (blocks) => withLessonTiming(
      "selected-role-play-token",
      () => attachRolePlayEmbeds(blocks, tile.id, { userId, learnerName }),
    ),
  });
  if (!selected) return <LessonError error="This lesson has no available content." courseId={courseId} />;
  const hardQuizNavigation = selected.kind === "quiz";

  const railEntries: ProgressRailEntry[] = parts.map((part) => ({
    id: part.id,
    label: part.label,
    href: part.available ? `/lessons/${tile.id}?part=${encodeURIComponent(part.id)}` : null,
    state: part.complete
      ? "done"
      : selected.id === part.id
        ? "current"
        : part.available
          ? "open"
          : "locked",
  }));

  return (
    <main className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10" data-bmh-lesson-page>
      {hardQuizNavigation ? (
        <a href={`/courses/${courseId}`} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] underline-offset-4 hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to course
        </a>
      ) : (
        <Link href={`/courses/${courseId}`} prefetch={false} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] underline-offset-4 hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to course
        </Link>
      )}
      <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <PartBody
            part={selected}
            tile={tile}
            courseId={courseId}
            userId={userId}
          />
          <div className="mt-6 border-t border-[var(--border-hairline)] pt-4">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-extrabold text-[var(--ink-900)]">{tile.title}</h1>
            <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">Lesson {tile.lessonNumber} of {total} · {tile.moduleTitle}</p>
            {tile.description ? <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--text-muted)]">{tile.description}</p> : null}
          </div>
          {tile.complete && nextTile ? (
            <div className="mt-6 flex justify-end">
              {nextTile.unlocked ? (
                hardQuizNavigation ? (
                  <a href={nextTile.href} className="inline-flex items-center gap-2 rounded-[var(--bmh-radius-md)] bg-[var(--action)] px-5 py-3 text-sm font-extrabold text-white no-underline hover:bg-[var(--action-hover)]">
                    Next lesson <ArrowRight className="size-4" />
                  </a>
                ) : (
                  <Link href={nextTile.href} prefetch={false} className="inline-flex items-center gap-2 rounded-[var(--bmh-radius-md)] bg-[var(--action)] px-5 py-3 text-sm font-extrabold text-white no-underline hover:bg-[var(--action-hover)]">
                    Next lesson <ArrowRight className="size-4" />
                  </Link>
                )
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="lg:sticky lg:top-[96px]">
          <ProgressRail title="Lesson parts" countLabel={`Lesson ${tile.lessonNumber} of ${total}`} entries={railEntries} ariaLabel="Lesson parts" hardNavigation={hardQuizNavigation} />
        </div>
      </div>
    </main>
  );
}

async function PartBody({
  part,
  tile,
  courseId,
  userId,
}: {
  part: LearnerLessonPart;
  tile: LearnerContentTile;
  courseId: string;
  userId: string;
}) {
  if (part.kind === "quiz") {
    if (!tile.quizId || !tile.pairedQuizLessonId) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Quiz unavailable</CardTitle>
            <CardDescription>This lesson does not include a quiz.</CardDescription>
          </CardHeader>
        </Card>
      );
    }
    return (
      <QuizLessonBody
        quizId={tile.quizId}
        lessonId={tile.pairedQuizLessonId}
        userId={userId}
        backHref={`/courses/${courseId}`}
      />
    );
  }
  if (part.kind === "guide") {
    return (
      <div className="flex flex-col gap-5" data-learner-guide>
        {part.blocks.map((block) => <ContentBlockRenderer key={block.id} block={block} completed />)}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-learner-part={part.id}>
      {part.blocks.map((block) => (
        <ContentBlockRenderer key={block.id} block={block} completed={part.complete} />
      ))}
    </div>
  );
}

function LessonShell({
  courseId,
  tile,
  total,
  children,
}: {
  courseId: string;
  tile: LearnerCourseTile;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <main className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10" data-bmh-lesson-page>
      <Link href={`/courses/${courseId}`} prefetch={false} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] hover:underline">
        <ArrowLeft className="size-4" /> Back to course
      </Link>
      <header className="mx-auto mb-7 mt-5 max-w-3xl border-b border-[var(--border-hairline)] pb-5">
        <Badge tone="orange" size="sm">Assignment</Badge>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink-900)]">{tile.title}</h1>
        <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">Lesson {tile.lessonNumber} of {total} · {tile.moduleTitle}</p>
      </header>
      {children}
    </main>
  );
}

async function QuizLessonBody({
  quizId,
  lessonId,
  userId,
  backHref,
}: {
  quizId: string;
  lessonId: string;
  userId: string;
  backHref: string;
}) {
  const supabase = await createClient();
  const [{ data: quiz }, { data: attempts }] = await Promise.all([
    supabase.from("quizzes").select("id, passing_score, max_attempts, retake_cooldown_hours").eq("id", quizId).maybeSingle(),
    supabase.from("user_quiz_attempts").select("passed, score, completed_at").eq("user_id", userId).eq("quiz_id", quizId).order("completed_at", { ascending: false }),
  ]);
  if (!quiz) {
    return <Card><CardHeader><CardTitle>Quiz unavailable</CardTitle><CardDescription>The quiz for this lesson couldn&apos;t be loaded.</CardDescription></CardHeader></Card>;
  }
  const eligibility = computeQuizEligibility({
    maxAttempts: quiz.max_attempts,
    retakeCooldownHours: quiz.retake_cooldown_hours ?? 0,
    attempts: (attempts ?? []).map((attempt) => ({ passed: attempt.passed, score: attempt.score, completed_at: attempt.completed_at })),
    now: new Date(),
  });
  if (eligibility.state !== "open") {
    return <QuizGateCard state={eligibility.state} bestScore={eligibility.bestScore} attemptsUsed={eligibility.attemptsUsed} maxAttempts={quiz.max_attempts} nextAvailableAt={eligibility.state === "cooldown" ? eligibility.nextAvailableAt : null} backHref={backHref} />;
  }
  return <QuizRunner quizId={quizId} lessonId={lessonId} passingScore={quiz.passing_score} backHref={backHref} attemptsUsed={eligibility.attemptsUsed} attemptsLeft={eligibility.attemptsLeft} retakeCooldownHours={quiz.retake_cooldown_hours ?? 0} />;
}

async function AssignmentLessonBody({ assignmentId, lessonId, userId }: { assignmentId: string; lessonId: string; userId: string }) {
  const supabase = await createClient();
  const [{ data: assignment }, { data: submissions }] = await Promise.all([
    supabase.from("assignments").select("id, title, instructions, submission_type, requires_review").eq("id", assignmentId).maybeSingle(),
    supabase.from("assignment_submissions").select("id, status, submitted_at, reviewer_notes").eq("user_id", userId).eq("lesson_id", lessonId).order("submitted_at", { ascending: false }).order("id", { ascending: false }),
  ]);
  if (!assignment) return <Card><CardHeader><CardTitle>Assignment unavailable</CardTitle><CardDescription>The assignment couldn&apos;t be loaded.</CardDescription></CardHeader></Card>;
  return <AssignmentRunner lessonId={lessonId} assignment={assignment as AssignmentDescriptor} priorSubmissions={(submissions ?? []) as PriorSubmission[]} />;
}

async function attachRolePlayEmbeds(blocks: ContentBlock[], lessonId: string, identity: { userId: string; learnerName: string }): Promise<ContentBlock[]> {
  if (!blocks.some((block) => block.block_type === "role_play")) return blocks;
  const baseUrl = getRolePlayBaseUrl();
  return blocks.map((block) => {
    if (block.block_type !== "role_play") return block;
    const scenarioId = stringOr(block.content.scenario_id, "");
    if (!isConfiguredRolePlayScenarioId(scenarioId) || !baseUrl) return block;
    try {
      const token = mintRolePlayEmbedToken({ userId: identity.userId, lessonId, blockId: block.id, learnerName: identity.learnerName, scenarioId, parentOrigin: new URL(getAppUrl()).origin });
      const iframeUrl = new URL(`/embed/role-play/${encodeURIComponent(scenarioId)}`, baseUrl);
      iframeUrl.searchParams.set("token", token);
      return { ...block, content: { ...block.content, iframe_src: iframeUrl.toString() } };
    } catch {
      return block;
    }
  });
}

function LockedLesson({ courseId }: { courseId: string }) {
  return (
    <main className="w-full flex-1 p-5 md:p-8 lg:p-10">
      <Link href={`/courses/${courseId}`} prefetch={false} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] hover:underline"><ArrowLeft className="size-4" /> Back to course</Link>
      <div className="mt-6 max-w-3xl"><BmhCard padding="lg" tint><h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[var(--ink-900)]">Locked</h1><p className="mt-2 text-sm font-semibold text-[var(--text-muted)]">Finish the earlier lesson first.</p></BmhCard></div>
    </main>
  );
}

function LessonError({ error, courseId }: { error: string; courseId: string }) {
  return (
    <main className="w-full flex-1 p-5 md:p-8 lg:p-10">
      <Link href={`/courses/${courseId}`} prefetch={false} className="text-sm font-extrabold text-[var(--action)] hover:underline">Back to course</Link>
      <div className="mt-5 max-w-3xl rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error} Refresh the page or contact an administrator.</div>
    </main>
  );
}

function getRolePlayBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL;
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
