import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextUrl } from "@/app/(auth)/login/sanitize-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Only Hugo may establish a new Institute session. Historical invite,
  // recovery, signup, and magic-link callbacks are deliberately rejected.
  if (searchParams.get("flow") !== "sso" || !code) {
    return NextResponse.redirect(`${origin}/login?error=sso_failed`);
  }

  const supabase = await createClient();
  const { error, data } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=sso_failed`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (!profile || profile.status === "suspended") {
    await supabase.auth.signOut();
    const reason = profile?.status === "suspended" ? "suspended" : "access_denied";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  return NextResponse.redirect(
    `${origin}${sanitizeNextUrl(searchParams.get("next"))}`,
  );
}
