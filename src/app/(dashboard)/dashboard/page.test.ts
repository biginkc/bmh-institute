import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let tableData: Record<string, unknown[]> = {};
let completedLessonIds = new Set<string>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "learner-1", email: "learner@example.com" } },
      }),
    },
    rpc: async (
      name: string,
      args: { p_lesson_id: string },
    ) => {
      if (name !== "fn_lesson_is_complete") {
        throw new Error(`Unexpected RPC: ${name}`);
      }
      return { data: completedLessonIds.has(args.p_lesson_id), error: null };
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
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
  });
});
