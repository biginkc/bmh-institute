import { describe, expect, it } from "vitest";

import { addCourseContentCounts } from "./page";

describe("addCourseContentCounts", () => {
  it("adds module and lesson counts without changing course order", () => {
    const rows = addCourseContentCounts(
      [
        { id: "course-a", title: "Course A" },
        { id: "course-b", title: "Course B" },
      ],
      [
        {
          course_id: "course-b",
          lessons: [{ id: "lesson-b-1" }, { id: "lesson-b-2" }],
        },
        {
          course_id: "course-b",
          lessons: [],
        },
        {
          course_id: "course-a",
          lessons: { id: "lesson-a-1" },
        },
      ],
    );

    expect(rows).toEqual([
      { id: "course-a", title: "Course A", moduleCount: 1, lessonCount: 1 },
      { id: "course-b", title: "Course B", moduleCount: 2, lessonCount: 2 },
    ]);
  });
});
