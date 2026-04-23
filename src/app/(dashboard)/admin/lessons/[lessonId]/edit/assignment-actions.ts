"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateAssignment(input: {
  assignmentId: string;
  lessonId: string;
  title: string;
  instructions: string;
  submission_type: "file_upload" | "text" | "url";
  requires_review: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.title.trim()) return { ok: false, error: "Title is required." };
  if (!input.instructions.trim()) {
    return { ok: false, error: "Instructions are required." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      submission_type: input.submission_type,
      requires_review: input.requires_review,
    })
    .eq("id", input.assignmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}
