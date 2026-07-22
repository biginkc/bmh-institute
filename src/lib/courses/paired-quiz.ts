type ParentLesson = {
  id: string;
  lesson_type: string;
  module_id: string;
  modules: { course_id: string } | Array<{ course_id: string }> | null;
};

export type QuizPairCandidate = {
  id: string;
  lesson_type: string;
  module_id: string;
  prerequisite_lesson_id: string | null;
  quiz_id: string | null;
};

export function pairedQuizParentHref({
  courseId,
  quiz,
  parent,
  dependentQuizzes,
}: {
  courseId: string;
  quiz: QuizPairCandidate;
  parent: ParentLesson | null;
  dependentQuizzes: QuizPairCandidate[];
}): string | null {
  if (
    quiz.lesson_type !== "quiz" ||
    !quiz.quiz_id ||
    !quiz.prerequisite_lesson_id ||
    !parent ||
    parent.id !== quiz.prerequisite_lesson_id ||
    parent.lesson_type !== "content" ||
    parent.module_id !== quiz.module_id
  ) {
    return null;
  }
  const moduleRow = Array.isArray(parent.modules)
    ? parent.modules[0]
    : parent.modules;
  if (moduleRow?.course_id !== courseId) return null;
  const validDependents = dependentQuizzes.filter(
    (candidate) =>
      candidate.lesson_type === "quiz" &&
      candidate.prerequisite_lesson_id === parent.id,
  );
  if (validDependents.length !== 1 || validDependents[0]?.id !== quiz.id)
    return null;
  return `/lessons/${encodeURIComponent(parent.id)}?part=quiz`;
}
