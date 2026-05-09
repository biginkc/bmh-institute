import { describe, expect, it } from "vitest";

import { summarizeLearnerOnboarding } from "./summary";

describe("summarizeLearnerOnboarding", () => {
  it("returns an empty assignment state", () => {
    expect(summarizeLearnerOnboarding({ programs: [], completions: [] })).toEqual({
      assignedProgramCount: 0,
      assignedCourseCount: 0,
      requiredLessonCount: 0,
      completedRequiredLessonCount: 0,
      progressPercent: 0,
      firstCourse: null,
      nextLesson: null,
      state: "no_assignments",
    });
  });

  it("chooses the first course as the first learner action", () => {
    const summary = summarizeLearnerOnboarding({
      programs: [
        {
          id: "program-1",
          title: "VA Foundations",
          courses: [
            {
              id: "course-1",
              title: "Getting Started",
              lessons: [],
            },
          ],
        },
      ],
      completions: [],
    });

    expect(summary.state).toBe("ready");
    expect(summary.firstCourse).toEqual({
      id: "course-1",
      title: "Getting Started",
    });
    expect(summary.nextLesson).toBeNull();
  });

  it("chooses the first available required lesson that is not complete", () => {
    const summary = summarizeLearnerOnboarding({
      programs: [
        {
          id: "program-1",
          title: "VA Foundations",
          courses: [
            {
              id: "course-1",
              title: "Getting Started",
              lessons: [
                {
                  id: "lesson-1",
                  title: "Welcome",
                  isRequiredForCompletion: true,
                },
                {
                  id: "lesson-2",
                  title: "First task",
                  isRequiredForCompletion: true,
                },
              ],
            },
          ],
        },
      ],
      completions: ["lesson-1"],
    });

    expect(summary.completedRequiredLessonCount).toBe(1);
    expect(summary.requiredLessonCount).toBe(2);
    expect(summary.progressPercent).toBe(50);
    expect(summary.nextLesson).toEqual({
      id: "lesson-2",
      title: "First task",
      courseId: "course-1",
      courseTitle: "Getting Started",
    });
  });

  it("marks completed when all required lessons are done", () => {
    const summary = summarizeLearnerOnboarding({
      programs: [
        {
          id: "program-1",
          title: "VA Foundations",
          courses: [
            {
              id: "course-1",
              title: "Getting Started",
              lessons: [
                {
                  id: "lesson-1",
                  title: "Welcome",
                  isRequiredForCompletion: true,
                },
              ],
            },
          ],
        },
      ],
      completions: ["lesson-1"],
    });

    expect(summary.state).toBe("complete");
    expect(summary.progressPercent).toBe(100);
    expect(summary.nextLesson).toBeNull();
  });
});
