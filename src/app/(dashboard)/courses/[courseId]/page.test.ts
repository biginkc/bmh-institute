import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { learnerOutlineFixture } from "@/lib/courses/learner-outline.test-helpers";

const { loadLearnerCourseOutline } = vi.hoisted(() => ({
  loadLearnerCourseOutline: vi.fn(),
}));
vi.mock("../../load-learner-outline", () => ({ loadLearnerCourseOutline }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } })),
}));
vi.mock("@/lib/content-blocks/sign-urls", () => ({
  signAuthorizedArtworkPaths: vi.fn(async () => new Map()),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }) }));

import CoursePage from "./page";

describe("CoursePage composite learner presentation", () => {
  beforeEach(() => {
    loadLearnerCourseOutline.mockReset();
    loadLearnerCourseOutline.mockResolvedValue({ ok: true, outline: learnerOutlineFixture() });
  });

  it("renders the 25-tile projection, private-review boundary, and module dividers", async () => {
    const html = renderToStaticMarkup(await CoursePage({ params: Promise.resolve({ courseId: "course-1" }) }));
    expect(html).toContain("Private review");
    expect(html).toContain("25 lessons · 2 complete");
    expect(html).toContain("Module 1");
    expect(html).toContain("Page 1 of 3");
    expect(html).not.toContain("Chapter");
  });

  it("renders an explicit error when the pairing projection fails closed", async () => {
    loadLearnerCourseOutline.mockResolvedValue({ ok: false, error: "Content lesson x requires exactly one dependent quiz; found 0." });
    const html = renderToStaticMarkup(await CoursePage({ params: Promise.resolve({ courseId: "course-1" }) }));
    expect(html).toContain("requires exactly one dependent quiz");
  });
});
