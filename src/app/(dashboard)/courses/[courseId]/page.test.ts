import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const course = {
  id: "course-1",
  title: "Calls and objections",
  description: "Open strong and handle pushback.",
  thumbnail_path: "courses/calls-and-objections/v1/thumbnails/cover.webp",
  content_import_id: "calls-and-objections-v1",
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
const baseLessons = course.modules[0].lessons;
let courseLessons = baseLessons;
let lessonStatesError: { message: string } | null = null;
const rpcSpy = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "learner-1", email: "learner@example.com" } },
      }),
    },
    rpc: async (
      name: string,
      args: { p_lesson_ids: string[] },
    ) => {
      rpcSpy(name, args);
      if (name !== "fn_lesson_states") {
        throw new Error(`Unexpected RPC: ${name}`);
      }
      return {
        data: lessonStatesError
          ? null
          : args.p_lesson_ids.map((lessonId) => ({
              lesson_id: lessonId,
              is_complete: lessonId === "lesson-done",
              is_unlocked: lessonId !== "lesson-locked",
            })),
        error: lessonStatesError,
      };
    },
    from: (table: string) => {
      const result = table === "courses"
        ? {
            data: {
              ...course,
              modules: [{ ...course.modules[0], lessons: courseLessons }],
            },
            error: null,
          }
        : { data: [], error: null };
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

vi.mock("@/lib/content-blocks/sign-urls", () => ({
  signAuthorizedArtworkPaths: vi.fn(async (requests: Array<{ entityType: string; entityId: string; path: string | null }>) =>
    new Map(requests.flatMap(({ entityType, entityId, path }) => path ? [[`${entityType}:${entityId}`, `https://signed.example/${path}`] as const] : [])),
  ),
}));

import CoursePage from "./page";

describe("CoursePage BMH learner presentation", () => {
  beforeEach(() => {
    courseLessons = baseLessons;
    lessonStatesError = null;
    rpcSpy.mockClear();
  });

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
    expect(html).toContain("https://signed.example/courses/calls-and-objections/v1/thumbnails/cover.webp");
    expect(html).toContain("Calls and objections course cover");
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("loads dozens of course lesson states with one RPC call", async () => {
    courseLessons = Array.from({ length: 48 }, (_, index) => ({
      ...baseLessons[0],
      id: `lesson-${index + 1}`,
      title: `Lesson ${index + 1}`,
      sort_order: index,
      prerequisite_lesson_id: null,
    })) as typeof baseLessons;

    await CoursePage({ params: Promise.resolve({ courseId: "course-1" }) });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith(
      "fn_lesson_states",
      expect.objectContaining({
        p_lesson_ids: courseLessons.map((lesson) => lesson.id),
      }),
    );
  });

  it("renders a retry state instead of false progress when state verification fails", async () => {
    lessonStatesError = { message: "database unavailable" };

    const html = renderToStaticMarkup(
      await CoursePage({ params: Promise.resolve({ courseId: "course-1" }) }),
    );

    expect(html).toContain("We couldn&#x27;t verify your lesson progress");
    expect(html).not.toContain("0 of 3 required lessons complete");
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });
});
