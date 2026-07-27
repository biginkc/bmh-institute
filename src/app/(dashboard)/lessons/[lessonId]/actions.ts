"use server";

import { revalidatePath } from "next/cache";

import { emitSandraCourseCompletedForBlock } from "@/lib/integrations/sandra/course-completed";
import { getAppUrl } from "@/lib/app-url";
import { getRolePlayBaseUrl } from "@/lib/role-plays/base-url";
import { verifyRolePlayCompletionToken } from "@/lib/role-plays/completion-token";
import { mintRolePlayEmbedToken } from "@/lib/role-plays/embed-token";
import { mintRolePlayLaunchCredential } from "@/lib/role-plays/launch-credential";
import { isConfiguredRolePlayScenarioId } from "@/lib/role-plays/scenario-id";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  parseWatchedRanges,
  watchedCoverageRatio,
  type WatchedRange,
} from "@/lib/video-progress/watched-ranges";

export type MarkBlockResult =
  { ok: true; alreadyMarked: boolean } | { ok: false; error: string };

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
  { ok: true; positionSeconds: number } | { ok: false; error: string };

export async function loadVideoProgress(
  blockId: string,
): Promise<VideoProgressResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: block, error: blockError } = await learner
    .from("content_blocks")
    .select("id, block_type, content")
    .eq("id", blockId)
    .maybeSingle();
  if (blockError) {
    return {
      ok: false,
      error: blockError.message || "Video progress could not be loaded.",
    };
  }
  if (!block || block.block_type !== "video") {
    return { ok: false, error: "Video block not found." };
  }

  const [progressResult, completionResult] = await Promise.all([
    learner
      .from("user_video_progress")
      .select(
        "position_seconds, duration_seconds, watched_ranges, asset_version",
      )
      .eq("user_id", user.id)
      .eq("block_id", blockId)
      .maybeSingle(),
    learner
      .from("user_block_progress")
      .select("id, asset_version")
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
  const authoredDuration = durationFromContent(block.content);
  const currentAssetVersion = assetVersionFromContent(block.content);
  const progressMatchesAsset = Boolean(
    currentAssetVersion && progress?.asset_version === currentAssetVersion,
  );
  const ranges = progressMatchesAsset
    ? parseWatchedRanges(progress?.watched_ranges)
    : [];
  const duration =
    authoredDuration ||
    (progressMatchesAsset ? numberOrZero(progress?.duration_seconds) : 0);
  const coverage = watchedCoverageRatio(ranges, duration);
  return {
    ok: true,
    positionSeconds: progressMatchesAsset
      ? numberOrZero(progress?.position_seconds)
      : 0,
    watchedRanges: ranges,
    watchedPercent: Math.round(coverage * 100),
    completed: Boolean(
      progressMatchesAsset &&
        completionResult.data?.asset_version === currentAssetVersion,
    ),
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

  const { data, error } = await learner.rpc("fn_record_video_playback", {
    p_user_id: user.id,
    p_block_id: input.blockId,
    p_operation: "seek",
    p_position_seconds: input.positionSeconds,
    p_duration_seconds: input.durationSeconds,
    p_observed_from: null,
    p_observed_to: null,
  });
  if (error) return { ok: false, error: error.message };
  const trusted = parseTrustedVideoState(data);
  if (!trusted)
    return { ok: false, error: "Video progress could not be saved." };
  return { ok: true, positionSeconds: trusted.positionSeconds };
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

  const { data, error } = await learner.rpc("fn_record_video_playback", {
    p_user_id: user.id,
    p_block_id: input.blockId,
    p_operation: "observe",
    p_position_seconds: input.positionSeconds,
    p_duration_seconds: input.durationSeconds,
    p_observed_from: input.observedFrom,
    p_observed_to: input.observedTo,
  });
  if (error) return { ok: false, error: error.message };
  const trusted = parseTrustedVideoState(data);
  if (!trusted)
    return { ok: false, error: "Video progress could not be saved." };

  if (trusted.completed) {
    await emitSandraCourseCompletedForBlock(learner, {
      userId: user.id,
      blockId: input.blockId,
    });
  }

  return {
    ok: true,
    positionSeconds: trusted.positionSeconds,
    watchedRanges: trusted.watchedRanges,
    watchedPercent: trusted.watchedPercent,
    completed: trusted.completed,
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
    return {
      ok: false,
      error: "Role play completion is missing required data.",
    };
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
    return {
      ok: false,
      error: "This role play does not belong to the lesson.",
    };
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
      error:
        error instanceof Error ? error.message : "Admin client unavailable.",
    };
  }
  const completeRolePlay = admin.rpc.bind(admin) as unknown as (
    name: "fn_complete_role_play_block",
    args: {
      p_user_id: string;
      p_block_id: string;
      p_scenario_id: string;
      p_attempt_id: string;
      p_score: number;
      p_goals_met: Record<string, boolean>;
      p_summary: Record<string, string>;
    },
  ) => Promise<{
    data: { lessonId?: unknown; alreadyMarked?: unknown } | null;
    error: { message: string } | null;
  }>;
  const { data, error } = await completeRolePlay(
    "fn_complete_role_play_block",
    {
      p_user_id: user.id,
      p_block_id: blockId,
      p_scenario_id: scenarioId,
      p_attempt_id: attemptId,
      p_score: verified.score,
      p_goals_met: verified.goalsMet,
      p_summary: verified.summaryUrl
        ? { summary_url: verified.summaryUrl }
        : {},
    },
  );
  if (error) return { ok: false, error: error.message };
  if (
    !data ||
    typeof data.lessonId !== "string" ||
    typeof data.alreadyMarked !== "boolean" ||
    data.lessonId !== block.lesson_id
  ) {
    return { ok: false, error: "Role play completion could not be saved." };
  }

  await emitSandraCourseCompletedForBlock(learner, {
    userId: user.id,
    blockId,
  });
  revalidatePath(`/lessons/${block.lesson_id}`);
  revalidatePath("/dashboard");
  return { ok: true, alreadyMarked: data.alreadyMarked };
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

function assetVersionFromContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const content = value as Record<string, unknown>;
  const filePath = content.file_path;
  const duration = content.duration_seconds;
  return typeof filePath === "string" &&
    filePath.trim() &&
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
    ? `${filePath.trim()}#duration=${duration}`
    : "";
}

function parseTrustedVideoState(value: unknown): {
  lessonId: string;
  positionSeconds: number;
  watchedRanges: WatchedRange[];
  watchedPercent: number;
  completed: boolean;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  const ranges = parseWatchedRanges(state.watchedRanges);
  if (
    typeof state.lessonId !== "string" ||
    typeof state.positionSeconds !== "number" ||
    !Number.isFinite(state.positionSeconds) ||
    typeof state.watchedPercent !== "number" ||
    !Number.isFinite(state.watchedPercent) ||
    typeof state.completed !== "boolean"
  ) {
    return null;
  }
  return {
    lessonId: state.lessonId,
    positionSeconds: state.positionSeconds,
    watchedRanges: ranges,
    watchedPercent: state.watchedPercent,
    completed: state.completed,
  };
}

function scenarioFromContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const scenario = (value as Record<string, unknown>).scenario_id;
  return typeof scenario === "string" ? scenario.trim() : "";
}

