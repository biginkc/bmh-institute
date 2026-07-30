import { NextResponse } from "next/server";

import { parseVideoCheckpoint } from "@/lib/video-progress/checkpoint";
import { createClient } from "@/lib/supabase/server";

function isSameOriginJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request)) {
    return NextResponse.json({ ok: false, error: "Invalid checkpoint request origin." }, { status: 400 });
  }
  const payload = parseVideoCheckpoint(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid video checkpoint." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "You must be signed in." }, { status: 401 });
  const { data, error } = await supabase.rpc("fn_checkpoint_video_playback", {
    p_user_id: user.id,
    p_block_id: payload.blockId,
    p_position_seconds: payload.positionSeconds,
    p_duration_seconds: payload.durationSeconds,
    p_checkpoint_sequence: payload.checkpointSequence,
  });
  if (error) return NextResponse.json({ ok: false, error: "Video checkpoint could not be saved." }, { status: 400 });
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof (data as Record<string, unknown>).saved !== "boolean" ||
    typeof (data as Record<string, unknown>).stale !== "boolean" ||
    !Number.isSafeInteger((data as Record<string, unknown>).checkpointSequence) ||
    ((data as Record<string, unknown>).checkpointSequence as number) < 0
  ) {
    return NextResponse.json({ ok: false, error: "Video checkpoint could not be saved." }, { status: 400 });
  }
  const result = data as {
    saved: boolean;
    stale: boolean;
    checkpointSequence: number;
  };
  return NextResponse.json({
    ok: true,
    saved: result.saved,
    stale: result.stale,
    checkpointSequence: result.checkpointSequence,
  });
}
