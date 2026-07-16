export type NavigationLessonRow = {
  id: string;
  title: string;
  lesson_type: "content" | "quiz" | "assignment";
  sort_order: number;
  prerequisite_lesson_id: string | null;
};

export type LessonChapter = {
  id: string;
  index: number;
  title: string;
  meta?: string;
  status?: "todo" | "done" | "locked";
  active?: boolean;
  available?: boolean;
};

export type ContentLessonNavigation = {
  chapters: LessonChapter[];
  completedCount: number;
  chapterIndex: number;
  previous: Pick<NavigationLessonRow, "id" | "title"> | null;
  next: Pick<NavigationLessonRow, "id" | "title"> | null;
};

export function buildContentLessonNavigation({
  lessons,
  lessonId,
  completedLessonIds,
  unlockedLessonIds,
}: {
  lessons: NavigationLessonRow[];
  lessonId: string;
  completedLessonIds: Set<string>;
  unlockedLessonIds: Set<string>;
}): ContentLessonNavigation | null {
  const currentIndex = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (currentIndex < 0) return null;

  const unlocked = (lesson: NavigationLessonRow) =>
    unlockedLessonIds.has(lesson.id);
  const chapterMeta = (lesson: NavigationLessonRow) => {
    if (lesson.lesson_type === "quiz") return "Quiz";
    if (lesson.lesson_type === "assignment") return "Assignment";
    return undefined;
  };

  const chapters: LessonChapter[] = lessons.map((lesson, index) => ({
    id: lesson.id,
    index: index + 1,
    title: lesson.title,
    meta: chapterMeta(lesson),
    status: completedLessonIds.has(lesson.id)
      ? "done"
      : unlocked(lesson)
        ? "todo"
        : "locked",
    active: lesson.id === lessonId,
    available: unlocked(lesson),
  }));
  const previous =
    lessons
      .slice(0, currentIndex)
      .reverse()
      .find(unlocked) ?? null;
  const next = lessons.slice(currentIndex + 1).find(unlocked) ?? null;

  return {
    chapters,
    completedCount: lessons.filter((lesson) =>
      completedLessonIds.has(lesson.id),
    ).length,
    chapterIndex: currentIndex + 1,
    previous: previous ? { id: previous.id, title: previous.title } : null,
    next: next ? { id: next.id, title: next.title } : null,
  };
}
