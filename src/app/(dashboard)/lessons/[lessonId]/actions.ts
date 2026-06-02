"use server";

import { revalidatePath } from "next/cache";

import {
  emitSandraCourseCompletedForBlock,
  emitSandraCourseCompletedForLesson,
} from "@/lib/integrations/sandra/course-completed";
import { createClient } from "@/lib/supabase/server";

export type MarkLessonResult =
  | { ok: true; blocksMarked: number }
  | { ok: false; error: string };

/**
 * Marks every required content block in a lesson as complete for the
 * current user. The trg_after_block_progress trigger then materialises
 * user_lesson_completions and fires the certificate checks.
 *
 * Idempotent via the (user_id, block_id) unique constraint — pressing
 * the button twice doesn't double-insert.
 */
export async function markLessonComplete(
  lessonId: string,
): Promise<MarkLessonResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { data: blocks, error: blocksError } = await supabase
    .from("content_blocks")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("is_required_for_completion", true);

  if (blocksError) {
    return { ok: false, error: blocksError.message };
  }
  if (!blocks || blocks.length === 0) {
    return { ok: true, blocksMarked: 0 };
  }

  const rows = blocks.map((b) => ({
    user_id: user.id,
    block_id: b.id,
  }));

  const { error: insertError } = await supabase
    .from("user_block_progress")
    .upsert(rows, { onConflict: "user_id,block_id", ignoreDuplicates: true });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  await emitSandraCourseCompletedForLesson(supabase, {
    userId: user.id,
    lessonId,
  });

  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath(`/dashboard`);

  return { ok: true, blocksMarked: rows.length };
}

export type MarkBlockResult =
  | { ok: true; alreadyMarked: boolean }
  | { ok: false; error: string };

export type CompleteRolePlayBlockInput = {
  blockId: string;
  scenarioId: string;
  attemptId: string;
  score: number;
  summaryUrl?: string;
};

/**
 * Marks a single content block complete for the current user. Auto-fires
 * when the video / audio player crosses its 90% threshold so learners
 * don't have to click "Mark complete" after watching. Idempotent via the
 * user_block_progress unique constraint.
 */
export async function markBlockComplete(
  blockId: string,
): Promise<MarkBlockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data, error } = await supabase
    .from("user_block_progress")
    .upsert(
      { user_id: user.id, block_id: blockId },
      { onConflict: "user_id,block_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) return { ok: false, error: error.message };

  await emitSandraCourseCompletedForBlock(supabase, {
    userId: user.id,
    blockId,
  });

  revalidatePath(`/dashboard`);
  return { ok: true, alreadyMarked: (data ?? []).length === 0 };
}

export async function completeRolePlayBlock(
  input: CompleteRolePlayBlockInput,
): Promise<MarkBlockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const blockId = input.blockId.trim();
  const scenarioId = input.scenarioId.trim();
  const attemptId = input.attemptId.trim();
  if (!blockId || !scenarioId || !attemptId) {
    return { ok: false, error: "Role play completion is missing required data." };
  }

  const { error: resultError } = await supabase
    .from("role_play_results")
    .upsert(
      {
        user_id: user.id,
        block_id: blockId,
        scenario_id: scenarioId,
        attempt_id: attemptId,
        score: input.score,
        summary: input.summaryUrl ? { summary_url: input.summaryUrl } : {},
      },
      { onConflict: "user_id,attempt_id" },
    );

  if (resultError) return { ok: false, error: resultError.message };

  const { data, error } = await supabase
    .from("user_block_progress")
    .upsert(
      { user_id: user.id, block_id: blockId },
      { onConflict: "user_id,block_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) return { ok: false, error: error.message };

  await emitSandraCourseCompletedForBlock(supabase, {
    userId: user.id,
    blockId,
  });

  revalidatePath(`/dashboard`);
  return { ok: true, alreadyMarked: (data ?? []).length === 0 };
}
