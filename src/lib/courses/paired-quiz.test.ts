import { describe, expect, it } from "vitest";

import { pairedQuizParentHref } from "./paired-quiz";

describe("pairedQuizParentHref", () => {
  it("returns the composite quiz destination only for the authoritative pair", () => {
    expect(
      pairedQuizParentHref({
        courseId: "course-1",
        quiz: quiz(),
        parent: parent(),
        dependentQuizzes: [quiz()],
      }),
    ).toBe("/lessons/content-1?part=quiz");
  });

  it("rejects a missing, cross-course, or non-content parent", () => {
    const base = {
      courseId: "course-1",
      quiz: quiz(),
      dependentQuizzes: [quiz()],
    };
    expect(pairedQuizParentHref({ ...base, parent: null })).toBeNull();
    expect(
      pairedQuizParentHref({
        ...base,
        parent: parent({ courseId: "course-2" }),
      }),
    ).toBeNull();
    expect(
      pairedQuizParentHref({
        ...base,
        parent: parent({ lesson_type: "quiz" }),
      }),
    ).toBeNull();
  });

  it("keeps ambiguous, cross-module, and record-less quizzes standalone", () => {
    const base = { courseId: "course-1", parent: parent() };
    expect(
      pairedQuizParentHref({
        ...base,
        quiz: quiz(),
        dependentQuizzes: [quiz(), quiz({ id: "quiz-2" })],
      }),
    ).toBeNull();
    expect(
      pairedQuizParentHref({
        ...base,
        quiz: quiz({ module_id: "module-2" }),
        dependentQuizzes: [quiz({ module_id: "module-2" })],
      }),
    ).toBeNull();
    expect(
      pairedQuizParentHref({
        ...base,
        quiz: quiz({ quiz_id: null }),
        dependentQuizzes: [quiz({ quiz_id: null })],
      }),
    ).toBeNull();
  });
});

type QuizFixture = {
  id: string;
  lesson_type: string;
  module_id: string;
  prerequisite_lesson_id: string;
  quiz_id: string | null;
};

function quiz(overrides: Partial<QuizFixture> = {}): QuizFixture {
  return {
    id: "quiz-1",
    lesson_type: "quiz",
    module_id: "module-1",
    prerequisite_lesson_id: "content-1",
    quiz_id: "quiz-record-1",
    ...overrides,
  };
}

function parent(
  overrides: {
    lesson_type?: string;
    module_id?: string;
    courseId?: string;
  } = {},
) {
  return {
    id: "content-1",
    lesson_type: overrides.lesson_type ?? "content",
    module_id: overrides.module_id ?? "module-1",
    modules: { course_id: overrides.courseId ?? "course-1" },
  };
}
