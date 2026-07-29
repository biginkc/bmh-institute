"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { validateArtworkChange } from "@/lib/artwork/paths";
import {
  importedDeletionError,
  importedPublicationError,
  normalizeReleaseControlError,
} from "@/lib/release-control/admin-guards";
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
  if (parsed.value.thumbnail_path) {
    return {
      ok: false,
      error: "Save the program before uploading artwork.",
      fieldErrors: { thumbnail_path: "Save the program before uploading artwork." },
      values: parsed.value,
    };
  }

  const supabase = await createClient();
  const templateError = await certificateTemplateError(
    supabase,
    parsed.value.certificate_template_id,
    "program",
  );
  if (templateError) return { ok: false, error: templateError, values: parsed.value };
  const { data, error } = await supabase
    .from("programs")
    .insert({
      title: parsed.value.title,
      description: parsed.value.description,
      course_order_mode: parsed.value.course_order_mode,
      is_published: parsed.value.is_published,
      thumbnail_path: parsed.value.thumbnail_path,
      certificate_enabled: parsed.value.certificate_enabled,
      certificate_template_id: parsed.value.certificate_template_id,
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
  const current = await supabase
    .from("programs")
    .select("thumbnail_path, content_import_id, thumbnail_asset_key, thumbnail_approved_path, thumbnail_approved_sha256, is_published")
    .eq("id", programId)
    .maybeSingle();
  if (current.error || !current.data) {
    return { ok: false, error: "Couldn't verify the program artwork." };
  }
  const releaseError = importedPublicationError({
    contentImportId: current.data.content_import_id,
    currentlyPublished: current.data.is_published,
    requestedPublished: parsed.value.is_published,
  });
  if (releaseError) {
    return { ok: false, error: releaseError, values: parsed.value };
  }
  const artworkError = validateArtworkChange({
    entityType: "program",
    entityId: programId,
    contentImportId: current.data.content_import_id,
    thumbnailAssetKey: current.data.thumbnail_asset_key,
    thumbnailApprovedPath: current.data.thumbnail_approved_path,
    thumbnailApprovedSha256: current.data.thumbnail_approved_sha256,
    currentPath: current.data.thumbnail_path,
    nextPath: parsed.value.thumbnail_path,
  });
  if (artworkError) {
    return {
      ok: false,
      error: "Fix the highlighted fields.",
      fieldErrors: { thumbnail_path: artworkError },
      values: parsed.value,
    };
  }
  const templateError = await certificateTemplateError(
    supabase,
    parsed.value.certificate_template_id,
    "program",
  );
  if (templateError) return { ok: false, error: templateError, values: parsed.value };
  const { error } = await supabase
    .from("programs")
    .update({
      title: parsed.value.title,
      description: parsed.value.description,
      course_order_mode: parsed.value.course_order_mode,
      is_published: parsed.value.is_published,
      thumbnail_path: parsed.value.thumbnail_path,
      certificate_enabled: parsed.value.certificate_enabled,
      certificate_template_id: parsed.value.certificate_template_id,
    })
    .eq("id", programId);

  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }

  revalidatePath(`/admin/programs/${programId}/edit`);
  revalidatePath("/admin/programs");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteProgram(programId: string): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  const current = await supabase
    .from("programs")
    .select("content_import_id")
    .eq("id", programId)
    .maybeSingle();
  if (current.error || !current.data) {
    return { ok: false, error: "Couldn't verify the program before deleting it." };
  }
  const deletionError = importedDeletionError(current.data.content_import_id);
  if (deletionError) return { ok: false, error: deletionError };
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) return { ok: false, error: normalizeReleaseControlError(error.message) };

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
  const { error } = await supabase.rpc("fn_attach_course_to_program", {
    p_program_id: input.programId,
    p_course_id: input.courseId,
  });

  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }
  revalidatePath(`/admin/programs/${input.programId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function moveProgramCourse(input: {
  programId: string;
  courseId: string;
  direction: "up" | "down";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_move_program_course", {
    p_program_id: input.programId,
    p_course_id: input.courseId,
    p_direction: input.direction,
  });
  if (error) return { ok: false, error: normalizeReleaseControlError(error.message) };

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

  if (error) {
    return { ok: false, error: normalizeReleaseControlError(error.message) };
  }
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
      certificate_enabled: formData.get("certificate_enabled") === "on",
      certificate_template_id: String(formData.get("certificate_template_id") ?? "") || null,
    },
  };
}

async function certificateTemplateError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string | null,
  scope: "course" | "program",
): Promise<string | null> {
  if (!templateId) return null;
  const { data, error } = await supabase
    .from("certificate_templates")
    .select("id")
    .eq("id", templateId)
    .eq("scope", scope)
    .maybeSingle();
  if (error || !data) return `Choose a ${scope} certificate template.`;
  return null;
}
