"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateQuizSettings(input: {
  quizId: string;
  lessonId: string;
  title: string;
  description: string | null;
  passing_score: number;
  randomize_questions: boolean;
  randomize_answers: boolean;
  questions_per_attempt: number | null;
  max_attempts: number | null;
  retake_cooldown_hours: number;
  show_correct_answers_after: "never" | "after_pass" | "always";
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.title.trim()) return { ok: false, error: "Title is required." };
  if (input.passing_score < 0 || input.passing_score > 100) {
    return {
      ok: false,
      error: "Passing score must be between 0 and 100.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("quizzes")
    .update({
      title: input.title.trim(),
      description: input.description,
      passing_score: input.passing_score,
      randomize_questions: input.randomize_questions,
      randomize_answers: input.randomize_answers,
      questions_per_attempt: input.questions_per_attempt,
      max_attempts: input.max_attempts,
      retake_cooldown_hours: input.retake_cooldown_hours,
      show_correct_answers_after: input.show_correct_answers_after,
    })
    .eq("id", input.quizId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}

export async function createQuestion(input: {
  quizId: string;
  lessonId: string;
  type: "true_false" | "single_choice" | "multi_select";
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("questions")
    .select("sort_order")
    .eq("quiz_id", input.quizId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = last ? (last.sort_order as number) + 1 : 0;

  const { data: question, error: qErr } = await supabase
    .from("questions")
    .insert({
      quiz_id: input.quizId,
      question_text: "New question",
      question_type: input.type,
      points: 1,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (qErr || !question) {
    return { ok: false, error: qErr?.message ?? "Couldn't create question." };
  }

  // true_false auto-seeds True/False options so admins don't have to.
  if (input.type === "true_false") {
    const { error: optErr } = await supabase.from("answer_options").insert([
      {
        question_id: question.id,
        option_text: "True",
        is_correct: false,
        sort_order: 0,
      },
      {
        question_id: question.id,
        option_text: "False",
        is_correct: false,
        sort_order: 1,
      },
    ]);
    if (optErr) return { ok: false, error: optErr.message };
  }

  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}

export async function updateQuestion(input: {
  questionId: string;
  lessonId: string;
  question_text: string;
  explanation: string | null;
  points: number;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.question_text.trim()) {
    return { ok: false, error: "Question text is required." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("questions")
    .update({
      question_text: input.question_text.trim(),
      explanation: input.explanation,
      points: input.points,
    })
    .eq("id", input.questionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  return { ok: true };
}

export async function deleteQuestion(input: {
  questionId: string;
  lessonId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", input.questionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}

export async function moveQuestion(input: {
  questionId: string;
  quizId: string;
  lessonId: string;
  direction: "up" | "down";
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: list } = await supabase
    .from("questions")
    .select("id, sort_order")
    .eq("quiz_id", input.quizId)
    .order("sort_order");
  const arr = (list ?? []) as { id: string; sort_order: number }[];
  const idx = arr.findIndex((q) => q.id === input.questionId);
  if (idx < 0) return { ok: false, error: "Question not found." };
  const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= arr.length) return { ok: true };
  const cur = arr[idx];
  const nb = arr[swapIdx];
  const tmp = -1 - idx;
  await supabase.from("questions").update({ sort_order: tmp }).eq("id", cur.id);
  await supabase
    .from("questions")
    .update({ sort_order: cur.sort_order })
    .eq("id", nb.id);
  await supabase
    .from("questions")
    .update({ sort_order: nb.sort_order })
    .eq("id", cur.id);
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  return { ok: true };
}

export async function createAnswerOption(input: {
  questionId: string;
  lessonId: string;
  text: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Option text is required." };
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("answer_options")
    .select("sort_order")
    .eq("question_id", input.questionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = last ? (last.sort_order as number) + 1 : 0;

  const { error } = await supabase.from("answer_options").insert({
    question_id: input.questionId,
    option_text: text,
    is_correct: false,
    sort_order: nextOrder,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  return { ok: true };
}

export async function updateAnswerOption(input: {
  optionId: string;
  lessonId: string;
  text: string;
  is_correct: boolean;
  // For radio-style exclusivity: if single_choice/true_false and this option
  // is being marked correct, the caller passes the question's other option
  // ids so we can clear them in the same call.
  exclusivePeerOptionIds?: string[];
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.text.trim()) return { ok: false, error: "Text is required." };
  const supabase = await createClient();

  if (input.is_correct && input.exclusivePeerOptionIds?.length) {
    await supabase
      .from("answer_options")
      .update({ is_correct: false })
      .in("id", input.exclusivePeerOptionIds);
  }

  const { error } = await supabase
    .from("answer_options")
    .update({
      option_text: input.text.trim(),
      is_correct: input.is_correct,
    })
    .eq("id", input.optionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}

export async function deleteAnswerOption(input: {
  optionId: string;
  lessonId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("answer_options")
    .delete()
    .eq("id", input.optionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
  revalidatePath(`/lessons/${input.lessonId}`);
  return { ok: true };
}
