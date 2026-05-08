export type LessonSummary = {
  id: string;
  title: string;
  description: string | null;
  lesson_type: "content" | "quiz" | "assignment";
  sort_order: number;
  prerequisite_lesson_id: string | null;
  quiz_id: string | null;
  assignment_id: string | null;
  is_required_for_completion: boolean;
};

export type ModuleWithLessons = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: LessonSummary[];
};

export type CourseWithModulesAndLessons = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  modules: ModuleWithLessons[];
};

type RawLessonSummary = Omit<LessonSummary, "lesson_type"> & {
  lesson_type: string;
};

type RawModule = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: RawLessonSummary[] | null;
};

type RawCourse = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  modules: RawModule[] | null;
};

export function shapeCourseResponse(
  raw: RawCourse | null | undefined,
): CourseWithModulesAndLessons | null {
  if (!raw) return null;

  const modules = [...(raw.modules ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      sort_order: m.sort_order,
      lessons: [...(m.lessons ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((lesson) => ({
          ...lesson,
          lesson_type: parseLessonType(lesson.lesson_type),
        })),
    }));

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    is_published: raw.is_published,
    modules,
  };
}

function parseLessonType(value: string): LessonSummary["lesson_type"] {
  if (value === "quiz" || value === "assignment") return value;
  return "content";
}
