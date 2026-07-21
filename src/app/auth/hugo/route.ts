import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextUrl } from "@/app/(auth)/login/sanitize-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const next = sanitizeNextUrl(request.nextUrl.searchParams.get("next"));
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("flow", "sso");
  callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "custom:hugo",
    options: {
      redirectTo: callback.toString(),
      scopes: "openid email profile",
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/login?error=sso_failed`);
  }

  return NextResponse.redirect(data.url);
}
