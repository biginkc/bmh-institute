// INTEG-04: assignment upload paths must be scoped to the authenticated user.
// The rejection test asserts the action returns before inserting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

let insertSpy = vi.fn(async (_row: Record<string, unknown>) => ({
  error: null,
}));
let insertedRow: Record<string, unknown> | null = null;

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
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  full_name: "Learner One",
                  email: "learner@bmh.test",
                },
                error: null,
              }),
            }),
            in: async () => ({
              data: [],
              error: null,
            }),
          }),
        };
      }
      if (table === "assignments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { title: "Upload assignment" },
                error: null,
              }),
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

describe("submitAssignment (INTEG-04 file path validation)", () => {
  beforeEach(() => {
    insertedRow = null;
    insertSpy.mockReset();
    insertSpy.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a file path outside the authenticated user's storage prefix before insert", async () => {
    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "file_upload",
      submission_file_path: "other-user/assignment.pdf",
    });

    expect(result).toEqual({
      ok: false,
      error: "Upload a file from your account before submitting.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(insertedRow).toBeNull();
  });

  it("accepts a file path inside the authenticated user's storage prefix", async () => {
    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "file_upload",
      submission_file_path: "user-1/assignment.pdf",
    });

    expect(result).toEqual({ ok: true });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertedRow).toMatchObject({
      assignment_id: "assignment-1",
      lesson_id: "lesson-1",
      user_id: "user-1",
      submission_file_path: "user-1/assignment.pdf",
      status: "submitted",
    });
  });
});