export type RefreshRolePlayEmbedResult =
  | {
      ok: true;
      iframeSrc: string;
      launchCredential: string;
      mintedAtMs: number;
    }
  | { ok: false; error: string };

/**
 * Re-mint the role-play admission token and launch credential for a block the
 * learner is already entitled to.
 *
 * Both credentials are minted during the lesson's server render with a hard
 * 300-second TTL that cannot be raised (Closer Lab independently re-enforces
 * it, and the value is inside the byte-compared parent-launch contract). A
 * learner who reads a lesson for longer than that and then clicks Start would
 * otherwise be told their login expired — which is false, and which sends them
 * to a Closer Lab login page they have no account for.
 *
 * This mints a bearer capability, so it repeats every entitlement check the
 * lesson page performs. It must never mint from a client-supplied identifier
 * alone: the block is re-read from the database, its type and scenario are
 * re-checked, and the lesson prerequisite chain is re-evaluated for the
 * *session* user, never for a user id sent by the client.
 */
export async function refreshRolePlayEmbed(input: {
  blockId: string;
  scenarioId: string;
}): Promise<RefreshRolePlayEmbedResult> {
  const learner = await createClient();
  const {
    data: { user },
  } = await learner.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const blockId = input.blockId.trim();
  const scenarioId = input.scenarioId.trim();
  if (!blockId || !scenarioId) {
    return { ok: false, error: "Role play refresh is missing required data." };
  }
  if (!isConfiguredRolePlayScenarioId(scenarioId)) {
    return { ok: false, error: "Role play not configured." };
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

  const baseUrl = getRolePlayBaseUrl();
  if (!baseUrl) return { ok: false, error: "Role play not configured." };

  const { data: profile } = await learner
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const learnerName = profile?.full_name || user.email || "Learner";

  try {
    // One `now` for both mints so the admission token, the launch credential
    // and Closer Lab's frame proof stay in lockstep.
    const now = new Date();
    const parentOrigin = new URL(getAppUrl()).origin;
    const token = mintRolePlayEmbedToken({
      userId: user.id,
      lessonId: block.lesson_id,
      blockId: block.id,
      learnerName,
      scenarioId,
      parentOrigin,
      now,
    });
    const launchCredential = mintRolePlayLaunchCredential({
      token,
      userId: user.id,
      lessonId: block.lesson_id,
      blockId: block.id,
      scenarioId,
      parentOrigin,
      now,
    });
    const iframeUrl = new URL(
      `/embed/role-play/${encodeURIComponent(scenarioId)}`,
      baseUrl,
    );
    iframeUrl.searchParams.set("token", token);
    return {
      ok: true,
      iframeSrc: iframeUrl.toString(),
      launchCredential,
      mintedAtMs: now.getTime(),
    };
  } catch {
    return { ok: false, error: "Role play not configured." };
  }
}
