import { describe, expect, it } from "vitest";

import {
  buildContentLessonNavigation,
  type NavigationLessonRow,
} from "./lesson-navigation";

const LESSONS: NavigationLessonRow[] = [
  {
    id: "quiz",
    title: "Checkpoint",
    lesson_type: "quiz",
    sort_order: 1,
    prerequisite_lesson_id: null,
  },
  {
    id: "lesson",
    title: "Next chapter",
    lesson_type: "content",
    sort_order: 2,
    prerequisite_lesson_id: "quiz",
  },
];

describe("buildContentLessonNavigation", () => {
  it("keeps a lesson locked when its prerequisite is complete but the canonical unlock check fails", () => {
    const navigation = buildContentLessonNavigation({
      lessons: LESSONS,
      lessonId: "quiz",
      completedLessonIds: new Set(["quiz"]),
      unlockedLessonIds: new Set(["quiz"]),
    });

    expect(navigation?.chapters[1]).toMatchObject({
      id: "lesson",
      status: "locked",
    });
    expect(navigation?.next).toBeNull();
  });

  it("uses the canonical unlock result for admin access", () => {
    const navigation = buildContentLessonNavigation({
      lessons: LESSONS,
      lessonId: "quiz",
      completedLessonIds: new Set(["quiz"]),
      unlockedLessonIds: new Set(["quiz", "lesson"]),
    });

    expect(navigation?.chapters[1]).toMatchObject({
      id: "lesson",
      status: "todo",
    });
    expect(navigation?.next).toEqual({
      id: "lesson",
      title: "Next chapter",
    });
  });

  it("keeps recorded completion visible when a completed lesson is no longer available", () => {
    const navigation = buildContentLessonNavigation({
      lessons: LESSONS,
      lessonId: "quiz",
      completedLessonIds: new Set(["quiz", "lesson"]),
      unlockedLessonIds: new Set(["quiz"]),
    });

    expect(navigation?.chapters[1]).toMatchObject({
      id: "lesson",
      status: "done",
      available: false,
    });
    expect(navigation?.completedCount).toBe(2);
    expect(navigation?.next).toBeNull();
  });
});
