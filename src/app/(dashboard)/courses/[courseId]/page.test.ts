import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const course = {
  id: "course-1",
  title: "Calls and objections",
  description: "Open strong and handle pushback.",
  is_published: true,
  modules: [
    {
      id: "module-1",
      title: "Getting on the call",
      description: "Start with the fundamentals.",
      sort_order: 1,
      lessons: [
        {
          id: "lesson-done",
          title: "Program orientation",
          description: null,
          lesson_type: "content",
          sort_order: 1,
          prerequisite_lesson_id: null,
          quiz_id: null,
          assignment_id: null,
          is_required_for_completion: true,
        },
        {
          id: "lesson-current",
          title: "Opening checkpoint",
          description: "Check your opening call knowledge.",
          lesson_type: "quiz",
          sort_order: 2,
          prerequisite_lesson_id: "lesson-done",
          quiz_id: "quiz-1",
          assignment_id: null,
          is_required_for_completion: true,
        },
        {
          id: "lesson-locked",
          title: "Record a role play",
          description: null,
          lesson_type: "assignment",
          sort_order: 3,
          prerequisite_lesson_id: "lesson-current",
          quiz_id: null,
          assignment_id: "assignment-1",
          is_required_for_completion: true,
        },
      ],
    },
  ],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "learner-1", email: "learner@example.com" } },
      }),
    },
    from: (table: string) => {
      const result =
        table === "courses"
          ? { data: course, error: null }
          : { data: [{ lesson_id: "lesson-done" }], error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => result,
        then: (resolve: (value: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  })),
}));

import CoursePage from "./page";

describe("CoursePage BMH learner presentation", () => {
  it("renders real progress plus completed, current, and locked lesson states", async () => {
    const html = renderToStaticMarkup(
      await CoursePage({ params: Promise.resolve({ courseId: "course-1" }) }),
    );

    expect(html).toContain("Calls and objections");
    expect(html).toContain("1 of 3 required lessons complete");
    expect(html).toContain('aria-label="Course progress"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('href="/lessons/lesson-current"');
    expect(html).not.toContain('href="/lessons/lesson-locked"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Locked");
    expect(html).toContain("Content");
    expect(html).toContain("Quiz");
    expect(html).toContain("Assignment");
  });
});
