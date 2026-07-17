"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { getAppUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { emitSandraCourseCompletedForLesson } from "@/lib/integrations/sandra/course-completed";
import { parseAssignmentRubric } from "@/lib/assignments/rubric";
import {
  renderApprovedEmail,
  renderRevisionEmail,
  type ReviewEmailInput,
} from "@/lib/email/review";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveSubmission(input: {
  submissionId: string;
  note?: string;
}): Promise<ActionResult> {
  const reviewer = await requireAdmin();
  const supabase = await createClient();

  const { data: reviewRow, error: reviewLookupError } = await supabase
    .from("assignment_submissions")
    .select("assignments ( rubric, requires_review )")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (reviewLookupError || !reviewRow) {
    return { ok: false, error: "Submission not found." };
  }
  const assignment = firstRow(reviewRow.assignments) as
    | { rubric: unknown; requires_review: boolean }
    | null;
  const rubric = parseAssignmentRubric(assignment?.rubric);
  if (
    !assignment ||
    !rubric.ok ||
    (assignment.requires_review && rubric.items.length === 0)
  ) {
    return {
      ok: false,
      error: "Repair this assignment's review rubric before approving submissions.",
    };
  }

  const { error } = await supabase
    .from("assignment_submissions")
    .update({
      status: "approved",
      reviewer_notes: input.note ?? null,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.submissionId);
  if (error) return { ok: false, error: error.message };

  await emitCompletionForApprovedSubmission(supabase, input.submissionId);

  // Fire-and-forget email — SMTP hiccups shouldn't block the approval.
  await notifyReview({
    submissionId: input.submissionId,
    kind: "approved",
    note: input.note ?? "",
  });

  revalidatePath("/admin/submissions");
  revalidatePath("/dashboard");
  return { ok: true };
}

async function emitCompletionForApprovedSubmission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
): Promise<void> {
  const { data: row } = await supabase
    .from("assignment_submissions")
    .select("lesson_id, user_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!row?.lesson_id || !row?.user_id) return;

  await emitSandraCourseCompletedForLesson(supabase, {
    userId: row.user_id,
    lessonId: row.lesson_id,
  });
}

export async function requestRevision(input: {
  submissionId: string;
  note: string;
}): Promise<ActionResult> {
  const reviewer = await requireAdmin();
  if (!input.note.trim()) {
    return { ok: false, error: "Leave a note explaining what to fix." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("assignment_submissions")
    .update({
      status: "needs_revision",
      reviewer_notes: input.note.trim(),
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.submissionId);
  if (error) return { ok: false, error: error.message };

  await notifyReview({
    submissionId: input.submissionId,
    kind: "needs_revision",
    note: input.note.trim(),
  });

  revalidatePath("/admin/submissions");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createSubmissionDownloadUrl(
  filePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("submissions")
    .createSignedUrl(filePath, 60 * 60);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Couldn't sign URL." };
  }
  return { ok: true, url: data.signedUrl };
}

async function notifyReview(input: {
  submissionId: string;
  kind: "approved" | "needs_revision";
  note: string;
}): Promise<void> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("assignment_submissions")
    .select(
      `
      id,
      lesson_id,
      user_id,
      profiles!assignment_submissions_user_id_fkey ( email, full_name ),
      assignments ( title ),
      lessons ( title )
    `,
    )
    .eq("id", input.submissionId)
    .maybeSingle();
  if (!row) return;

  const profile = firstRow(row.profiles) as
    | { email: string; full_name: string }
    | null;
  const assignment = firstRow(row.assignments) as
    | { title: string }
    | null;
  const lesson = firstRow(row.lessons) as { title: string } | null;
  if (!profile?.email) return;

  const lessonUrl = `${getAppUrl()}/lessons/${row.lesson_id}`;

  const payload: ReviewEmailInput = {
    recipientEmail: profile.email,
    recipientName: profile.full_name || profile.email,
    assignmentTitle: assignment?.title ?? "assignment",
    lessonTitle: lesson?.title ?? "lesson",
    lessonUrl,
    note: input.note,
  };

  const rendered =
    input.kind === "approved"
      ? renderApprovedEmail(payload)
      : renderRevisionEmail(payload);

  await sendEmail({
    to: profile.email,
    subject: rendered.subject,
    html: rendered.html,
  });
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
