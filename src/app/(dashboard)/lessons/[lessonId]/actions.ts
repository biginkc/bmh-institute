"use server";

import { revalidatePath } from "next/cache";

import { emitSandraCourseCompletedForBlock } from "@/lib/integrations/sandra/course-completed";
import { verifyRolePlayCompletionToken } from "@/lib/role-plays/completion-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  applyPlaybackObservation,
  parseWatchedRanges,
  watchedCoverageRatio,
  type WatchedRange,
} from "@/lib/video-progress/watched-ranges";

export type MarkBlockResult =
  | { ok: true; alreadyMarked: boolean }
  | { ok: false; error: string };

export type CompleteRolePlayBlockInput = {
  blockId: string;
  scenarioId: string;
  attemptId: string;
  completionToken: string;
};

export type VideoProgressResult =
  | {
      ok: true;
      positionSeconds: number;
      watchedRanges: WatchedRange[];
      watchedPercent: number;
      completed: boolean;
      reconciled?: boolean;
    }
  | { ok: false; error: string };

export type VideoSeekResult =
  | { ok: true; positionSeconds: number }
  | { ok: false; error: string };

const VIDEO_POSITION_EPSILON_SECONDS = 1;

export async function loadVideoProgress(
  blockId: string,
): Promise<VideoProgressResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: block } = await learner
    .from("content_blocks")
    .select("id, block_type, content")
    .eq("id", blockId)
    .maybeSingle();
  if (!block || block.block_type !== "video") {
    return { ok: false, error: "Video block not found." };
  }

  const [progressResult, completionResult] = await Promise.all([
    learner
      .from("user_video_progress")
      .select("position_seconds, duration_seconds, watched_ranges")
      .eq("user_id", user.id)
      .eq("block_id", blockId)
      .maybeSingle(),
    learner
      .from("user_block_progress")
      .select("id")
      .eq("user_id", user.id)
      .eq("block_id", blockId)
      .maybeSingle(),
  ]);
  if (progressResult.error || completionResult.error) {
    return {
      ok: false,
      error:
        progressResult.error?.message ??
        completionResult.error?.message ??
        "Video progress could not be loaded.",
    };
  }
  const progress = progressResult.data;
  const ranges = parseWatchedRanges(progress?.watched_ranges);
  const authoredDuration = durationFromContent(block.content);
  const duration = authoredDuration || numberOrZero(progress?.duration_seconds);
  const coverage = watchedCoverageRatio(ranges, duration);
  let completed = Boolean(completionResult.data);
  let reconciled = false;
  if (!completed && authoredDuration > 0 && coverage >= 0.9) {
    let admin;
    try {
      admin = createAdminClient();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Admin client unavailable.",
      };
    }
    const { error: completionError } = await admin
      .from("user_block_progress")
      .upsert(
        { user_id: user.id, block_id: blockId },
        { onConflict: "user_id,block_id", ignoreDuplicates: true },
      );
    if (completionError) {
      return { ok: false, error: completionError.message };
    }
    await emitSandraCourseCompletedForBlock(learner, {
      userId: user.id,
      blockId,
    });
    completed = true;
    reconciled = true;
  }
  return {
    ok: true,
    positionSeconds: numberOrZero(progress?.position_seconds),
    watchedRanges: ranges,
    watchedPercent: Math.round(coverage * 100),
    completed,
    reconciled,
  };
}

