"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { parseAssignmentUpdateInput } from "@/lib/assignments/validation";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateAssignment(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseAssignmentUpdateInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const value = parsed.value;
    const supabase = await createClient();
    const updateResult = await supabase.rpc("fn_update_assignment_for_lesson", {
      p_lesson_id: value.lessonId,
      p_assignment_id: value.assignmentId,
      p_title: value.title,
      p_instructions: value.instructions,
      p_submission_type: value.submission_type,
      p_requires_review: value.requires_review,
      p_rubric: value.rubric,
    });
    if (updateResult.error) return { ok: false, error: "Couldn't save the assignment." };
    if (updateResult.data !== true) {
      return { ok: false, error: "This assignment does not belong to the lesson." };
    }

    revalidatePath(`/admin/lessons/${value.lessonId}/edit`);
    revalidatePath(`/lessons/${value.lessonId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save the assignment. Try again." };
  }
}
