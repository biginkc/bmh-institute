import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Circle,
  FileText,
  Lock,
  PenLine,
} from "lucide-react";
import type { AriaAttributes } from "react";

import { Badge } from "@/components/bmh-ds/badge";
import { Card } from "@/components/bmh-ds/card";
import { CourseCoverArtwork } from "@/components/course-cover-artwork";
import {
  ProgressBar,
  type ProgressBarProps,
} from "@/components/bmh-ds/progress-bar";
import { createClient } from "@/lib/supabase/server";
import { signAuthorizedArtworkPaths } from "@/lib/content-blocks/sign-urls";
import { artworkRequestKey } from "@/lib/artwork/paths";
import {
  shapeCourseResponse,
  type LessonSummary,
} from "@/lib/courses/shape";
import { loadLearnerLessonStates } from "../../lesson-state-rpc";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const courseResult = await supabase
    .from("courses")
    .select(
        `
        id,
        title,
        description,
        thumbnail_path,
        content_import_id,
        thumbnail_asset_key,
        thumbnail_approved_path,
        thumbnail_approved_sha256,
        is_published,
        modules (
          id,
          title,
          description,
          sort_order,
          lessons (
            id,
            title,
            description,
            lesson_type,
            sort_order,
            prerequisite_lesson_id,
            quiz_id,
            assignment_id,
            is_required_for_completion
          )
        )
      `,
    )
    .eq("id", courseId)
    .maybeSingle();

  if (courseResult.error || !courseResult.data) {
    notFound();
  }

  const course = shapeCourseResponse(courseResult.data);
  if (!course) notFound();
  const courseCoverUrl = course.thumbnail_path
    ? (
        await signAuthorizedArtworkPaths([
          {
            entityType: "course",
            entityId: course.id,
            contentImportId: course.content_import_id,
            thumbnailAssetKey: course.thumbnail_asset_key,
            thumbnailApprovedPath: course.thumbnail_approved_path,
            thumbnailApprovedSha256: course.thumbnail_approved_sha256,
            path: course.thumbnail_path,
          },
        ])
      ).get(artworkRequestKey("course", course.id))
    : undefined;

  const allLessons = course.modules.flatMap((module) => module.lessons);
  const stateResult = user
    ? await loadLearnerLessonStates(supabase, {
        userId: user.id,
        lessonIds: allLessons.map((lesson) => lesson.id),
      })
    : { ok: true as const, states: new Map() };
  if (!stateResult.ok) {
    return (
      <div className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to dashboard
        </Link>
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-extrabold text-[var(--ink-900)]">
          {course.title}
        </h1>
        <div className="mt-6 rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
          We couldn&apos;t verify your lesson progress. Refresh the page to try again.
        </div>
      </div>
    );
  }
  const completedLessonIds = new Set(
    Array.from(stateResult.states.values())
      .filter((state) => state.isComplete)
      .map((state) => state.lessonId),
  );
  const requiredLessons = allLessons.filter(
    (lesson) => lesson.is_required_for_completion,
  );
  const requiredDone = requiredLessons.filter((lesson) =>
    completedLessonIds.has(lesson.id),
  ).length;
  const isCourseComplete =
    requiredLessons.length > 0 && requiredDone >= requiredLessons.length;
  const progressPct =
    requiredLessons.length > 0
      ? Math.round((requiredDone / requiredLessons.length) * 100)
      : 0;
  const courseProgressProps: ProgressBarProps & AriaAttributes = {
    value: progressPct,
    size: "md",
    tone: isCourseComplete ? "green" : "yellow",
    "aria-label": "Course progress",
  };
  const currentLessonId = allLessons.find(
    (lesson) =>
      !completedLessonIds.has(lesson.id) &&
      !isLessonLocked(lesson, completedLessonIds),
  )?.id;

  return (
    <div
      className="w-full flex-1 p-5 font-[family-name:var(--font-body)] md:p-8 lg:p-10"
      data-bmh-course-page
    >
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--action)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--action)]"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to dashboard
      </Link>

      <header className="mt-6 border-b border-[var(--border-hairline)] pb-8">
        <Badge tone={isCourseComplete ? "green" : "solid"} size="sm">
          {isCourseComplete ? "Course complete" : "In progress"}
        </Badge>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-[1.05] font-extrabold tracking-[-0.025em] text-[var(--ink-900)]">
          {course.title}
        </h1>
        {course.description ? (
          <p className="mt-2 max-w-3xl text-base leading-relaxed font-semibold text-[var(--text-muted)]">
            {course.description}
          </p>
        ) : null}
        <div className="mt-6 max-w-2xl">
          <CourseCoverArtwork
            imageUrl={courseCoverUrl}
            alt={`${course.title} course cover`}
            size="course"
          />
        </div>
        {requiredLessons.length > 0 ? (
          <div className="mt-6 max-w-3xl">
            <div className="mb-2 flex items-center justify-between gap-4 text-sm font-extrabold">
              <span className={isCourseComplete ? "text-[var(--success)]" : "text-[var(--ink-800)]"}>
                {isCourseComplete
                  ? "Course complete"
                  : `${requiredDone} of ${requiredLessons.length} required lessons complete`}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--ink-900)]">
                {progressPct}%
              </span>
            </div>
            <ProgressBar {...courseProgressProps} />
          </div>
        ) : null}
      </header>

      {course.modules.length === 0 ? (
        <div className="mt-8">
          <Card padding="lg">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink-900)]">
              No modules yet
            </h2>
            <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
              Content is on the way.
            </p>
          </Card>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {course.modules.map((module, moduleIndex) => {
            const moduleRequired = module.lessons.filter(
              (lesson) => lesson.is_required_for_completion,
            );
            const moduleDone = moduleRequired.filter((lesson) =>
              completedLessonIds.has(lesson.id),
            ).length;
            const moduleComplete =
              moduleRequired.length > 0 && moduleDone >= moduleRequired.length;

            return (
              <Card key={module.id} padding="none" radius="lg">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] px-5 py-5 md:px-7">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Module {moduleIndex + 1}
                    </p>
                    <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight font-bold text-[var(--ink-900)]">
                      {module.title}
                    </h2>
                    {module.description ? (
                      <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
                        {module.description}
                      </p>
                    ) : null}
                  </div>
                  {moduleRequired.length > 0 ? (
                    <Badge tone={moduleComplete ? "green" : "neutral"} size="sm">
                      {moduleComplete ? "Complete" : `${moduleDone} / ${moduleRequired.length}`}
                    </Badge>
                  ) : null}
                </div>

                {module.lessons.length === 0 ? (
                  <p className="px-5 py-6 text-sm font-semibold text-[var(--text-muted)] md:px-7">
                    No lessons yet.
                  </p>
                ) : (
                  <ol className="px-3 py-3 md:px-4">
                    {module.lessons.map((lesson) => (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        completed={completedLessonIds.has(lesson.id)}
                        locked={isLessonLocked(lesson, completedLessonIds)}
                        active={lesson.id === currentLessonId}
                      />
                    ))}
                  </ol>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isLessonLocked(
  lesson: LessonSummary,
  completedLessonIds: Set<string>,
): boolean {
  if (!lesson.prerequisite_lesson_id) return false;
  return !completedLessonIds.has(lesson.prerequisite_lesson_id);
}

function LessonRow({
  lesson,
  completed,
  locked,
  active,
}: {
  lesson: LessonSummary;
  completed: boolean;
  locked: boolean;
  active: boolean;
}) {
  const row = (
    <div className="flex min-h-16 items-center justify-between gap-4 px-3 py-3 md:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <LessonStatus completed={completed} locked={locked} active={active} />
        <div className="min-w-0">
          <span className={`block text-sm font-extrabold ${locked ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]"}`}>
            {lesson.title}
          </span>
          {lesson.description || locked ? (
            <span className="mt-0.5 block text-xs font-semibold text-[var(--text-muted)]">
              {locked ? "Locked" : lesson.description}
            </span>
          ) : null}
        </div>
      </div>
      <LessonTypeBadge type={lesson.lesson_type} />
    </div>
  );

  if (locked) {
    return (
      <li className="cursor-not-allowed opacity-70">
        {row}
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/lessons/${lesson.id}`}
        aria-current={active ? "step" : undefined}
        className={`block rounded-[var(--bmh-radius-md)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)] ${
          active
            ? "bg-[var(--surface-tint)] shadow-[inset_3px_0_0_var(--action)]"
            : "hover:bg-[var(--ink-050)]"
        }`}
      >
        {row}
      </Link>
    </li>
  );
}

function LessonStatus({
  completed,
  locked,
  active,
}: {
  completed: boolean;
  locked: boolean;
  active: boolean;
}) {
  const className = `flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
    completed
      ? "border-[var(--success)] bg-[var(--success)] text-white"
      : active
        ? "border-[var(--action)] bg-[var(--action)] text-white"
        : "border-[var(--ink-300)] bg-[var(--paper)] text-[var(--ink-500)]"
  }`;

  return (
    <span className={className} aria-hidden="true">
      {completed ? (
        <Check className="size-4" />
      ) : locked ? (
        <Lock className="size-3.5" />
      ) : (
        <Circle className="size-3 fill-current" />
      )}
    </span>
  );
}

function LessonTypeBadge({ type }: { type: LessonSummary["lesson_type"] }) {
  if (type === "quiz") {
    return (
      <Badge tone="blue" size="sm" icon={<FileText aria-hidden="true" className="size-3" />}>
        Quiz
      </Badge>
    );
  }
  if (type === "assignment") {
    return (
      <Badge tone="orange" size="sm" icon={<PenLine aria-hidden="true" className="size-3" />}>
        Assignment
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" size="sm">
      Content
    </Badge>
  );
}
