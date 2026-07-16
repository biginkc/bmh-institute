"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  parseProgramInput,
  type ParseResult,
  type ProgramInput,
} from "@/lib/programs/validate";

export type FormState =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      values?: Partial<ProgramInput>;
    }
  | null;

export async function createProgram(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseProgramInput(formData);
  if (!parsed.ok) return fieldResult(parsed, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("programs")
    .insert({
      title: parsed.value.title,
      description: parsed.value.description,
      course_order_mode: parsed.value.course_order_mode,
      is_published: parsed.value.is_published,
      thumbnail_path: parsed.value.thumbnail_path,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't create program." };
  }

  revalidatePath("/admin/programs");
  revalidatePath("/dashboard");
  redirect(`/admin/programs/${data.id}/edit`);
}

export async function updateProgram(
  programId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseProgramInput(formData);
  if (!parsed.ok) return fieldResult(parsed, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({
      title: parsed.value.title,
      description: parsed.value.description,
      course_order_mode: parsed.value.course_order_mode,
      is_published: parsed.value.is_published,
      thumbnail_path: parsed.value.thumbnail_path,
    })
    .eq("id", programId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/admin/programs");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteProgram(programId: string): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/programs");
  revalidatePath("/dashboard");
  redirect("/admin/programs");
}

export async function attachCourseToProgram(input: {
  programId: string;
  courseId: string;
}): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("program_courses")
    .select("sort_order")
    .eq("program_id", input.programId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = maxRow ? (maxRow.sort_order as number) + 1 : 0;

  const { error } = await supabase.from("program_courses").insert({
    program_id: input.programId,
    course_id: input.courseId,
    sort_order: nextOrder,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/programs/${input.programId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function detachCourseFromProgram(input: {
  programId: string;
  courseId: string;
}): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("program_courses")
    .delete()
    .eq("program_id", input.programId)
    .eq("course_id", input.courseId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/programs/${input.programId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

function fieldResult(
  parsed: Extract<ParseResult<ProgramInput>, { ok: false }>,
  formData: FormData,
): FormState {
  return {
    ok: false,
    error: "Fix the highlighted fields.",
    fieldErrors: parsed.errors,
    values: {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      course_order_mode:
        (formData.get("course_order_mode") as "sequential" | "free") ?? "free",
      is_published: formData.get("is_published") === "on",
      thumbnail_path: String(formData.get("thumbnail_path") ?? "") || null,
    },
  };
}
