import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let selectSql = "";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => {
      const result = {
        data: [
          {
            id: "submission-1",
            status: "submitted",
            submitted_at: "2026-07-16T14:00:00.000Z",
            reviewer_notes: null,
            submission_text: "I confirmed access and documented my handoff.",
            submission_url: null,
            submission_file_path: null,
            user_id: "learner-1",
            lesson_id: "lesson-1",
            assignment_id: "assignment-1",
            profiles: { email: "learner@example.test", full_name: "Learner One" },
            assignments: {
              title: "Orientation Readiness Check",
              rubric: [
                {
                  criterion: "Systems readiness",
                  description: "Confirms access to every required system.",
                },
                {
                  criterion: "Service mindset",
                  description: "Explains how the learner will serve sellers respectfully.",
                },
              ],
            },
            lessons: { title: "Orientation assignment" },
          },
        ],
        error: null,
      };
      const chain = {
        select: (sql: string) => {
          selectSql = sql;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        eq: () => chain,
        then: (resolve: (value: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  })),
}));

import AdminSubmissionsPage from "./page";

describe("AdminSubmissionsPage assignment rubric", () => {
  it("puts the imported reviewer rubric beside the learner submission", async () => {
    const html = renderToStaticMarkup(
      await AdminSubmissionsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(selectSql).toContain("assignments ( title, rubric )");
    expect(html).toContain("Review rubric");
    expect(html).toContain("Systems readiness");
    expect(html).toContain("Confirms access to every required system.");
    expect(html).toContain("Service mindset");
    expect(html).toContain("I confirmed access and documented my handoff.");
  });
});
