"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

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
