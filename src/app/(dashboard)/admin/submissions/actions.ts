"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
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
      profiles ( email, full_name ),
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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://bmh-institute.vercel.app";
  const lessonUrl = `${appUrl.replace(/\/$/, "")}/lessons/${row.lesson_id}`;

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
