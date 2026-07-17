// TEST-01: admin submission review actions update status, notify learners,
// and use the disambiguated learner profile relationship.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let updatePatch: Record<string, unknown> | null = null;
let updateError: { message: string } | null = null;
let selectSql = "";
let signedUrlError: { message: string } | null = null;
let reviewRubric: unknown = [
  { criterion: "Complete", description: "The learner completed the assignment." },
];

const sendEmailSpy = vi.fn(async (input: Record<string, unknown>) => {
  void input;
});

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    email: "admin@bmh.test",
    system_role: "owner",
  })),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (input: Record<string, unknown>) => sendEmailSpy(input),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    storage: {
      from: (bucket: string) => {
        if (bucket !== "submissions") {
          throw new Error(`Unexpected bucket ${bucket}`);
        }
        return {
          createSignedUrl: async (filePath: string) => ({
            data: signedUrlError
              ? null
              : { signedUrl: `https://signed.example/${filePath}` },
            error: signedUrlError,
          }),
        };
      },
    },
    from: (table: string) => {
      if (table !== "assignment_submissions") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        update: (patch: Record<string, unknown>) => {
          updatePatch = patch;
          return {
            eq: async () => ({ error: updateError }),
          };
        },
        select: (sql: string) => {
          selectSql = sql;
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "submission-1",
                  lesson_id: "lesson-1",
                  user_id: "learner-1",
                  profiles: {
                    email: "learner@bmh.test",
                    full_name: "Learner One",
                  },
                  assignments: { title: "Upload proof", rubric: reviewRubric },
                  lessons: { title: "Lesson one" },
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  approveSubmission,
  createSubmissionDownloadUrl,
  requestRevision,
} from "./actions";

describe("admin submission review actions (TEST-01)", () => {
  beforeEach(() => {
    updatePatch = null;
    updateError = null;
    selectSql = "";
    signedUrlError = null;
    reviewRubric = [
      { criterion: "Complete", description: "The learner completed the assignment." },
    ];
    sendEmailSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("approves a submission and notifies the learner", async () => {
    const result = await approveSubmission({
      submissionId: "submission-1",
      note: "Looks good.",
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({
      status: "approved",
      reviewer_notes: "Looks good.",
      reviewed_by: "admin-1",
    });
    expect(typeof updatePatch?.reviewed_at).toBe("string");
    expect(selectSql).toContain(
      "profiles!assignment_submissions_user_id_fkey",
    );
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses approval when the stored assignment rubric is invalid", async () => {
    reviewRubric = [{ criterion: "Incomplete", description: null }];

    const result = await approveSubmission({ submissionId: "submission-1" });

    expect(result).toEqual({
      ok: false,
      error: "Repair this assignment's review rubric before approving submissions.",
    });
    expect(updatePatch).toBeNull();
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("requires a revision note before writing", async () => {
    const result = await requestRevision({
      submissionId: "submission-1",
      note: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: "Leave a note explaining what to fix.",
    });
    expect(updatePatch).toBeNull();
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("requests revision and trims the reviewer note", async () => {
    const result = await requestRevision({
      submissionId: "submission-1",
      note: "  Please add a clearer file.  ",
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toMatchObject({
      status: "needs_revision",
      reviewer_notes: "Please add a clearer file.",
      reviewed_by: "admin-1",
    });
    expect(selectSql).toContain(
      "profiles!assignment_submissions_user_id_fkey",
    );
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces database update errors", async () => {
    updateError = { message: "update failed" };

    const result = await approveSubmission({
      submissionId: "submission-1",
    });

    expect(result).toEqual({ ok: false, error: "update failed" });
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("creates a signed download URL for admins", async () => {
    const result = await createSubmissionDownloadUrl("learner-1/file.pdf");

    expect(result).toEqual({
      ok: true,
      url: "https://signed.example/learner-1/file.pdf",
    });
  });
});
