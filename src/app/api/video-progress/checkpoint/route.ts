import { NextResponse } from "next/server";

import { parseVideoCheckpoint } from "@/lib/video-progress/checkpoint";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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
    p_client_updated_at: new Date(payload.clientUpdatedAt).toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, ...(data as unknown as Record<string, unknown>) });
}
