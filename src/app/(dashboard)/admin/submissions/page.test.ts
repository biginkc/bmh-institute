import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let selectSql = "";
let queryError: { message: string } | null = null;
let rubric: unknown = [
  { criterion: "Systems readiness", description: "Confirms access to every required system." },
  { criterion: "Service mindset", description: "Explains how the learner will serve sellers respectfully." },
];
let requiresReview = true;

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
              rubric,
              requires_review: requiresReview,
            },
            lessons: { title: "Orientation assignment" },
          },
        ],
        error: queryError,
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
  beforeEach(() => {
    queryError = null;
    rubric = [
      { criterion: "Systems readiness", description: "Confirms access to every required system." },
      { criterion: "Service mindset", description: "Explains how the learner will serve sellers respectfully." },
    ];
    requiresReview = true;
  });

  it("blocks review controls when a reviewed assignment has no rubric items", async () => {
    rubric = [];
    const html = renderToStaticMarkup(
      await AdminSubmissionsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(selectSql).toContain("requires_review");
    expect(html).toContain("review rubric is missing");
    expect(html).not.toContain(">Approve</button>");
  });

  it("puts the imported reviewer rubric beside the learner submission", async () => {
    const html = renderToStaticMarkup(
      await AdminSubmissionsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(selectSql).toContain(
      "assignments ( title, rubric, requires_review )",
    );
    expect(html).toContain("Review rubric");
    expect(html).toContain("Systems readiness");
    expect(html).toContain("Confirms access to every required system.");
    expect(html).toContain("Service mindset");
    expect(html).toContain("I confirmed access and documented my handoff.");
  });

  it("shows a data-integrity alert instead of silently dropping a corrupt rubric", async () => {
    rubric = [{ criterion: "Valid", description: null }];
    const html = renderToStaticMarkup(
      await AdminSubmissionsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("review rubric is invalid");
    expect(html).not.toContain("Review rubric</h3>");
    expect(html).not.toContain(">Approve</button>");
    expect(html).not.toContain(">Request revision</button>");
  });

  it("does not describe a failed submissions query as an empty queue", async () => {
    queryError = { message: "database unavailable" };
    const html = renderToStaticMarkup(
      await AdminSubmissionsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("couldn&#x27;t load submissions");
    expect(html).not.toContain("all caught up");
  });
});
