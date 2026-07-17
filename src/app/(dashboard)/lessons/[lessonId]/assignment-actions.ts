"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderNewSubmissionEmail } from "@/lib/email/new-submission";
import { getAppUrl } from "@/lib/app-url";
import { emitSandraCourseCompletedForLesson } from "@/lib/integrations/sandra/course-completed";

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

type SubmissionType = "text" | "url" | "file_upload";

const MAX_SUBMISSION_TEXT_LENGTH = 20_000;
const MAX_SUBMISSION_URL_LENGTH = 2_048;
const MAX_SUBMISSION_FILE_PATH_LENGTH = 1_024;

export async function submitAssignment(input: {
  assignmentId: string;
  lessonId: string;
  submission_type: "text" | "url" | "file_upload";
  submission_text?: string;
  submission_url?: string;
  submission_file_path?: string;
}): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: lessonRow, error: lessonError } = await supabase
    .from("lessons")
    .select("assignment_id")
    .eq("id", input.lessonId)
    .maybeSingle();
  if (lessonError || lessonRow?.assignment_id !== input.assignmentId) {
    return { ok: false, error: "This assignment does not belong to the lesson." };
  }

  const { data: unlocked } = await supabase.rpc("fn_lesson_is_unlocked", {
    p_user_id: user.id,
    p_lesson_id: input.lessonId,
  });
  if (unlocked !== true) {
    return { ok: false, error: "Complete the prerequisite lessons first." };
  }

  // Resolve the authored submission type and review policy only after proving
  // that the assignment is bound to the submitted lesson.
  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("assignments")
    .select("submission_type, requires_review")
    .eq("id", input.assignmentId)
    .maybeSingle();
  const authoredType = assignmentRow?.submission_type;
  if (
    assignmentError ||
    !assignmentRow ||
    !isSubmissionType(authoredType) ||
    input.submission_type !== authoredType
  ) {
    return {
      ok: false,
      error: "Submission type does not match this assignment.",
    };
  }

  const normalized = normalizeSubmission(input, authoredType, user.id);
  if (!normalized.ok) return normalized;

  if (authoredType === "file_upload") {
    const filePath = normalized.submission_file_path;
    if (!filePath) {
      return { ok: false, error: "Upload a file before submitting." };
    }
    const fileName = filePath.split("/")[1];
    const { data: objects, error: storageError } = await supabase.storage
      .from("submissions")
      .list(user.id, { limit: 100, search: fileName });
    if (
      storageError ||
      !(objects ?? []).some(
        (object) => object.name === fileName && Boolean(object.id),
      )
    ) {
      return {
        ok: false,
        error: "The uploaded file could not be verified. Upload it again.",
      };
    }
  }

  const requiresReview = assignmentRow.requires_review;
  const status = requiresReview ? "submitted" : "approved";

  const { data: activeSubmission, error: activeSubmissionError } = await supabase
    .from("assignment_submissions")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("assignment_id", input.assignmentId)
    .in("status", ["submitted", "approved"])
    .limit(1)
    .maybeSingle();
  if (activeSubmissionError) {
    return { ok: false, error: activeSubmissionError.message };
  }
  if (activeSubmission?.status === "submitted") {
    return {
      ok: false,
      error: "This assignment is already awaiting review.",
    };
  }
  if (activeSubmission?.status === "approved") {
    return { ok: false, error: "This assignment is already approved." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Admin client unavailable.",
    };
  }
  const { error } = await admin.from("assignment_submissions").insert({
    assignment_id: input.assignmentId,
    lesson_id: input.lessonId,
    user_id: user.id,
    submission_text: normalized.submission_text,
    submission_url: normalized.submission_url,
    submission_file_path: normalized.submission_file_path,
    status,
    // Auto-approved submissions have no human reviewer; stamp the time so they
    // don't read as "pending" in admin views.
    reviewed_at: requiresReview ? null : new Date().toISOString(),
  });
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "This assignment already has an active submission."
          : error.message,
    };
  }

  // Only ping admins when there's actually something to review. Auto-completed
  // submissions need no action. Fire-and-forget so SMTP hiccups don't roll back
  // the submission.
  if (requiresReview) {
    await notifyAdminsOfNewSubmission({
      supabase: admin,
      learnerId: user.id,
      assignmentId: input.assignmentId,
      lessonId: input.lessonId,
      kind:
        input.submission_type === "text"
          ? "text"
          : input.submission_type === "url"
            ? "url"
            : "file",
      preview:
        authoredType === "text"
          ? (normalized.submission_text ?? "")
          : authoredType === "url"
            ? (normalized.submission_url ?? "")
            : filenameFromPath(normalized.submission_file_path),
    });
  } else {
    await emitSandraCourseCompletedForLesson(supabase, {
      userId: user.id,
      lessonId: input.lessonId,
    });
  }

  revalidatePath(`/lessons/${input.lessonId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/admin/submissions`);
  return { ok: true };
}

