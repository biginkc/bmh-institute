import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { shapeProgramsResponse } from "@/lib/programs/shape";

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

  if (courseIds.length > 0 && user) {
    const [lessonsRes, completionsRes] = await Promise.all([
      supabase
        .from("modules")
        .select("course_id, lessons(id, is_required_for_completion)")
        .in("course_id", courseIds),
      supabase
        .from("user_lesson_completions")
        .select("lesson_id")
        .eq("user_id", user.id),
    ]);

    const requiredLessonsByCourse = new Map<string, Set<string>>();
    for (const row of lessonsRes.data ?? []) {
      const courseId = row.course_id as string;
      const lessons = (row.lessons ?? []) as Array<{
        id: string;
        is_required_for_completion: boolean;
      }>;
      if (!requiredLessonsByCourse.has(courseId)) {
        requiredLessonsByCourse.set(courseId, new Set());
      }
      const set = requiredLessonsByCourse.get(courseId)!;
      for (const lesson of lessons) {
        if (lesson.is_required_for_completion) set.add(lesson.id);
      }
    }

    const completedLessonIds = new Set(
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Your training</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Programs assigned to you, with the courses you can work through.
        </p>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          We couldn't load your programs. Try refreshing. ({error.message})
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No programs yet</CardTitle>
            <CardDescription>
              Nothing has been assigned to your account. Reach out to an admin to get access.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6">
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
