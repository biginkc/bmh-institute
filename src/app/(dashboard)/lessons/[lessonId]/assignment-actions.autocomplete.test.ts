// Auto-completion contract: when an assignment has requires_review = false, the
// submission must be inserted with status 'approved' so the DB trigger
// `trg_after_assignment_approved` fires and the lesson is marked complete. When
// requires_review = true, it must stay 'submitted' and await admin review.
// This mirrors assignment-actions.test.ts but makes requires_review configurable.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const sendEmailSpy = vi.fn(async (args: unknown) => {
  void args;
});
vi.mock("@/lib/email/send", () => ({
  sendEmail: (args: unknown) => sendEmailSpy(args),
}));

const insertSpy = vi.fn(async (row: Record<string, unknown>) => {
  void row;
  return { error: null };
});
let insertedRow: Record<string, unknown> | null = null;

// Flipped per-test to drive the review policy returned by the assignments row.
let assignmentRequiresReview = true;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: "user-1", email: "learner@bmh.test" },
        },
      }),
    },
    from: (table: string) => {
      if (table === "assignment_submissions") {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedRow = row;
            return insertSpy(row);
          },
        };
      }
      if (table === "assignments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  title: "Auto assignment",
                  requires_review: assignmentRequiresReview,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { full_name: "Learner One", email: "learner@bmh.test" },
                error: null,
              }),
            }),
            // Admins list — kept non-empty so we can prove the notify email is
            // suppressed by policy, not just by an empty recipient list.
            in: async () => ({
              data: [{ email: "admin@bmh.test", full_name: "Admin" }],
              error: null,
            }),
          }),
        };
      }
      if (table === "lessons") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { title: "Lesson one" },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  })),
}));

import { submitAssignment } from "./assignment-actions";

describe("submitAssignment auto-completion (requires_review policy)", () => {
  beforeEach(() => {
    insertedRow = null;
    insertSpy.mockReset();
    insertSpy.mockResolvedValue({ error: null });
    sendEmailSpy.mockReset();
    sendEmailSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("inserts status 'approved' when the assignment does not require review (fires completion trigger)", async () => {
    assignmentRequiresReview = false;

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "My answer",
    });

    expect(result).toEqual({ ok: true });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    // status 'approved' is the precondition trg_after_assignment_approved
    // checks before inserting the user_lesson_completions row.
    expect(insertedRow).toMatchObject({
      assignment_id: "assignment-1",
      lesson_id: "lesson-1",
      user_id: "user-1",
      status: "approved",
    });
    expect(insertedRow?.reviewed_at).toEqual(expect.any(String));
    // No admin review is needed, so no "please review" email goes out.
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("inserts status 'submitted' and notifies admins when review is required", async () => {
    assignmentRequiresReview = true;

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "My answer",
    });

    expect(result).toEqual({ ok: true });
    expect(insertedRow).toMatchObject({ status: "submitted" });
    expect(insertedRow?.reviewed_at).toBeNull();
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });
});