async function notifyAdminsOfNewSubmission(input: {
  supabase: ReturnType<typeof createAdminClient>;
  learnerId: string;
  assignmentId: string;
  lessonId: string;
  kind: "text" | "url" | "file";
  preview: string;
}): Promise<void> {
  const [learnerRes, assignmentRes, lessonRes, adminsRes] = await Promise.all([
    input.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", input.learnerId)
      .maybeSingle(),
    input.supabase
      .from("assignments")
      .select("title")
      .eq("id", input.assignmentId)
      .maybeSingle(),
    input.supabase
      .from("lessons")
      .select("title")
      .eq("id", input.lessonId)
      .maybeSingle(),
    input.supabase
      .from("profiles")
      .select("email, full_name")
      .in("system_role", ["owner", "admin"])
      .eq("status", "active"),
  ]);

  const learner = learnerRes.data as
    | { full_name: string; email: string }
    | null;
  const assignment = assignmentRes.data as { title: string } | null;
  const lesson = lessonRes.data as { title: string } | null;
  const admins = (adminsRes.data ?? []) as Array<{
    email: string;
    full_name: string;
  }>;

  if (!learner || admins.length === 0) return;

  const submissionsUrl = `${getAppUrl()}/admin/submissions`;

  const rendered = renderNewSubmissionEmail({
    learnerName: learner.full_name || learner.email,
    learnerEmail: learner.email,
    assignmentTitle: assignment?.title ?? "Assignment",
    lessonTitle: lesson?.title ?? "Lesson",
    submissionKind: input.kind,
    submissionPreview: input.preview,
    submissionsUrl,
  });

  await Promise.all(
    admins.map((a) =>
      sendEmail({
        to: a.email,
        subject: rendered.subject,
        html: rendered.html,
      }),
    ),
  );
}

function filenameFromPath(p: string | null): string {
  if (!p) return "file";
  const last = p.split("/").pop() ?? "file";
  return last.replace(/^\d+-/, "");
}

function normalizeSubmission(
  input: {
    submission_text?: string;
    submission_url?: string;
    submission_file_path?: string;
  },
  authoredType: SubmissionType,
  userId: string,
):
  | {
      ok: true;
      submission_text: string | null;
      submission_url: string | null;
      submission_file_path: string | null;
    }
  | { ok: false; error: string } {
  const text = typeof input.submission_text === "string"
    ? input.submission_text.trim()
    : "";
  const url = typeof input.submission_url === "string"
    ? input.submission_url.trim()
    : "";
  const filePath = typeof input.submission_file_path === "string"
    ? input.submission_file_path.trim()
    : "";
  const suppliedPayloads = [text, url, filePath].filter(Boolean).length;
  if (suppliedPayloads !== 1) {
    return { ok: false, error: "Submit exactly one response for this assignment." };
  }

  if (authoredType === "text") {
    if (!text) {
      return { ok: false, error: "Write your response before submitting." };
    }
    if (text.length > MAX_SUBMISSION_TEXT_LENGTH) {
      return { ok: false, error: "Your response is too long." };
    }
    return {
      ok: true,
      submission_text: text,
      submission_url: null,
      submission_file_path: null,
    };
  }

  if (authoredType === "url") {
    if (
      !url ||
      url.length > MAX_SUBMISSION_URL_LENGTH ||
      !isValidHttpUrl(url)
    ) {
      return { ok: false, error: "Enter a valid http(s) URL." };
    }
    return {
      ok: true,
      submission_text: null,
      submission_url: url,
      submission_file_path: null,
    };
  }

  if (
    !filePath ||
    filePath.length > MAX_SUBMISSION_FILE_PATH_LENGTH ||
    !pathBelongsToUser(filePath, userId)
  ) {
    return {
      ok: false,
      error: "Upload a file from your account before submitting.",
    };
  }
  return {
    ok: true,
    submission_text: null,
    submission_url: null,
    submission_file_path: filePath,
  };
}

function isSubmissionType(value: unknown): value is SubmissionType {
  return value === "text" || value === "url" || value === "file_upload";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function pathBelongsToUser(path: string, userId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 2 &&
    parts[0] === userId &&
    Boolean(parts[1]) &&
    parts[1] !== "." &&
    parts[1] !== ".." &&
    !parts[1].includes("\\")
  );
}