export async function recordVideoSeek(input: {
  blockId: string;
  positionSeconds: number;
  durationSeconds: number;
}): Promise<VideoSeekResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  if (
    !validMediaNumber(input.positionSeconds) ||
    !validMediaNumber(input.durationSeconds) ||
    input.durationSeconds <= 0
  ) {
    return { ok: false, error: "Video seek contains invalid timing data." };
  }

  const { data: block } = await learner
    .from("content_blocks")
    .select("id, lesson_id, block_type, content")
    .eq("id", input.blockId)
    .maybeSingle();
  if (!block || block.block_type !== "video") {
    return { ok: false, error: "Video block not found." };
  }
  const { data: unlocked } = await learner.rpc("fn_lesson_is_unlocked", {
    p_user_id: user.id,
    p_lesson_id: block.lesson_id,
  });
  if (unlocked !== true) {
    return { ok: false, error: "Complete the prerequisite lessons first." };
  }

  const { data: existing, error: existingError } = await learner
    .from("user_video_progress")
    .select("duration_seconds, watched_ranges")
    .eq("user_id", user.id)
    .eq("block_id", input.blockId)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };

  const authoredDuration = durationFromContent(block.content);
  const storedDuration = numberOrZero(existing?.duration_seconds);
  const duration = authoredDuration || storedDuration || input.durationSeconds;
  if (
    Math.abs(duration - input.durationSeconds) > 2 ||
    input.positionSeconds > duration + VIDEO_POSITION_EPSILON_SECONDS
  ) {
    return { ok: false, error: "Video seek does not match the lesson asset." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Admin client unavailable.",
    };
  }
  const trustedPosition = Math.min(input.positionSeconds, duration);
  const now = new Date().toISOString();
  const { error: progressError } = await admin
    .from("user_video_progress")
    .upsert(
      {
        user_id: user.id,
        block_id: input.blockId,
        position_seconds: trustedPosition,
        duration_seconds: duration,
        watched_ranges: parseWatchedRanges(existing?.watched_ranges),
        last_observed_position_seconds: trustedPosition,
        last_observed_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,block_id" },
    );
  if (progressError) return { ok: false, error: progressError.message };

  return { ok: true, positionSeconds: trustedPosition };
}

