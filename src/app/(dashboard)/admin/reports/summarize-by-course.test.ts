// WR-03: summarizeByCourse must scope "active learners" to the course,
// not return the org-wide distinct-user count on every row. Pure function;
// no Supabase or React mocks required.
import { describe, expect, it } from "vitest";

import { summarizeByCourse } from "./report-format";

describe("summarizeByCourse (WR-03)", () => {
  const courses = [
    { id: "course-a", title: "Course A" },
    { id: "course-b", title: "Course B" },
    { id: "course-c", title: "Course C" },
  ];

  const courseIdByLessonId = new Map<string, string>([
    ["lesson-a-1", "course-a"],
    ["lesson-a-2", "course-a"],
    ["lesson-b-1", "course-b"],
    // course-c has zero lessons mapped on purpose.
  ]);

  it("counts distinct learners per course, not org-wide", () => {
    const completions = [
      // Two learners completed lessons in course-a.
      { user_id: "u1", lesson_id: "lesson-a-1", completed_at: "2026-01-01" },
      { user_id: "u2", lesson_id: "lesson-a-2", completed_at: "2026-01-02" },
      // One learner completed a lesson in course-b.
      { user_id: "u3", lesson_id: "lesson-b-1", completed_at: "2026-01-03" },
    ];

    const result = summarizeByCourse({
      courses,
      courseCerts: [],
      completions,
      courseIdByLessonId,
    });

    expect(result).toEqual([
      { id: "course-a", title: "Course A", activeLearners: 2, completedCount: 0 },
      { id: "course-b", title: "Course B", activeLearners: 1, completedCount: 0 },
      { id: "course-c", title: "Course C", activeLearners: 0, completedCount: 0 },
    ]);
  });

  it("does not double-count a learner with multiple completions in the same course", () => {
    const completions = [
      { user_id: "u1", lesson_id: "lesson-a-1", completed_at: "2026-01-01" },
      { user_id: "u1", lesson_id: "lesson-a-2", completed_at: "2026-01-02" },
    ];

    const result = summarizeByCourse({
      courses,
      courseCerts: [],
      completions,
      courseIdByLessonId,
    });

    const courseA = result.find((r) => r.id === "course-a")!;
    expect(courseA.activeLearners).toBe(1);
  });

  it("counts the same learner against each course they have completions in", () => {
    const completions = [
      { user_id: "u1", lesson_id: "lesson-a-1", completed_at: "2026-01-01" },
      { user_id: "u1", lesson_id: "lesson-b-1", completed_at: "2026-01-02" },
    ];

    const result = summarizeByCourse({
      courses,
      courseCerts: [],
      completions,
      courseIdByLessonId,
    });

    expect(result.find((r) => r.id === "course-a")!.activeLearners).toBe(1);
    expect(result.find((r) => r.id === "course-b")!.activeLearners).toBe(1);
  });

  it("ignores completions whose lesson is not mapped to a course", () => {
    const completions = [
      { user_id: "u1", lesson_id: "orphan-lesson", completed_at: "2026-01-01" },
    ];

    const result = summarizeByCourse({
      courses,
      courseCerts: [],
      completions,
      courseIdByLessonId,
    });

    expect(result.every((r) => r.activeLearners === 0)).toBe(true);
  });

  it("populates completedCount from courseCerts grouped by course_id", () => {
    const courseCerts = [
      { user_id: "u1", course_id: "course-a", issued_at: "2026-01-01" },
      { user_id: "u2", course_id: "course-a", issued_at: "2026-01-02" },
      { user_id: "u1", course_id: "course-b", issued_at: "2026-01-03" },
    ];

    const result = summarizeByCourse({
      courses,
      courseCerts,
      completions: [],
      courseIdByLessonId,
    });

    expect(result.find((r) => r.id === "course-a")!.completedCount).toBe(2);
    expect(result.find((r) => r.id === "course-b")!.completedCount).toBe(1);
    expect(result.find((r) => r.id === "course-c")!.completedCount).toBe(0);
  });
});
