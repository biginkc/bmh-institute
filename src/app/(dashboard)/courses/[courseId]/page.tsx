import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Lock, FileText, PenLine } from "lucide-react";

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
  shapeCourseResponse,
  type LessonSummary,
} from "@/lib/courses/shape";
import { cn } from "@/lib/utils";

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

  const [courseResult, completionsResult] = await Promise.all([
    supabase
      .from("courses")
      .select(
        `
        id,
        title,
        description,
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
      .maybeSingle(),
    user
      ? supabase
          .from("user_lesson_completions")
          .select("lesson_id")
          .eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);

  if (courseResult.error || !courseResult.data) {
    notFound();
  }

  const course = shapeCourseResponse(courseResult.data);
  if (!course) notFound();

  const completedLessonIds = new Set(
    (completionsResult.data ?? []).map((c) => c.lesson_id as string),
  );

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const requiredLessons = allLessons.filter((l) => l.is_required_for_completion);
  const requiredDone = requiredLessons.filter((l) =>
    completedLessonIds.has(l.id),
  ).length;
  const isCourseComplete =
    requiredLessons.length > 0 && requiredDone >= requiredLessons.length;
  const progressPct =
    requiredLessons.length > 0
      ? Math.round((requiredDone / requiredLessons.length) * 100)
      : 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6 md:p-10">
      <div className="mb-6">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-xs">
          ← Back to dashboard
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        {course.description ? (
          <p className="text-muted-foreground mt-1 text-sm">{course.description}</p>
        ) : null}
        {requiredLessons.length > 0 ? (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span
                className={cn(
                  "font-medium",
                  isCourseComplete
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground",
                )}
              >
                {isCourseComplete
                  ? "Course complete"
                  : `${requiredDone} of ${requiredLessons.length} required lessons complete`}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {progressPct}%
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isCourseComplete ? "bg-emerald-500" : "bg-primary",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {course.modules.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No modules yet</CardTitle>
            <CardDescription>Content is on the way.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {course.modules.map((mod, modIdx) => {
            const modRequired = mod.lessons.filter(
              (l) => l.is_required_for_completion,
            );
            const modDone = modRequired.filter((l) =>
              completedLessonIds.has(l.id),
            ).length;
            const modComplete =
              modRequired.length > 0 && modDone >= modRequired.length;
            return (
            <Card key={mod.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm tabular-nums">
                    Module {modIdx + 1}
                  </span>
                  {modRequired.length > 0 ? (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        modComplete
                          ? "font-medium text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {modComplete
                        ? "Complete"
                        : `${modDone} / ${modRequired.length}`}
                    </span>
                  ) : null}
                </div>
                <CardTitle className="mt-1">{mod.title}</CardTitle>
                {mod.description ? (
                  <CardDescription>{mod.description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent>
                {mod.lessons.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No lessons yet.</p>
                ) : (
                  <ol className="divide-border divide-y">
                    {mod.lessons.map((lesson) => (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        completed={completedLessonIds.has(lesson.id)}
                        locked={isLessonLocked(lesson, completedLessonIds)}
                      />
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </main>
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
}: {
  lesson: LessonSummary;
  completed: boolean;
  locked: boolean;
}) {
  const href = `/lessons/${lesson.id}`;
  const Icon = completed ? CheckCircle2 : locked ? Lock : Circle;

  const row = (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Icon
          className={cn(
            "size-4 shrink-0",
            completed
              ? "text-primary"
              : locked
                ? "text-muted-foreground"
                : "text-muted-foreground",
          )}
        />
        <div>
          <span
            className={cn(
              "text-sm font-medium",
              locked && "text-muted-foreground",
            )}
          >
            {lesson.title}
          </span>
          {lesson.description ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{lesson.description}</p>
          ) : null}
        </div>
      </div>
      <LessonTypeBadge type={lesson.lesson_type} />
    </div>
  );

  if (locked) {
    return <li className="cursor-not-allowed opacity-60">{row}</li>;
  }

  return (
    <li className="hover:bg-muted/40 -mx-2 rounded-md px-2 transition-colors">
      <Link href={href} className="block">
        {row}
      </Link>
    </li>
  );
}

function LessonTypeBadge({
  type,
}: {
  type: LessonSummary["lesson_type"];
}) {
  if (type === "quiz") {
    return (
      <Badge variant="outline" className="gap-1">
        <FileText className="size-3" />
        Quiz
      </Badge>
    );
  }
  if (type === "assignment") {
    return (
      <Badge variant="outline" className="gap-1">
        <PenLine className="size-3" />
        Assignment
      </Badge>
    );
  }
  return <Badge variant="secondary">Content</Badge>;
}
