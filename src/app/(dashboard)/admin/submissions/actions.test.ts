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
let requiresReview = true;
let reviewSelectSql = "";
let reviewLookupError: { message: string } | null = null;
let updateMatched = true;
let currentReviewStatus = "submitted";
let currentReviewerNotes: string | null = null;
let currentReviewedBy: string | null = null;
let committedReviewAfterUpdate: {
  status: string;
  reviewerNotes: string | null;
  reviewedBy: string | null;
} | null = null;

const { afterEffects, sendEmailSpy } = vi.hoisted(() => ({
  afterEffects: [] as Array<Promise<unknown>>,
  sendEmailSpy: vi.fn(async (input: Record<string, unknown>): Promise<{
    ok: boolean;
    messageId?: string;
    skipped?: boolean;
    error?: string;
  }> => {
    void input;
    return { ok: true, messageId: "test-message" };
  }),
}));

vi.mock("next/server", () => ({
  after: (effect: () => Promise<unknown>) => {
    afterEffects.push(Promise.resolve().then(effect));
  },
}));

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
          const query = {
            eq: () => query,
            select: () => query,
            maybeSingle: async () => {
              if (!updateMatched && committedReviewAfterUpdate) {
                currentReviewStatus = committedReviewAfterUpdate.status;
                currentReviewerNotes = committedReviewAfterUpdate.reviewerNotes;
                currentReviewedBy = committedReviewAfterUpdate.reviewedBy;
              }
              return {
                data: updateMatched ? { id: "submission-1" } : null,
                error: updateError,
              };
            },
          };
          return query;
        },
        select: (sql: string) => {
          selectSql = sql;
          if (sql.includes("rubric")) reviewSelectSql = sql;
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: reviewLookupError ? null : {
                  id: "submission-1",
                  status: currentReviewStatus,
                  reviewer_notes: currentReviewerNotes,
                  reviewed_by: currentReviewedBy,
                  lesson_id: "lesson-1",
                  user_id: "learner-1",
                  profiles: {
                    email: "learner@bmh.test",
                    full_name: "Learner One",
                  },
                  assignments: {
                    title: "Upload proof",
                    rubric: reviewRubric,
                    requires_review: requiresReview,
                  },
                  lessons: { title: "Lesson one" },
                },
                error: reviewLookupError,
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
    requiresReview = true;
    reviewSelectSql = "";
    reviewLookupError = null;
    updateMatched = true;
    currentReviewStatus = "submitted";
    currentReviewerNotes = null;
    currentReviewedBy = null;
    committedReviewAfterUpdate = null;
    sendEmailSpy.mockClear();
    afterEffects.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("approves a submission and notifies the learner", async () => {
    const result = await approveSubmission({
      submissionId: "submission-1",
      note: "Looks good.",
    });
    await flushAfterEffects();

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

  it("returns approval success after commit when learner email fails", async () => {
    sendEmailSpy.mockResolvedValueOnce({
      ok: false,
      skipped: false,
      error: "SMTP unavailable",
    });

    await expect(approveSubmission({
      submissionId: "submission-1",
      note: "Looks good.",
    })).resolves.toEqual({ ok: true });
    await flushAfterEffects();
    expect(updatePatch).toMatchObject({ status: "approved" });
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

  it("denies approval when catalog-aware RLS hides a private imported submission", async () => {
    reviewLookupError = { message: "permission denied" };

    await expect(approveSubmission({ submissionId: "private-submission" })).resolves.toEqual({
      ok: false,
      error: "Submission not found.",
    });
    expect(updatePatch).toBeNull();
  });

  it("refuses a reviewed assignment when the stored rubric is empty", async () => {
    reviewRubric = [];

    const result = await approveSubmission({ submissionId: "submission-1" });

    expect(reviewSelectSql).toContain("requires_review");
    expect(result).toEqual({
      ok: false,
      error: "Repair this assignment's review rubric before approving submissions.",
    });
    expect(updatePatch).toBeNull();
  });

  it("does not require rubric items for an assignment configured without review", async () => {
    reviewRubric = [];
    requiresReview = false;

    const result = await approveSubmission({ submissionId: "submission-1" });

    expect(result).toEqual({ ok: true });
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
    await flushAfterEffects();

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

  it("denies revision when catalog-aware RLS hides a private imported submission", async () => {
    reviewLookupError = { message: "permission denied" };

    await expect(requestRevision({
      submissionId: "private-submission",
      note: "Please revise.",
    })).resolves.toEqual({ ok: false, error: "Submission not found." });
    expect(updatePatch).toBeNull();
  });

  it("returns revision success after commit when learner email fails", async () => {
    sendEmailSpy.mockResolvedValueOnce({
      ok: false,
      skipped: false,
      error: "SMTP unavailable",
    });

    await expect(requestRevision({
      submissionId: "submission-1",
      note: "Please add more detail.",
    })).resolves.toEqual({ ok: true });
    await flushAfterEffects();
    expect(updatePatch).toMatchObject({ status: "needs_revision" });
  });

  it("surfaces database update errors", async () => {
    updateError = { message: "update failed" };

    const result = await approveSubmission({
      submissionId: "submission-1",
    });

    expect(result).toEqual({ ok: false, error: "update failed" });
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("refuses to rewrite a submission that another reviewer already decided", async () => {
    updateMatched = false;

    const result = await requestRevision({
      submissionId: "submission-1",
      note: "Please revise this.",
    });

    expect(result).toEqual({
      ok: false,
      error: "This submission was already reviewed.",
    });
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("accepts an exact approval retry after the original response was lost", async () => {
    updateMatched = false;
    currentReviewStatus = "approved";
    currentReviewerNotes = "Looks good.";
    currentReviewedBy = "admin-1";

    await expect(approveSubmission({
      submissionId: "submission-1",
      note: "Looks good.",
    })).resolves.toEqual({ ok: true });
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("accepts an exact approval committed by a concurrent request after lookup", async () => {
    updateMatched = false;
    committedReviewAfterUpdate = {
      status: "approved",
      reviewerNotes: "Looks good.",
      reviewedBy: "admin-1",
    };

    await expect(approveSubmission({
      submissionId: "submission-1",
      note: "Looks good.",
    })).resolves.toEqual({ ok: true });
  });

  it("accepts an exact revision retry but rejects a different decision", async () => {
    updateMatched = false;
    currentReviewStatus = "needs_revision";
    currentReviewerNotes = "Add detail.";
    currentReviewedBy = "admin-1";

    await expect(requestRevision({
      submissionId: "submission-1",
      note: "  Add detail.  ",
    })).resolves.toEqual({ ok: true });
    await expect(approveSubmission({
      submissionId: "submission-1",
      note: "Looks good.",
    })).resolves.toEqual({
      ok: false,
      error: "This submission was already reviewed.",
    });
  });

  it("creates a signed download URL for admins", async () => {
    const result = await createSubmissionDownloadUrl("learner-1/file.pdf");

    expect(result).toEqual({
      ok: true,
      url: "https://signed.example/learner-1/file.pdf",
    });
  });

  it("does not sign a private imported submission file hidden by storage RLS", async () => {
    signedUrlError = { message: "Object not found" };

    await expect(
      createSubmissionDownloadUrl("private-reviewer/private-evidence.pdf"),
    ).resolves.toEqual({ ok: false, error: "Object not found" });
  });
});

async function flushAfterEffects(): Promise<void> {
  await Promise.all(afterEffects.splice(0));
}
