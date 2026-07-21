import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextUrl } from "@/app/(auth)/login/sanitize-next";
import { createClient } from "@/lib/supabase/server";

import {
  createHugoLaunchNonce,
  HUGO_LAUNCH_COOKIE,
  HUGO_LAUNCH_MAX_AGE_SECONDS,
} from "./launch-nonce";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const next = sanitizeNextUrl(request.nextUrl.searchParams.get("next"));
  const launchNonce = createHugoLaunchNonce();
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("flow", "sso");
  callback.searchParams.set("next", next);
  callback.searchParams.set("launch_nonce", launchNonce);

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

  const response = NextResponse.redirect(data.url);
  response.cookies.set(HUGO_LAUNCH_COOKIE, launchNonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/callback",
    maxAge: HUGO_LAUNCH_MAX_AGE_SECONDS,
  });
  return response;
}
