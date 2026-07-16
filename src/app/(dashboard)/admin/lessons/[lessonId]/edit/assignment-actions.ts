"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import type { AssignmentRubricItem } from "@/lib/assignments/rubric";
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
  rubric: AssignmentRubricItem[];
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.title.trim()) return { ok: false, error: "Title is required." };
  if (!input.instructions.trim()) {
    return { ok: false, error: "Instructions are required." };
  }
  if (!Array.isArray(input.rubric) || input.rubric.length > 20) {
    return { ok: false, error: "A rubric can contain up to 20 criteria." };
  }
  const rubric = input.rubric.map((item) => ({
    criterion: typeof item?.criterion === "string" ? item.criterion.trim() : "",
    description: typeof item?.description === "string" ? item.description.trim() : "",
  }));
  if (rubric.some((item) => !item.criterion || !item.description)) {
    return { ok: false, error: "Every rubric criterion needs a name and review guidance." };
  }
  if (rubric.some((item) => item.criterion.length > 120 || item.description.length > 1_000)) {
    return { ok: false, error: "Rubric names must be 120 characters or less and guidance 1,000 or less." };
  }
  if (input.requires_review && rubric.length === 0) {
    return { ok: false, error: "Add at least one rubric criterion for reviewers." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      submission_type: input.submission_type,
      requires_review: input.requires_review,
      rubric,
    })
    .eq("id", input.assignmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}
