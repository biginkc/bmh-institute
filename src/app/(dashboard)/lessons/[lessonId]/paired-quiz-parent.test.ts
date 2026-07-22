import { describe, expect, it } from "vitest";

import { pairedQuizParentHref } from "./paired-quiz-parent";

describe("pairedQuizParentHref", () => {
  it("returns the composite quiz destination only for a content parent in the same course", () => {
    expect(pairedQuizParentHref({
      courseId: "course-1",
      quizPrerequisiteId: "content-1",
      parent: {
        id: "content-1",
        lesson_type: "content",
        modules: { course_id: "course-1" },
      },
    })).toBe("/lessons/content-1?part=quiz");
  });

  it("rejects a missing, cross-course, or non-content parent", () => {
    const base = { courseId: "course-1", quizPrerequisiteId: "content-1" };
    expect(pairedQuizParentHref({ ...base, parent: null })).toBeNull();
    expect(pairedQuizParentHref({
      ...base,
      parent: { id: "content-1", lesson_type: "content", modules: { course_id: "course-2" } },
    })).toBeNull();
    expect(pairedQuizParentHref({
      ...base,
      parent: { id: "content-1", lesson_type: "quiz", modules: { course_id: "course-1" } },
    })).toBeNull();
  });
});
