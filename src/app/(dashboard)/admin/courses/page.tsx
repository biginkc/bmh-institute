import Link from "next/link";
import { Plus } from "lucide-react";

import { Card } from "@/components/bmh-ds";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

import { CoursesTable } from "./courses-table";

export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const [coursesRes, modulesRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, is_published")
      .order("title"),
    supabase.from("modules").select("course_id, lessons(id)"),
  ]);
  const courses = addCourseContentCounts(
    (coursesRes.data ?? []) as CourseListRow[],
    (modulesRes.data ?? []) as ModuleCountRow[],
  );

  return (
    <main className="mx-auto w-full max-w-[980px] flex-1 px-5 py-8 md:px-7 md:pb-16">
      <div className="mb-7">
        <PageHeader
          title="Courses"
          description="Standalone or program-attached courses."
          breadcrumb={[{ label: "Admin" }, { label: "Courses" }]}
          actions={
            <Link
              href="/admin/courses/new"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--bmh-radius-md)] border-[2.5px] border-transparent bg-[var(--action)] px-4 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--text-on-brand)] shadow-[var(--bmh-shadow-sm)] transition hover:bg-[var(--action-hover)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
              <Plus className="size-4" aria-hidden />
              New course
            </Link>
          }
        />
      </div>

      <Card padding="sm">
        <CoursesTable courses={courses} />
      </Card>
    </main>
  );
}

type CourseListRow = {
  id: string;
  title: string;
  is_published: boolean;
};

type LessonCountShape = { id: string } | Array<{ id: string }> | null;

type ModuleCountRow = {
  course_id: string;
  lessons: LessonCountShape;
};

export function addCourseContentCounts<T extends { id: string }>(
  courses: T[],
  modules: ModuleCountRow[],
): Array<T & { moduleCount: number; lessonCount: number }> {
  const moduleCountByCourse = new Map<string, number>();
  const lessonCountByCourse = new Map<string, number>();

  for (const moduleRow of modules) {
    moduleCountByCourse.set(
      moduleRow.course_id,
      (moduleCountByCourse.get(moduleRow.course_id) ?? 0) + 1,
    );
    lessonCountByCourse.set(
      moduleRow.course_id,
      (lessonCountByCourse.get(moduleRow.course_id) ?? 0) +
        countLessons(moduleRow.lessons),
    );
  }

  return courses.map((course) => ({
    ...course,
    moduleCount: moduleCountByCourse.get(course.id) ?? 0,
    lessonCount: lessonCountByCourse.get(course.id) ?? 0,
  }));
}

function countLessons(lessons: LessonCountShape): number {
  if (!lessons) return 0;
  return Array.isArray(lessons) ? lessons.length : 1;
}
