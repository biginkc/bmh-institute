import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { shapeProgramsResponse } from "@/lib/programs/shape";
import { summarizeLearnerOnboarding } from "@/lib/learner-onboarding/summary";

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
    }>
  >();
  let completedLessonIds = new Set<string>();

  if (courseIds.length > 0 && user) {
    const [lessonsRes, completionsRes] = await Promise.all([
      supabase
        .from("modules")
        .select(
          "course_id, sort_order, lessons(id, title, sort_order, is_required_for_completion)",
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-10">
      <div className="mb-8">
        <PageHeader
          title="Your training"
          description="Programs assigned to you, with the courses you can work through."
          breadcrumb={[{ label: "Learn" }, { label: "Dashboard" }]}
        />
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          We couldn&apos;t load your programs. Try refreshing. ({error.message})
        </div>
      ) : programs.length === 0 ? (
        <NoAssignments />
      ) : (
        <div className="grid gap-6">
          <OnboardingPanel summary={onboardingSummary} />
          {programs.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              progressByCourse={progressByCourse}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function NoAssignments() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No training assigned yet</CardTitle>
        <CardDescription>
          Your account is active, but no programs are assigned yet. Ask your BMH
          Institute admin or manager to add you to the right role group.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          If you expected training today, send this page to your manager. They
          can check your invite and role group.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/profile"
            className="text-primary text-sm font-medium underline-offset-2 hover:underline"
          >
            Check your profile
          </Link>
          <Link
            href="/forgot-password"
            className="text-primary text-sm font-medium underline-offset-2 hover:underline"
          >
            Reset password
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingPanel({
  summary,
}: {
  summary: ReturnType<typeof summarizeLearnerOnboarding>;
}) {
  const firstActionHref = summary.nextLesson
    ? `/lessons/${summary.nextLesson.id}`
    : summary.firstCourse
      ? `/courses/${summary.firstCourse.id}`
      : "/dashboard";
  const firstActionLabel = summary.nextLesson
    ? "Start next lesson"
    : summary.firstCourse
      ? "Open first course"
      : "Review training";

  return (
    <section className="border-border bg-muted/30 rounded-lg border p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <p className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
            First step
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {summary.state === "complete"
              ? "Your required training is complete"
              : summary.nextLesson
                ? summary.nextLesson.title
                : summary.firstCourse?.title}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {summary.state === "complete"
              ? "You can review any course again. Your certificates stay on the Certificates page."
              : "Start here first. Complete required lessons, quizzes, and assignments in the order shown."}
          </p>
        </div>
        {summary.state === "complete" ? (
          <Link
            href="/certificates"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium"
          >
            View certificates
          </Link>
        ) : (
          <Link
            href={firstActionHref}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium"
          >
            {firstActionLabel}
          </Link>
        )}
      </div>
      <div className="border-border mt-4 grid gap-3 border-t pt-4 text-sm md:grid-cols-3">
        <SummaryMetric label="Programs" value={summary.assignedProgramCount} />
        <SummaryMetric label="Courses" value={summary.assignedCourseCount} />
        <SummaryMetric
          label="Required lessons"
          value={`${summary.completedRequiredLessonCount}/${summary.requiredLessonCount}`}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <span className="text-muted-foreground">
          Update your name before certificates are issued.
        </span>
        <Link
          href="/profile"
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          Profile
        </Link>
        <Link
          href="/forgot-password"
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          Password help
        </Link>
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  );
}

function ProgramCard({
  program,
  progressByCourse,
}: {
  program: ReturnType<typeof shapeProgramsResponse>[number];
  progressByCourse: Map<string, { done: number; total: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{program.title}</CardTitle>
            {program.description ? (
              <CardDescription className="mt-1">
                {program.description}
              </CardDescription>
            ) : null}
          </div>
          <Badge variant="secondary">
            {program.course_order_mode === "sequential" ? "Sequential" : "Any order"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {program.courses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No courses in this program yet.</p>
        ) : (
          <ol className="divide-border divide-y">
            {program.courses.map((course, idx) => {
              const progress = progressByCourse.get(course.id);
              const isComplete =
                progress !== undefined &&
                progress.total > 0 &&
                progress.done >= progress.total;
              return (
                <li
                  key={course.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-muted-foreground w-6 text-sm tabular-nums">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/courses/${course.id}`}
                        className="text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {course.title}
                      </Link>
                      {course.description ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {course.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {progress && progress.total > 0 ? (
                      <span
                        className={
                          isComplete
                            ? "text-xs font-medium text-emerald-700 dark:text-emerald-300"
                            : "text-muted-foreground text-xs tabular-nums"
                        }
                      >
                        {isComplete
                          ? "Complete"
                          : `${progress.done} / ${progress.total}`}
                      </span>
                    ) : null}
                    <Link
                      href={`/courses/${course.id}`}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      Open →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
