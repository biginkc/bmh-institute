import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let tableData: Record<string, unknown[]> = {};
let completedLessonIds = new Set<string>();
let lessonStatesError: { message: string } | null = null;
const rpcSpy = vi.fn();
const eqSpy = vi.fn();

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
              is_complete: completedLessonIds.has(lessonId),
              is_unlocked: true,
            })),
        error: lessonStatesError,
      };
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => {
          eqSpy(...args);
          return chain;
        },
        in: () => chain,
        order: () => chain,
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: tableData[table] ?? [], error: null }).then(
            resolve,
          ),
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

import DashboardPage from "./page";

describe("DashboardPage learner onboarding", () => {
  beforeEach(() => {
    tableData = {};
    completedLessonIds = new Set();
    lessonStatesError = null;
    rpcSpy.mockClear();
    eqSpy.mockClear();
  });

  it("lets RLS return the sole assigned unpublished QA program", async () => {
    tableData = {
      programs: [
        {
          id: "review-program",
          title: "BMH Employee Training Review",
          description: "Private course review",
          thumbnail_path: null,
          content_import_id: "bmh-employee-training-v1",
          course_order_mode: "sequential",
          is_published: false,
          sort_order: 0,
          program_courses: [],
        },
      ],
    };

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("BMH Employee Training Review");
    expect(html).toContain("Private review");
    expect(eqSpy).not.toHaveBeenCalledWith("is_published", true);
  });

  it("renders support-oriented copy when no programs are assigned", async () => {
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("No training assigned yet");
    expect(html).toContain("They can check your invite and role group.");
    expect(html).toContain("Check your profile");
    expect(html).toContain("Reset password");
    expect(html).toContain("Andrea");
  });

  it("renders the real resume target and progress in the BMH dashboard", async () => {
    tableData = {
      programs: [
        {
          id: "program-1",
          title: "VA Foundations",
          description: "Start here",
          thumbnail_path: "courses/va-foundations/v1/thumbnails/program.webp",
          content_import_id: "va-foundations-v1",
          course_order_mode: "sequential",
          is_published: true,
          sort_order: 0,
          program_courses: [
            {
              sort_order: 0,
              courses: {
                id: "course-1",
                title: "Getting Started",
                description: null,
                thumbnail_path: "courses/va-foundations/v1/thumbnails/course.webp",
                content_import_id: "va-foundations-v1",
                is_published: true,
              },
            },
          ],
        },
      ],
      modules: [
        {
          course_id: "course-1",
          sort_order: 0,
          lessons: [
            {
              id: "lesson-1",
              title: "Welcome to BMH Institute",
              sort_order: 0,
              is_required_for_completion: true,
              thumbnail_path: "courses/va-foundations/v1/thumbnails/welcome.webp",
              content_import_id: "va-foundations-v1",
            },
            {
              id: "lesson-2",
              title: "Your first task",
              sort_order: 1,
              is_required_for_completion: true,
              thumbnail_path: "courses/va-foundations/v1/thumbnails/first-task.webp",
              content_import_id: "va-foundations-v1",
            },
          ],
        },
      ],
    };
    completedLessonIds = new Set(["lesson-1"]);

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("In progress");
    expect(html).toContain("Getting Started");
    expect(html).toContain("Your first task");
    expect(html).toContain("Resume lesson");
    expect(html).toContain('href="/lessons/lesson-2"');
    expect(html).toContain("Complete required lessons");
    expect(html).toContain("1/2");
    expect(html).toContain("50%");
    expect(html).toContain("Continue learning");
    expect(html).toContain("Welcome to BMH Institute");
    expect(html).toContain("Password help");
    expect(html).toContain("https://signed.example/courses/va-foundations/v1/thumbnails/course.webp");
    expect(html).toContain("Getting Started course cover");
    expect(html).toContain("https://signed.example/courses/va-foundations/v1/thumbnails/program.webp");
    expect(html).toContain("VA Foundations program cover");
    expect(html).toContain("https://signed.example/courses/va-foundations/v1/thumbnails/first-task.webp");
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("loads dozens of lesson states with one RPC call", async () => {
    const lessons = Array.from({ length: 48 }, (_, index) => ({
      id: `lesson-${index + 1}`,
      title: `Lesson ${index + 1}`,
      sort_order: index,
      is_required_for_completion: true,
      thumbnail_path: null,
      content_import_id: "va-foundations-v1",
    }));
    tableData = {
      programs: [
        {
          id: "program-1",
          title: "VA Foundations",
          description: null,
          thumbnail_path: null,
          content_import_id: "va-foundations-v1",
          course_order_mode: "sequential",
          is_published: true,
          sort_order: 0,
          program_courses: [
            {
              sort_order: 0,
              courses: {
                id: "course-1",
                title: "Getting Started",
                description: null,
                thumbnail_path: null,
                content_import_id: "va-foundations-v1",
                is_published: true,
              },
            },
          ],
        },
      ],
      modules: [{ course_id: "course-1", sort_order: 0, lessons }],
    };

    await DashboardPage();

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith(
      "fn_lesson_states",
      expect.objectContaining({ p_lesson_ids: lessons.map((lesson) => lesson.id) }),
    );
  });

  it("renders a retry state instead of false progress when state verification fails", async () => {
    tableData = {
      programs: [
        {
          id: "program-1",
          title: "VA Foundations",
          description: null,
          thumbnail_path: null,
          content_import_id: "va-foundations-v1",
          course_order_mode: "sequential",
          is_published: true,
          sort_order: 0,
          program_courses: [{
            sort_order: 0,
            courses: {
              id: "course-1",
              title: "Getting Started",
              description: null,
              thumbnail_path: null,
              content_import_id: "va-foundations-v1",
              is_published: true,
            },
          }],
        },
      ],
      modules: [{
        course_id: "course-1",
        sort_order: 0,
        lessons: [{
          id: "lesson-1",
          title: "Lesson one",
          sort_order: 0,
          is_required_for_completion: true,
          thumbnail_path: null,
          content_import_id: "va-foundations-v1",
        }],
      }],
    };
    lessonStatesError = { message: "database unavailable" };

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("We couldn&#x27;t verify your lesson progress");
    expect(html).not.toContain("0/1");
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });
});
