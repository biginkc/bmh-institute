// INTEG-04: assignment upload paths must be scoped to the authenticated user.
// The rejection test asserts the action returns before inserting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { sendEmailSpy } = vi.hoisted(() => ({
  sendEmailSpy: vi.fn(async (message: { to: string; html: string }) => {
    void message;
  }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailSpy,
}));

type InsertError = { message: string; code?: string } | null;

const insertSpy = vi.fn(async (row: Record<string, unknown>): Promise<{ error: InsertError }> => {
  void row;
  return { error: null };
});
const adminFromSpy = vi.fn();
let insertedRow: Record<string, unknown> | null = null;
let lessonAssignmentId = "assignment-1";
let lessonUnlocked = true;
let assignmentRequiresReview = true;
let assignmentSubmissionType: "text" | "url" | "file_upload" = "file_upload";
let storageObjectExists = true;
let storageListError: { message: string } | null = null;
let activeSubmission: { id: string; status: "submitted" | "approved" } | null = null;
let activeSubmissionError: { message: string } | null = null;
let adminRecipients: Array<{
  email: string;
  full_name: string;
  system_role: "owner" | "admin";
  status: "active" | "invited" | "suspended";
}> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      adminFromSpy(table);
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
                data: { full_name: "Learner One", email: "learner@bmh.test" },
                error: null,
              }),
            }),
            in: () => ({
              eq: async (field: string, value: string) => ({
                data:
                  field === "status"
                    ? adminRecipients.filter((profile) => profile.status === value)
                    : [],
                error: null,
              }),
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
      throw new Error(`Unexpected admin table: ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: "user-1", email: "learner@bmh.test" },
        },
      }),
    },
    rpc: async (name: string) => {
      if (name !== "fn_lesson_is_unlocked") {
        throw new Error(`Unexpected rpc: ${name}`);
      }
      return { data: lessonUnlocked, error: null };
    },
    storage: {
      from: (bucket: string) => {
        if (bucket !== "submissions") {
          throw new Error(`Unexpected storage bucket: ${bucket}`);
        }
        return {
          list: async (folder: string, options: { search?: string }) => {
            if (folder !== "user-1") {
              throw new Error(`Unexpected storage folder: ${folder}`);
            }
            return {
              data: storageObjectExists
                ? [{ id: "object-1", name: options.search }]
                : [],
              error: storageListError,
            };
          },
        };
      },
    },
    from: (table: string) => {
      if (table === "assignment_submissions") {
        const query = {
          eq: () => query,
          in: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: activeSubmission,
            error: activeSubmissionError,
          }),
        };
        return { select: () => query };
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
                data: {
                  title: "Upload assignment",
                  requires_review: assignmentRequiresReview,
                  submission_type: assignmentSubmissionType,
                },
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
                data: {
                  title: "Lesson one",
                  assignment_id: lessonAssignmentId,
                },
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
    lessonAssignmentId = "assignment-1";
    lessonUnlocked = true;
    assignmentRequiresReview = true;
    assignmentSubmissionType = "file_upload";
    storageObjectExists = true;
    storageListError = null;
    activeSubmission = null;
    activeSubmissionError = null;
    adminRecipients = [];
    insertSpy.mockReset();
    insertSpy.mockResolvedValue({ error: null });
    adminFromSpy.mockClear();
    sendEmailSpy.mockClear();
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
    expect(adminFromSpy).toHaveBeenCalledWith("profiles");
  });

  it("emails submission content only to active administrators", async () => {
    assignmentSubmissionType = "text";
    adminRecipients = [
      {
        email: "active-admin@bmh.test",
        full_name: "Active Admin",
        system_role: "admin",
        status: "active",
      },
      {
        email: "suspended-owner@bmh.test",
        full_name: "Suspended Owner",
        system_role: "owner",
        status: "suspended",
      },
      {
        email: "invited-admin@bmh.test",
        full_name: "Invited Admin",
        system_role: "admin",
        status: "invited",
      },
    ];

    await expect(
      submitAssignment({
        assignmentId: "assignment-1",
        lessonId: "lesson-1",
        submission_type: "text",
        submission_text: "Sensitive learner response",
      }),
    ).resolves.toEqual({ ok: true });

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "active-admin@bmh.test",
        html: expect.stringContaining("Sensitive learner response"),
      }),
    );
    expect(sendEmailSpy.mock.calls.flatMap(([message]) => [message.to])).not.toContain(
      "suspended-owner@bmh.test",
    );
    expect(sendEmailSpy.mock.calls.flatMap(([message]) => [message.to])).not.toContain(
      "invited-admin@bmh.test",
    );
  });

  it("rejects a user-scoped file path when the exact storage object does not exist", async () => {
    storageObjectExists = false;

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "file_upload",
      submission_file_path: "user-1/missing.pdf",
    });

    expect(result).toEqual({
      ok: false,
      error: "The uploaded file could not be verified. Upload it again.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects a client submission type that differs from the authored assignment", async () => {
    assignmentSubmissionType = "text";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "url",
      submission_url: "https://example.com/work",
    });

    expect(result).toEqual({
      ok: false,
      error: "Submission type does not match this assignment.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects multiple supplied payloads", async () => {
    assignmentSubmissionType = "text";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "My answer",
      submission_url: "https://example.com/extra",
    });

    expect(result).toEqual({
      ok: false,
      error: "Submit exactly one response for this assignment.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects text beyond the server-side payload limit", async () => {
    assignmentSubmissionType = "text";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "x".repeat(20_001),
    });

    expect(result).toEqual({ ok: false, error: "Your response is too long." });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects an http(s) prefix without a hostname", async () => {
    assignmentSubmissionType = "url";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "url",
      submission_url: "https://",
    });

    expect(result).toEqual({ ok: false, error: "Enter a valid http(s) URL." });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("accepts a parsed http(s) URL with a hostname", async () => {
    assignmentSubmissionType = "url";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "url",
      submission_url: "https://example.com/work?id=1",
    });

    expect(result).toEqual({ ok: true });
    expect(insertedRow).toMatchObject({
      submission_text: null,
      submission_url: "https://example.com/work?id=1",
      submission_file_path: null,
    });
  });

  it("refuses a second submission while review is pending", async () => {
    assignmentSubmissionType = "text";
    activeSubmission = { id: "submission-1", status: "submitted" };

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "Duplicate answer",
    });

    expect(result).toEqual({
      ok: false,
      error: "This assignment is already awaiting review.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("turns a concurrent active-submission conflict into a stable learner error", async () => {
    assignmentSubmissionType = "text";
    insertSpy.mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "Racing answer",
    });

    expect(result).toEqual({
      ok: false,
      error: "This assignment already has an active submission.",
    });
  });

  it("rejects a client-supplied assignment id that is not attached to the lesson", async () => {
    assignmentSubmissionType = "text";
    lessonAssignmentId = "assignment-2";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "My answer",
    });

    expect(result).toEqual({
      ok: false,
      error: "This assignment does not belong to the lesson.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(insertedRow).toBeNull();
  });

  it("rejects submissions for locked lessons before insert", async () => {
    lessonUnlocked = false;
    assignmentSubmissionType = "text";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "My answer",
    });

    expect(result).toEqual({
      ok: false,
      error: "Complete the prerequisite lessons first.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(insertedRow).toBeNull();
  });

  it("auto-approves a bound unlocked assignment that does not require review", async () => {
    assignmentRequiresReview = false;
    assignmentSubmissionType = "text";

    const result = await submitAssignment({
      assignmentId: "assignment-1",
      lessonId: "lesson-1",
      submission_type: "text",
      submission_text: "My answer",
    });

    expect(result).toEqual({ ok: true });
    expect(insertedRow).toMatchObject({
      assignment_id: "assignment-1",
      lesson_id: "lesson-1",
      user_id: "user-1",
      submission_text: "My answer",
      status: "approved",
    });
    expect(insertedRow?.reviewed_at).toEqual(expect.any(String));
  });
});
