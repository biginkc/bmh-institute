import { NextResponse } from "next/server";

import {
  pairedQuizParentHref,
  type QuizPairCandidate,
} from "@/lib/courses/paired-quiz";
import { createClient } from "@/lib/supabase/server";

const MAX_RESULTS = 8;
const MAX_QUERY_LENGTH = 80;

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const query =
    new URL(request.url).searchParams
      .get("q")
      ?.trim()
      .slice(0, MAX_QUERY_LENGTH) ?? "";
  if (query.length < 2) {
    return NextResponse.json({ results: [] }, { headers: privateHeaders });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { results: [] },
      { status: 401, headers: privateHeaders },
    );
  }

  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id, title, lesson_type, module_id, prerequisite_lesson_id, quiz_id, modules(course_id)",
    )
    .ilike("title", `%${escapeLikePattern(query)}%`)
    .order("title")
    .limit(MAX_RESULTS);

  if (error) {
    return NextResponse.json(
      { results: [] },
      { status: 500, headers: privateHeaders },
    );
  }

  const prerequisiteIds = Array.from(
    new Set(
      (data ?? []).flatMap((lesson) =>
        lesson.lesson_type === "quiz" &&
        typeof lesson.prerequisite_lesson_id === "string"
          ? [lesson.prerequisite_lesson_id]
          : [],
      ),
    ),
  );
  const [parentResult, dependentsResult] =
    prerequisiteIds.length > 0
      ? await Promise.all([
          supabase
            .from("lessons")
            .select("id, lesson_type, module_id, modules(course_id)")
            .in("id", prerequisiteIds)
            .eq("lesson_type", "content"),
          supabase
            .from("lessons")
            .select(
              "id, lesson_type, module_id, prerequisite_lesson_id, quiz_id",
            )
            .in("prerequisite_lesson_id", prerequisiteIds)
            .eq("lesson_type", "quiz"),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
  if (parentResult.error || dependentsResult.error) {
    return NextResponse.json(
      { results: [] },
      { status: 500, headers: privateHeaders },
    );
  }
  const visibleParents = new Map(
    (parentResult.data ?? []).map((lesson) => [lesson.id, lesson]),
  );
  const dependentsByParent = new Map<string, QuizPairCandidate[]>();
  for (const dependent of dependentsResult.data ?? []) {
    if (!dependent.prerequisite_lesson_id) continue;
    const siblings =
      dependentsByParent.get(dependent.prerequisite_lesson_id) ?? [];
    siblings.push(dependent);
    dependentsByParent.set(dependent.prerequisite_lesson_id, siblings);
  }

  const results = (data ?? []).flatMap((lesson) =>
    typeof lesson.id === "string" && typeof lesson.title === "string"
      ? lesson.lesson_type === "quiz"
        ? quizSearchResult(lesson, visibleParents, dependentsByParent)
        : [
            {
              id: lesson.id,
              title: lesson.title,
              href: `/lessons/${encodeURIComponent(lesson.id)}`,
            },
          ]
      : [],
  );
  return NextResponse.json({ results }, { headers: privateHeaders });
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function quizSearchResult(
  quiz: QuizPairCandidate & {
    title: string;
    modules: { course_id: string } | Array<{ course_id: string }> | null;
  },
  visibleParents: Map<
    string,
    {
      id: string;
      lesson_type: string;
      module_id: string;
      modules: { course_id: string } | Array<{ course_id: string }> | null;
    }
  >,
  dependentsByParent: Map<string, QuizPairCandidate[]>,
) {
  if (!quiz.prerequisite_lesson_id) {
    return [
      {
        id: quiz.id,
        title: quiz.title,
        href: `/lessons/${encodeURIComponent(quiz.id)}`,
      },
    ];
  }
  const modules = Array.isArray(quiz.modules) ? quiz.modules[0] : quiz.modules;
  const href = modules?.course_id
    ? pairedQuizParentHref({
        courseId: modules.course_id,
        quiz,
        parent: visibleParents.get(quiz.prerequisite_lesson_id) ?? null,
        dependentQuizzes:
          dependentsByParent.get(quiz.prerequisite_lesson_id) ?? [],
      })
    : null;
  return href
    ? [{ id: quiz.id, title: quiz.title, href }]
    : [
        {
          id: quiz.id,
          title: quiz.title,
          href: `/lessons/${encodeURIComponent(quiz.id)}`,
        },
      ];
}
