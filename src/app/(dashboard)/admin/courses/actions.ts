"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  parseCourseInput,
  type CourseInput,
  type ParseResult,
} from "@/lib/courses/validate";

export type CourseFormState =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      values?: Partial<CourseInput>;
    }
  | null;

export async function createCourse(
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  await requireAdmin();
  const parsed = parseCourseInput(formData);
  if (!parsed.ok) return fieldResult(parsed, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      title: parsed.value.title,
      description: parsed.value.description,
      is_published: parsed.value.is_published,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't create course." };
  }

  revalidatePath("/admin/courses");
  revalidatePath("/dashboard");
  redirect(`/admin/courses/${data.id}/edit`);
}

export async function updateCourse(
  courseId: string,
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  await requireAdmin();
  const parsed = parseCourseInput(formData);
  if (!parsed.ok) return fieldResult(parsed, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({
      title: parsed.value.title,
      description: parsed.value.description,
      is_published: parsed.value.is_published,
    })
    .eq("id", courseId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/courses/${courseId}/edit`);
  revalidatePath("/admin/courses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteCourse(courseId: string): Promise<CourseFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/courses");
  revalidatePath("/dashboard");
  redirect("/admin/courses");
}

// ---------- Modules ----------

export async function createModule(input: {
  courseId: string;
  title: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const supabase = await createClient();
  const { data: lastModule } = await supabase
    .from("modules")
    .select("sort_order")
    .eq("course_id", input.courseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = lastModule ? (lastModule.sort_order as number) + 1 : 0;

  const { data, error } = await supabase
    .from("modules")
    .insert({
      course_id: input.courseId,
      title,
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't create module." };
  }

  revalidatePath(`/admin/courses/${input.courseId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id as string };
}

export async function updateModule(input: {
  moduleId: string;
  courseId: string;
  title: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("modules")
    .update({ title })
    .eq("id", input.moduleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/courses/${input.courseId}/edit`);
  return { ok: true };
}

export async function deleteModule(input: {
  moduleId: string;
  courseId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("modules")
    .delete()
    .eq("id", input.moduleId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/courses/${input.courseId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function moveModule(input: {
  moduleId: string;
  courseId: string;
  direction: "up" | "down";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: modules } = await supabase
    .from("modules")
    .select("id, sort_order")
    .eq("course_id", input.courseId)
    .order("sort_order");

  const list = (modules ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((m) => m.id === input.moduleId);
  if (idx < 0) return { ok: false, error: "Module not found." };

  const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };

  const current = list[idx];
  const neighbor = list[swapIdx];
  // Use a temp sort_order to avoid unique-constraint-like issues (no uniq here
  // but this keeps monotonic values clean).
  const tmp = -1 - idx;
  await supabase.from("modules").update({ sort_order: tmp }).eq("id", current.id);
  await supabase
    .from("modules")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);
  await supabase
    .from("modules")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);

  revalidatePath(`/admin/courses/${input.courseId}/edit`);
  return { ok: true };
}

// ---------- Lessons ----------

export async function createLesson(input: {
  moduleId: string;
  courseId: string;
  title: string;
  lesson_type: "content" | "quiz" | "assignment";
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("lessons")
    .select("sort_order")
    .eq("module_id", input.moduleId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = last ? (last.sort_order as number) + 1 : 0;

  let quizId: string | null = null;
  let assignmentId: string | null = null;

  // Quiz / assignment lessons require a backing row ready at insert time
  // because the lessons_type_matches_fk check constraint enforces it.
  if (input.lesson_type === "quiz") {
    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .insert({ title, passing_score: 80 })
      .select("id")
      .single();
    if (quizErr || !quiz) {
      return {
        ok: false,
        error: quizErr?.message ?? "Couldn't create quiz.",
      };
    }
    quizId = quiz.id as string;
  } else if (input.lesson_type === "assignment") {
    const { data: asn, error: asnErr } = await supabase
      .from("assignments")
      .insert({
        title,
        instructions: "Describe what the learner should submit.",
        submission_type: "text",
      })
      .select("id")
      .single();
    if (asnErr || !asn) {
      return {
        ok: false,
        error: asnErr?.message ?? "Couldn't create assignment.",
      };
    }
    assignmentId = asn.id as string;
  }

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      module_id: input.moduleId,
      title,
      lesson_type: input.lesson_type,
      quiz_id: quizId,
      assignment_id: assignmentId,
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Roll back the orphan quiz/assignment row if the lesson insert failed.
    if (quizId) await supabase.from("quizzes").delete().eq("id", quizId);
    if (assignmentId)
      await supabase.from("assignments").delete().eq("id", assignmentId);
    return { ok: false, error: error?.message ?? "Couldn't create lesson." };
  }

  revalidatePath(`/admin/courses/${input.courseId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true, id: data.id as string };
}

export async function deleteLesson(input: {
  lessonId: string;
  courseId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();

  // Grab the lesson's backing quiz/assignment (if any) so we can clean up
  // the orphan after the lesson row is gone. ON DELETE RESTRICT on the
  // FK means we can't delete the quiz while the lesson still references it.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("quiz_id, assignment_id")
    .eq("id", input.lessonId)
    .maybeSingle();

  const { error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", input.lessonId);
  if (error) return { ok: false, error: error.message };

  if (lesson?.quiz_id) {
    await supabase.from("quizzes").delete().eq("id", lesson.quiz_id);
  }
  if (lesson?.assignment_id) {
    await supabase
      .from("assignments")
      .delete()
      .eq("id", lesson.assignment_id);
  }

  revalidatePath(`/admin/courses/${input.courseId}/edit`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function moveLesson(input: {
  lessonId: string;
  moduleId: string;
  courseId: string;
  direction: "up" | "down";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, sort_order")
    .eq("module_id", input.moduleId)
    .order("sort_order");

  const list = (lessons ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((l) => l.id === input.lessonId);
  if (idx < 0) return { ok: false, error: "Lesson not found." };

  const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };

  const current = list[idx];
  const neighbor = list[swapIdx];
  const tmp = -1 - idx;
  await supabase.from("lessons").update({ sort_order: tmp }).eq("id", current.id);
  await supabase
    .from("lessons")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);
  await supabase
    .from("lessons")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);

  revalidatePath(`/admin/courses/${input.courseId}/edit`);
  return { ok: true };
}

function fieldResult(
  parsed: Extract<ParseResult<CourseInput>, { ok: false }>,
  formData: FormData,
): CourseFormState {
  return {
    ok: false,
    error: "Fix the highlighted fields.",
    fieldErrors: parsed.errors,
    values: {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      is_published: formData.get("is_published") === "on",
    },
  };
}
