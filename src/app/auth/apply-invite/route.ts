import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { applyInvite } from "../callback/route";

export async function POST(request: NextRequest) {
  const { token } = (await request.json().catch(() => ({}))) as {
    token?: unknown;
  };
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "missing_session" }, { status: 401 });
  }

  const result = await applyInvite({ userId: user.id, token });
  if (!result.ok && result.reason === "expired") {
    await supabase.auth.signOut();
    try {
      const admin = createAdminClient();
      await admin.auth.admin.deleteUser(user.id);
    } catch {
      // The session is gone; stale auth rows can be cleaned up out-of-band.
    }
    return NextResponse.json({ ok: false, error: "invite_expired" }, { status: 410 });
  }

  return NextResponse.json({ ok: true });
}
