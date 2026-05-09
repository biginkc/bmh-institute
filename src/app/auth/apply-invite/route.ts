import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { applyInvite } from "../callback/route";

export async function POST(request: NextRequest) {
  const { token, accessToken } = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    accessToken?: unknown;
  };
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let userId = user?.id;
  if (!userId && typeof accessToken === "string" && accessToken.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin.auth.getUser(accessToken);
    userId = data.user?.id;
  }
  if (!userId) {
    return NextResponse.json({ ok: false, error: "missing_session" }, { status: 401 });
  }

  const result = await applyInvite({ userId, token });
  if (!result.ok && result.reason === "expired") {
    await supabase.auth.signOut();
    try {
      const admin = createAdminClient();
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // The session is gone; stale auth rows can be cleaned up out-of-band.
    }
    return NextResponse.json({ ok: false, error: "invite_expired" }, { status: 410 });
  }

  return NextResponse.json({ ok: true });
}
