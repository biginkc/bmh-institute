import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const MAX_RESULTS = 8;
const MAX_QUERY_LENGTH = 80;

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, MAX_QUERY_LENGTH) ?? "";
  if (query.length < 2) {
    return NextResponse.json({ results: [] }, { headers: privateHeaders });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ results: [] }, { status: 401, headers: privateHeaders });
  }

  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, lesson_type, prerequisite_lesson_id, modules(course_id)")
    .ilike("title", `%${escapeLikePattern(query)}%`)
    .order("title")
    .limit(MAX_RESULTS);

  if (error) {
    return NextResponse.json({ results: [] }, { status: 500, headers: privateHeaders });
  }

  const prerequisiteIds = Array.from(new Set((data ?? []).flatMap((lesson) =>
    lesson.lesson_type === "quiz" && typeof lesson.prerequisite_lesson_id === "string"
      ? [lesson.prerequisite_lesson_id]
      : [],
  )));
  const parentResult = prerequisiteIds.length > 0
    ? await supabase
        .from("lessons")
        .select("id, lesson_type, modules(course_id)")
        .in("id", prerequisiteIds)
        .eq("lesson_type", "content")
    : { data: [], error: null };
  if (parentResult.error) {
    return NextResponse.json({ results: [] }, { status: 500, headers: privateHeaders });
  }
  const visibleParentCourses = new Map(
    (parentResult.data ?? []).map((lesson) => [lesson.id, courseIdFromModules(lesson.modules)]),
  );

  const results = (data ?? []).flatMap((lesson) =>
    typeof lesson.id === "string" && typeof lesson.title === "string"
      ? lesson.lesson_type === "quiz"
        ? typeof lesson.prerequisite_lesson_id === "string" &&
          courseIdFromModules(lesson.modules) !== null &&
          courseIdFromModules(lesson.modules) === visibleParentCourses.get(lesson.prerequisite_lesson_id)
          ? [{
              id: lesson.id,
              title: lesson.title,
              href: `/lessons/${encodeURIComponent(lesson.prerequisite_lesson_id)}?part=quiz`,
            }]
          : []
        : [{
            id: lesson.id,
            title: lesson.title,
            href: `/lessons/${encodeURIComponent(lesson.id)}`,
          }]
      : [],
  );
  return NextResponse.json(
    { results },
    { headers: privateHeaders },
  );
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function courseIdFromModules(
  modules: { course_id: string } | Array<{ course_id: string }> | null,
): string | null {
  const moduleRow = Array.isArray(modules) ? modules[0] : modules;
  return moduleRow?.course_id ?? null;
}
