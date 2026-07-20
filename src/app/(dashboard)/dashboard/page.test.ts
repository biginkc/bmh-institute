import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { learnerOutlineFixture } from "@/lib/courses/learner-outline.test-helpers";

const mocks = vi.hoisted(() => ({
  loadLearnerCourseOutline: vi.fn(),
  programs: [] as unknown[],
}));
vi.mock("../load-learner-outline", () => ({
  loadLearnerCourseOutline: mocks.loadLearnerCourseOutline,
}));
vi.mock("@/lib/content-blocks/sign-urls", () => ({ signAuthorizedArtworkPaths: vi.fn(async () => new Map()) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({ select: () => ({ order: async () => ({ data: mocks.programs, error: null }) }) }),
  })),
}));

import DashboardPage from "./page";

function oneCourseProgram() {
  return [{
    id: "internal-1",
    title: "Internal grouping",
    description: null,
    thumbnail_path: null,
    content_import_id: null,
    thumbnail_asset_key: null,
    thumbnail_approved_path: null,
    thumbnail_approved_sha256: null,
    course_order_mode: "sequential",
    is_published: false,
    sort_order: 1,
    program_courses: [{ sort_order: 1, courses: { id: "course-1", title: "BMH Employee Training", description: null, thumbnail_path: null, content_import_id: null, thumbnail_asset_key: null, thumbnail_approved_path: null, thumbnail_approved_sha256: null, is_published: false } }],
  }];
}

describe("DashboardPage learner redesign", () => {
  beforeEach(() => {
    mocks.programs = oneCourseProgram();
    mocks.loadLearnerCourseOutline.mockReset();
    mocks.loadLearnerCourseOutline.mockResolvedValue({ ok: true, outline: learnerOutlineFixture() });
  });

  it("renders one compact resume banner, paginated tiles, and the all-lesson rail", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("Continue learning");
    expect(html).toContain("Lesson 3 · Topic 3");
    expect(html).toContain("25 lessons · 2 complete");
    expect(html.match(/Course progress/g)).toHaveLength(1);
    expect(html).not.toContain("Continue learning</h2>");
    expect(html).not.toContain("Program");
    expect(html).not.toContain("Chapter");
  });

  it("renders course-oriented support copy when no training is assigned", async () => {
    mocks.programs = [];
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("No training assigned yet");
    expect(html).toContain("no courses are assigned yet");
    expect(html).not.toContain("no programs");
  });
});
