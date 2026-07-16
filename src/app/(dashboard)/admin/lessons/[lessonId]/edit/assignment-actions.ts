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
    const lessonResult = await supabase
      .from("lessons")
      .select("lesson_type, assignment_id")
      .eq("id", value.lessonId)
      .maybeSingle();
    if (lessonResult.error) {
      return { ok: false, error: "Couldn't verify the assignment lesson." };
    }
    if (
      !lessonResult.data ||
      lessonResult.data.lesson_type !== "assignment" ||
      lessonResult.data.assignment_id !== value.assignmentId
    ) {
      return { ok: false, error: "This assignment does not belong to the lesson." };
    }

    const updateResult = await supabase
      .from("assignments")
      .update({
        title: value.title,
        instructions: value.instructions,
        submission_type: value.submission_type,
        requires_review: value.requires_review,
        rubric: value.rubric,
      })
      .eq("id", value.assignmentId)
      .select("id")
      .maybeSingle();
    if (updateResult.error) return { ok: false, error: "Couldn't save the assignment." };
    if (!updateResult.data) return { ok: false, error: "Assignment not found." };

    revalidatePath(`/admin/lessons/${value.lessonId}/edit`);
    revalidatePath(`/lessons/${value.lessonId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save the assignment. Try again." };
  }
}
