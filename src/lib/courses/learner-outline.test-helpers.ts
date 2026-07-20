import type { LearnerCourseOutline, LearnerCourseTile } from "./learner-outline";

export function learnerOutlineFixture(count = 25): LearnerCourseOutline {
  const tiles: LearnerCourseTile[] = Array.from({ length: count }, (_, index) => {
    const assignment = index % 4 === 3;
    const base = {
      id: `lesson-${index + 1}`,
      title: assignment ? `Assignment ${index + 1}` : `Topic ${index + 1}`,
      description: null,
      moduleId: `module-${Math.floor(index / 5) + 1}`,
      moduleTitle: `Module ${Math.floor(index / 5) + 1}`,
      lessonNumber: index + 1,
      complete: index < 2,
      unlocked: index < 3,
      state: index < 2 ? ("complete" as const) : index === 2 ? ("current" as const) : ("locked" as const),
      href: `/lessons/lesson-${index + 1}`,
      blocks: [],
      thumbnailPath: null,
      contentImportId: null,
      thumbnailAssetKey: null,
      thumbnailApprovedPath: null,
      thumbnailApprovedSha256: null,
    };
    return assignment
      ? {
          ...base,
          kind: "assignment" as const,
          assignmentId: `assignment-${index + 1}`,
          submissionStatus: null,
        }
      : {
          ...base,
          kind: "content" as const,
          pairedQuizLessonId: `quiz-lesson-${index + 1}`,
          quizId: `quiz-${index + 1}`,
          contentComplete: index < 2,
          quizComplete: index < 2,
          quizUnlocked: index < 3,
          completedBlockIds: new Set<string>(),
        };
  });
  const moduleIds = Array.from(new Set(tiles.map((tile) => tile.moduleId)));
  return {
    course: {
      id: "course-1",
      title: "BMH Employee Training",
      description: "Practical training",
      isPublished: false,
      thumbnailPath: null,
      contentImportId: null,
      thumbnailAssetKey: null,
      thumbnailApprovedPath: null,
      thumbnailApprovedSha256: null,
      modules: [],
    },
    modules: moduleIds.map((id) => ({
      id,
      title: tiles.find((tile) => tile.moduleId === id)!.moduleTitle,
      description: null,
      tiles: tiles.filter((tile) => tile.moduleId === id),
    })),
    tiles,
    completedCount: 2,
    totalCount: count,
    completionPercent: Math.round((2 / count) * 100),
    resume: {
      href: "/lessons/lesson-3?part=video-1",
      label: "Continue learning",
      tileId: "lesson-3",
    },
  };
}