export async function recordVideoProgress(input: {
  blockId: string;
  positionSeconds: number;
  durationSeconds: number;
  observedFrom: number;
  observedTo: number;
}): Promise<VideoProgressResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  if (
    !validMediaNumber(input.positionSeconds) ||
    !validMediaNumber(input.durationSeconds) ||
    input.durationSeconds <= 0 ||
    !validMediaNumber(input.observedFrom) ||
    !validMediaNumber(input.observedTo)
  ) {
    return { ok: false, error: "Video progress contains invalid timing data." };
  }

  const { data: block } = await learner
    .from("content_blocks")
    .select("id, lesson_id, block_type, content")
    .eq("id", input.blockId)
    .maybeSingle();
  if (!block || block.block_type !== "video") {
    return { ok: false, error: "Video block not found." };
  }
  const { data: unlocked } = await learner.rpc("fn_lesson_is_unlocked", {
    p_user_id: user.id,
    p_lesson_id: block.lesson_id,
  });
  if (unlocked !== true) {
    return { ok: false, error: "Complete the prerequisite lessons first." };
  }

  const { data: existing, error: existingError } = await learner
    .from("user_video_progress")
    .select(
      "position_seconds, duration_seconds, watched_ranges, last_observed_position_seconds, last_observed_at",
    )
    .eq("user_id", user.id)
    .eq("block_id", input.blockId)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };
  const authoredDuration = durationFromContent(block.content);
  const storedDuration = numberOrZero(existing?.duration_seconds);
  const duration = authoredDuration || storedDuration || input.durationSeconds;
  if (Math.abs(duration - input.durationSeconds) > 2) {
    return { ok: false, error: "Video duration does not match the lesson asset." };
  }
  if (
    input.observedTo > duration + VIDEO_POSITION_EPSILON_SECONDS ||
    input.positionSeconds > duration + VIDEO_POSITION_EPSILON_SECONDS ||
    Math.abs(input.positionSeconds - input.observedTo) >
      VIDEO_POSITION_EPSILON_SECONDS
  ) {
    return {
      ok: false,
      error: "Video position does not match the observed playback range.",
    };
  }

  const now = new Date();
  const observation = applyPlaybackObservation({
    existingRanges: parseWatchedRanges(existing?.watched_ranges),
    observedFrom: input.observedFrom,
    observedTo: input.observedTo,
    duration,
    previousObservedPosition:
      existing?.last_observed_at &&
      typeof existing.last_observed_position_seconds === "number"
        ? existing.last_observed_position_seconds
        : null,
    previousObservedAt: existing?.last_observed_at
      ? new Date(existing.last_observed_at)
      : null,
    observedAt: now,
  });
  if (!observation.ok) {
    return {
      ok: false,
      error: "Video playback observation could not be verified.",
    };
  }
  const ranges = observation.ranges;
  const trustedPosition = Math.min(input.observedTo, duration);
  const coverage = watchedCoverageRatio(ranges, duration);
  // Only authoring/import metadata can establish the completion denominator.
  // Browser-reported duration is useful for resume but cannot award completion.
  const completed = authoredDuration > 0 && coverage >= 0.9;

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Admin client unavailable.",
    };
  }
  const { error: progressError } = await admin
    .from("user_video_progress")
    .upsert(
      {
        user_id: user.id,
        block_id: input.blockId,
        position_seconds: trustedPosition,
        duration_seconds: duration,
        watched_ranges: ranges,
        last_observed_position_seconds: trustedPosition,
        last_observed_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,block_id" },
    );
  if (progressError) return { ok: false, error: progressError.message };

  if (completed) {
    const { error: completionError } = await admin
      .from("user_block_progress")
      .upsert(
        { user_id: user.id, block_id: input.blockId },
        { onConflict: "user_id,block_id", ignoreDuplicates: true },
      );
    if (completionError) {
      return { ok: false, error: completionError.message };
    }
    await emitSandraCourseCompletedForBlock(learner, {
      userId: user.id,
      blockId: input.blockId,
    });
  }

  revalidatePath(`/lessons/${block.lesson_id}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
    positionSeconds: trustedPosition,
    watchedRanges: ranges,
    watchedPercent: Math.round(coverage * 100),
    completed,
  };
}

export async function completeRolePlayBlock(
  input: CompleteRolePlayBlockInput,
): Promise<MarkBlockResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const blockId = input.blockId.trim();
  const scenarioId = input.scenarioId.trim();
  const attemptId = input.attemptId.trim();
  if (!blockId || !scenarioId || !attemptId || !input.completionToken.trim()) {
    return { ok: false, error: "Role play completion is missing required data." };
  }
  const { data: block } = await learner
    .from("content_blocks")
    .select("id, lesson_id, block_type, content")
    .eq("id", blockId)
    .maybeSingle();
  if (
    !block ||
    block.block_type !== "role_play" ||
    scenarioFromContent(block.content) !== scenarioId
  ) {
    return { ok: false, error: "This role play does not belong to the lesson." };
  }
  const { data: unlocked } = await learner.rpc("fn_lesson_is_unlocked", {
    p_user_id: user.id,
    p_lesson_id: block.lesson_id,
  });
  if (unlocked !== true) {
    return { ok: false, error: "Complete the prerequisite lessons first." };
  }
  const verified = verifyRolePlayCompletionToken({
    token: input.completionToken,
    expected: { userId: user.id, blockId, scenarioId, attemptId },
  });
  if (!verified.ok) return verified;

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Admin client unavailable.",
    };
  }
  const { error: resultError } = await admin.from("role_play_results").upsert(
    {
      user_id: user.id,
      block_id: blockId,
      scenario_id: scenarioId,
      attempt_id: attemptId,
      score: verified.score,
      goals_met: verified.goalsMet,
      summary: verified.summaryUrl
        ? { summary_url: verified.summaryUrl }
        : {},
    },
    { onConflict: "user_id,attempt_id" },
  );
  if (resultError) return { ok: false, error: resultError.message };

  const { data, error } = await admin
    .from("user_block_progress")
    .upsert(
      { user_id: user.id, block_id: blockId },
      { onConflict: "user_id,block_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { ok: false, error: error.message };

  await emitSandraCourseCompletedForBlock(learner, {
    userId: user.id,
    blockId,
  });
  revalidatePath(`/lessons/${block.lesson_id}`);
  revalidatePath("/dashboard");
  return { ok: true, alreadyMarked: (data ?? []).length === 0 };
}

function validMediaNumber(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function durationFromContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return numberOrZero((value as Record<string, unknown>).duration_seconds);
}

function scenarioFromContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const scenario = (value as Record<string, unknown>).scenario_id;
  return typeof scenario === "string" ? scenario.trim() : "";
}
