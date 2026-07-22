type ParentLesson = {
  id: string;
  lesson_type: string;
  modules: { course_id: string } | Array<{ course_id: string }> | null;
};

export function pairedQuizParentHref({
  courseId,
  quizPrerequisiteId,
  parent,
}: {
  courseId: string;
  quizPrerequisiteId: string;
  parent: ParentLesson | null;
}): string | null {
  if (!parent || parent.id !== quizPrerequisiteId || parent.lesson_type !== "content") {
    return null;
  }
  const moduleRow = Array.isArray(parent.modules) ? parent.modules[0] : parent.modules;
  if (moduleRow?.course_id !== courseId) return null;
  return `/lessons/${encodeURIComponent(parent.id)}?part=quiz`;
}
