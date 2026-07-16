import Link from "next/link";
import { Check, Circle, Lock, Play } from "lucide-react";

import { Badge } from "@/components/bmh-ds/badge";
import { Card } from "@/components/bmh-ds/card";
import { Coach } from "@/components/bmh-ds/coach";
import { LessonCard } from "@/components/bmh-ds/lesson-card";
import { ProgressBar } from "@/components/bmh-ds/progress-bar";
import { createClient } from "@/lib/supabase/server";
import { shapeProgramsResponse } from "@/lib/programs/shape";
import { summarizeLearnerOnboarding } from "@/lib/learner-onboarding/summary";
import { signContentPaths } from "@/lib/content-blocks/sign-urls";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("programs")
    .select(
      `
      id,
      title,
      description,
      course_order_mode,
      is_published,
      sort_order,
      program_courses (
        sort_order,
        courses (
          id,
          title,
          description,
          is_published
        )
      )
    `,
    )
    .eq("is_published", true)
    .order("sort_order");

  const programs = shapeProgramsResponse(data);

  const courseIds = Array.from(
    new Set(programs.flatMap((p) => p.courses.map((c) => c.id))),
  );

  // Count required lessons per course and how many the current user finished.
  // Done as two cheap queries rather than a stored RPC to keep the model
  // simple — completion volume is low for an internal team.
  const progressByCourse = new Map<string, { done: number; total: number }>();
  const lessonsByCourse = new Map<
    string,
    Array<{
      id: string;
      title: string;
      isRequiredForCompletion: boolean;
      thumbnailPath: string | null;
      thumbnailUrl?: string;
    }>
  >();
  let completedLessonIds = new Set<string>();

  if (courseIds.length > 0 && user) {
    const [lessonsRes, completionsRes] = await Promise.all([
      supabase
        .from("modules")
        .select(
          "course_id, sort_order, lessons(id, title, thumbnail_path, sort_order, is_required_for_completion)",
        )
        .in("course_id", courseIds),
      supabase
        .from("user_lesson_completions")
        .select("lesson_id")
        .eq("user_id", user.id),
    ]);

    const requiredLessonsByCourse = new Map<string, Set<string>>();
    const moduleRows = [...(lessonsRes.data ?? [])].sort(
      (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
    );
    for (const row of moduleRows) {
      const courseId = row.course_id as string;
      const lessons = (row.lessons ?? []) as Array<{
        id: string;
        title: string;
        sort_order: number;
        is_required_for_completion: boolean;
        thumbnail_path: string | null;
      }>;
      if (!requiredLessonsByCourse.has(courseId)) {
        requiredLessonsByCourse.set(courseId, new Set());
      }
      const set = requiredLessonsByCourse.get(courseId)!;
      const sortedLessons = [...lessons].sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      );
      for (const lesson of sortedLessons) {
        if (lesson.is_required_for_completion) {
          set.add(lesson.id);
          const courseLessons = lessonsByCourse.get(courseId) ?? [];
          courseLessons.push({
            id: lesson.id,
            title: lesson.title,
            isRequiredForCompletion: true,
            thumbnailPath: lesson.thumbnail_path,
          });
          lessonsByCourse.set(courseId, courseLessons);
        }
      }
    }

    completedLessonIds = new Set(
      (completionsRes.data ?? []).map((r) => r.lesson_id as string),
    );

    for (const [courseId, required] of requiredLessonsByCourse.entries()) {
      let done = 0;
      for (const lessonId of required) {
        if (completedLessonIds.has(lessonId)) done += 1;
      }
      progressByCourse.set(courseId, { done, total: required.size });
    }
  }

  const thumbnailSignedByPath = await signContentPaths(
    Array.from(lessonsByCourse.values())
      .flat()
      .flatMap((lesson) => (lesson.thumbnailPath ? [lesson.thumbnailPath] : [])),
  );
  for (const lessons of lessonsByCourse.values()) {
    for (const lesson of lessons) {
      if (lesson.thumbnailPath) lesson.thumbnailUrl = thumbnailSignedByPath.get(lesson.thumbnailPath);
    }
  }

  const onboardingSummary = summarizeLearnerOnboarding({
    programs: programs.map((program) => ({
      id: program.id,
      title: program.title,
      courses: program.courses.map((course) => ({
        id: course.id,
        title: course.title,
        lessons: lessonsByCourse.get(course.id) ?? [],
      })),
    })),
    completions: Array.from(completedLessonIds),
  });

  const currentCourseId =
    onboardingSummary.nextLesson?.courseId ?? onboardingSummary.firstCourse?.id;
  const currentCourse = programs
    .flatMap((program) => program.courses)
    .find((course) => course.id === currentCourseId);
  const currentLessons = currentCourseId
    ? (lessonsByCourse.get(currentCourseId) ?? [])
    : [];

  return (
    <main className="w-full flex-1 p-5 md:p-8 lg:p-10">
      {error ? (
        <div className="rounded-[var(--bmh-radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--danger)]">
          We couldn&apos;t load your programs. Try refreshing. ({error.message})
        </div>
      ) : programs.length === 0 ? (
        <NoAssignments />
      ) : (
        <div className="flex flex-col gap-8">
          <DashboardHero
            summary={onboardingSummary}
            courseTitle={currentCourse?.title ?? "Your training"}
            description={
              currentCourse?.description ??
              programs[0]?.description ??
              "Complete your assigned lessons and build confidence one step at a time."
            }
          />

          <div className="grid items-start gap-7 lg:grid-cols-[minmax(290px,0.9fr)_minmax(0,1.55fr)]">
            <div className="flex flex-col gap-5">
              {programs.map((program) => (
                <ProgramRail
                  key={program.id}
                  program={program}
                  currentCourseId={
                    onboardingSummary.state === "complete"
                      ? undefined
                      : currentCourseId
                  }
                  progressByCourse={progressByCourse}
                  trainingComplete={onboardingSummary.state === "complete"}
                />
              ))}
            </div>

            <ContinueLearning
              courseId={currentCourseId}
              courseTitle={currentCourse?.title}
              lessons={currentLessons}
              completedLessonIds={completedLessonIds}
              nextLessonId={onboardingSummary.nextLesson?.id}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function NoAssignments() {
  return (
    <Card padding="lg" radius="2xl" tint>
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-w-2xl">
          <Badge tone="blue" size="sm">
            Getting started
          </Badge>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.02em] text-[var(--ink-900)] md:text-4xl">
            No training assigned yet
          </h1>
          <p className="mt-3 font-[family-name:var(--font-body)] text-base font-semibold leading-relaxed text-[var(--ink-700)]">
            Your account is active, but no programs are assigned yet. Ask your
            BMH Institute admin or manager to add you to the right role group.
          </p>
          <p className="mt-4 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
            If you expected training today, send this page to your manager. They
            can check your invite and role group.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 font-[family-name:var(--font-body)] text-sm font-extrabold">
            <Link href="/profile" className="text-[var(--action)] hover:underline">
              Check your profile
            </Link>
            <Link
              href="/forgot-password"
              className="text-[var(--action)] hover:underline"
            >
              Reset password
            </Link>
          </div>
        </div>
        <div className="hidden md:block">
          <Coach
            base="/brand/mascot"
            pose="wave"
            tone="white"
            side="right"
            height={210}
            message="Your next course will show up here as soon as it is assigned."
          />
        </div>
      </div>
    </Card>
  );
}

function DashboardHero({
  summary,
  courseTitle,
  description,
}: {
  summary: ReturnType<typeof summarizeLearnerOnboarding>;
  courseTitle: string;
  description: string;
}) {
  const actionHref = summary.nextLesson
    ? `/lessons/${summary.nextLesson.id}`
    : summary.firstCourse
      ? `/courses/${summary.firstCourse.id}`
      : "/dashboard";
  const complete = summary.state === "complete";

  return (
    <section className="overflow-hidden rounded-[var(--bmh-radius-2xl)] bg-[var(--surface-hero)] px-6 py-7 md:px-10 md:py-9">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="min-w-0">
          <Badge tone={complete ? "green" : "solid"} size="sm">
            {complete ? "Complete" : "In progress"}
          </Badge>
          <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-[1.02] font-extrabold tracking-[-0.025em] text-[var(--ink-900)] md:text-5xl">
            {courseTitle}
          </h1>
          <p className="mt-3 max-w-xl font-[family-name:var(--font-body)] text-base font-semibold leading-relaxed text-[var(--ink-800)] md:text-lg">
            {description}
          </p>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href={complete ? "/certificates" : actionHref}
              className="inline-flex min-h-12 w-fit items-center justify-center gap-2 rounded-[var(--bmh-radius-lg)] border-[2.5px] border-[var(--ink-900)] bg-[var(--ink-900)] px-6 font-[family-name:var(--font-body)] text-base font-extrabold text-[var(--paper)] shadow-[var(--bmh-shadow-sm)] transition hover:-translate-y-0.5 hover:bg-black focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
              <Play aria-hidden="true" size={19} fill="currentColor" />
              {complete ? "View certificates" : "Resume lesson"}
            </Link>
            <span className="font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--ink-800)]">
              {summary.completedRequiredLessonCount}/
              {summary.requiredLessonCount} lessons
            </span>
          </div>

          <div className="mt-5 max-w-md">
            <ProgressBar value={summary.progressPercent} size="md" showLabel />
          </div>
          <p className="mt-3 max-w-md font-[family-name:var(--font-body)] text-xs font-semibold leading-relaxed text-[var(--ink-700)]">
            Complete required lessons, quizzes, and assignments in the order
            shown.
          </p>
        </div>

        <div className="hidden justify-end lg:flex">
          <Coach
            base="/brand/mascot"
            pose={complete ? "wave" : "present"}
            tone="white"
            side="right"
            align="flex-start"
            height={235}
            message={
              complete
                ? "Nice work. Your completed training is ready to review anytime."
                : "Ready when you are. Let's pick up where you left off."
            }
          />
        </div>
      </div>
    </section>
  );
}

function ProgramRail({
  program,
  currentCourseId,
  progressByCourse,
  trainingComplete,
}: {
  program: ReturnType<typeof shapeProgramsResponse>[number];
  currentCourseId?: string;
  progressByCourse: Map<string, { done: number; total: number }>;
  trainingComplete: boolean;
}) {
  const currentCourseIndex = program.courses.findIndex(
    (course) => course.id === currentCourseId,
  );

  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-3 px-2 pb-3 pt-1">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-body)] text-xs font-extrabold text-[var(--text-muted)]">
            Program
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight font-bold text-[var(--ink-900)]">
            {program.title}
          </h2>
        </div>
        <Badge tone="blue" size="sm">
          {program.course_order_mode === "sequential" ? "Sequential" : "Any order"}
        </Badge>
      </div>

      {program.courses.length === 0 ? (
        <p className="px-2 py-4 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
          No courses in this program yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {program.courses.map((course, index) => {
            const progress = progressByCourse.get(course.id);
            const complete =
              trainingComplete ||
              (progress !== undefined &&
                progress.total > 0 &&
                progress.done >= progress.total) ||
              (program.course_order_mode === "sequential" &&
                currentCourseIndex > index);
            const locked =
              program.course_order_mode === "sequential" &&
              !trainingComplete &&
              currentCourseIndex >= 0 &&
              index > currentCourseIndex;
            const active = course.id === currentCourseId;

            return (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className={`flex items-center gap-3 rounded-[var(--bmh-radius-md)] px-3 py-3 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none ${
                    active
                      ? "bg-[var(--surface-tint)] shadow-[inset_3px_0_0_var(--action)]"
                      : "hover:bg-[var(--ink-050)]"
                  } ${locked ? "opacity-60" : ""}`}
                >
                  <CourseMark
                    index={index + 1}
                    complete={complete}
                    locked={locked}
                    active={active}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--ink-900)]">
                      {course.title}
                    </span>
                    <span className="mt-0.5 block font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--text-muted)]">
                      {locked
                        ? `Locked · finish course ${index} first`
                        : complete
                          ? "Complete"
                          : progress && progress.total > 0
                            ? `${progress.done}/${progress.total} required lessons`
                            : "Open course"}
                    </span>
                    {active && progress && progress.total > 0 ? (
                      <span className="mt-2 block">
                        <ProgressBar value={progress.done} max={progress.total} size="sm" />
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {program.course_order_mode === "sequential" ? (
        <p className="px-3 pb-1 pt-3 font-[family-name:var(--font-body)] text-xs font-semibold leading-relaxed text-[var(--text-muted)]">
          Courses unlock in order. Finish the required lessons in your current
          course to open the next one.
        </p>
      ) : null}
    </Card>
  );
}

function CourseMark({
  index,
  complete,
  locked,
  active,
}: {
  index: number;
  complete: boolean;
  locked: boolean;
  active: boolean;
}) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-[family-name:var(--font-display)] text-xs font-extrabold ${
        complete
          ? "border-[var(--success)] bg-[var(--success)] text-white"
          : active
            ? "border-[var(--action)] bg-[var(--action)] text-white"
            : "border-[var(--ink-300)] bg-[var(--paper)] text-[var(--ink-500)]"
      }`}
    >
      {complete ? (
        <Check aria-hidden="true" size={16} />
      ) : locked ? (
        <Lock aria-hidden="true" size={14} />
      ) : active ? (
        index
      ) : (
        <Circle aria-hidden="true" size={14} />
      )}
    </span>
  );
}

function ContinueLearning({
  courseId,
  courseTitle,
  lessons,
  completedLessonIds,
  nextLessonId,
}: {
  courseId?: string;
  courseTitle?: string;
  lessons: Array<{ id: string; title: string; thumbnailUrl?: string }>;
  completedLessonIds: Set<string>;
  nextLessonId?: string;
}) {
  const tones = ["blue", "yellow", "orange", "navy"] as const;
  const poses = ["wave", "present", "point", "thinking"] as const;

  return (
    <section aria-labelledby="continue-learning-title" className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-body)] text-xs font-extrabold text-[var(--text-muted)]">
            {courseTitle ?? "Your course"}
          </p>
          <h2
            id="continue-learning-title"
            className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink-900)]"
          >
            Continue learning
          </h2>
        </div>
        {courseId ? (
          <Link
            href={`/courses/${courseId}`}
            className="shrink-0 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--action)] hover:underline"
          >
            View course
          </Link>
        ) : null}
      </div>

      {lessons.length === 0 ? (
        <Card padding="md">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">
            Your course is ready
          </h3>
          <p className="mt-1 font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
            Open the course to see its modules and learning activities.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {lessons.slice(0, 4).map((lesson, index) => {
            const complete = completedLessonIds.has(lesson.id);
            const next = lesson.id === nextLessonId;

            return (
              <Link
                key={lesson.id}
                href={`/lessons/${lesson.id}`}
                className="rounded-[var(--bmh-radius-lg)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
              >
                <div className="pointer-events-none h-full [&>div]:h-full">
                  <LessonCard
                    eyebrow="Required lesson"
                    title={lesson.title}
                    image={lesson.thumbnailUrl}
                    tone={tones[index % tones.length]}
                    pose={poses[index % poses.length]}
                    mascotBase="/brand/mascot"
                    meta={complete ? "Complete" : next ? "Up next" : "Continue course"}
                    progress={complete ? 100 : next ? 0 : null}
                    badge={
                      complete ? (
                        <Badge tone="green" size="sm">
                          Done
                        </Badge>
                      ) : next ? (
                        <Badge tone="solid" size="sm">
                          Next
                        </Badge>
                      ) : null
                    }
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--border-hairline)] pt-4 font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--text-muted)]">
        <span>Update your name before certificates are issued.</span>
        <Link href="/profile" className="font-extrabold text-[var(--action)] hover:underline">
          Profile
        </Link>
        <Link
          href="/forgot-password"
          className="font-extrabold text-[var(--action)] hover:underline"
        >
          Password help
        </Link>
      </div>
    </section>
  );
}
