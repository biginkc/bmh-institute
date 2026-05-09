export type LearnerOnboardingLesson = {
  id: string;
  title: string;
  isRequiredForCompletion: boolean;
};

export type LearnerOnboardingCourse = {
  id: string;
  title: string;
  lessons?: LearnerOnboardingLesson[];
};

export type LearnerOnboardingProgram = {
  id: string;
  title: string;
  courses: LearnerOnboardingCourse[];
};

export type LearnerOnboardingSummary = {
  assignedProgramCount: number;
  assignedCourseCount: number;
  requiredLessonCount: number;
  completedRequiredLessonCount: number;
  progressPercent: number;
  firstCourse: { id: string; title: string } | null;
  nextLesson: {
    id: string;
    title: string;
    courseId: string;
    courseTitle: string;
  } | null;
  state: "no_assignments" | "ready" | "complete";
};

export function summarizeLearnerOnboarding({
  programs,
  completions,
}: {
  programs: LearnerOnboardingProgram[];
  completions: string[];
}): LearnerOnboardingSummary {
  const completionSet = new Set(completions);
  const courses = programs.flatMap((program) => program.courses);
  const firstCourse = courses[0]
    ? { id: courses[0].id, title: courses[0].title }
    : null;

  let requiredLessonCount = 0;
  let completedRequiredLessonCount = 0;
  let nextLesson: LearnerOnboardingSummary["nextLesson"] = null;

  for (const course of courses) {
    for (const lesson of course.lessons ?? []) {
      if (!lesson.isRequiredForCompletion) continue;
      requiredLessonCount += 1;
      if (completionSet.has(lesson.id)) {
        completedRequiredLessonCount += 1;
        continue;
      }
      nextLesson ??= {
        id: lesson.id,
        title: lesson.title,
        courseId: course.id,
        courseTitle: course.title,
      };
    }
  }

  const progressPercent =
    requiredLessonCount > 0
      ? Math.round((completedRequiredLessonCount / requiredLessonCount) * 100)
      : 0;

  return {
    assignedProgramCount: programs.length,
    assignedCourseCount: courses.length,
    requiredLessonCount,
    completedRequiredLessonCount,
    progressPercent,
    firstCourse,
    nextLesson,
    state:
      programs.length === 0
        ? "no_assignments"
        : requiredLessonCount > 0 &&
            completedRequiredLessonCount >= requiredLessonCount
          ? "complete"
          : "ready",
  };
}
