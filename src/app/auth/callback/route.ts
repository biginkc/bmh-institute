import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextUrl } from "@/app/(auth)/login/sanitize-next";
import {
  HUGO_LAUNCH_COOKIE,
  matchesHugoLaunchNonce,
} from "@/app/auth/hugo/launch-nonce";
import { createClient } from "@/lib/supabase/server";

type AuthenticationMethod = string | { method?: string; timestamp?: number };

function methodName(method: AuthenticationMethod) {
  return typeof method === "string" ? method : method.method;
}

function hasOAuthAuthenticationMethod(methods: AuthenticationMethod[] | undefined) {
  return Boolean(methods?.some((method) => methodName(method) === "oauth"));
}

function hasHugoIdentity(
  identities: Array<{ provider?: string }> | undefined,
) {
  return Boolean(
    identities?.some((identity) => identity.provider === "custom:hugo"),
  );
}

function redirectAfterConsumingLaunchNonce(url: string) {
  const response = NextResponse.redirect(url);
  response.cookies.set(HUGO_LAUNCH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/callback",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const hasValidLaunchNonce = matchesHugoLaunchNonce(
    request.cookies.get(HUGO_LAUNCH_COOKIE)?.value,
    searchParams.get("launch_nonce"),
  );

  // Only Hugo may establish a new Institute session. Historical invite,
  // recovery, signup, and magic-link callbacks are deliberately rejected.
  if (searchParams.get("flow") !== "sso" || !code || !hasValidLaunchNonce) {
    return redirectAfterConsumingLaunchNonce(
      `${origin}/login?error=sso_failed`,
    );
  }

  const supabase = await createClient();
  const { error, data } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return redirectAfterConsumingLaunchNonce(
      `${origin}/login?error=sso_failed`,
    );
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
    data.session.access_token,
  );
  if (
    claimsError ||
    !claimsData ||
    !hasOAuthAuthenticationMethod(claimsData.claims.amr) ||
    !hasHugoIdentity(data.session.user.identities ?? undefined)
  ) {
    await supabase.auth.signOut();
    return redirectAfterConsumingLaunchNonce(
      `${origin}/login?error=sso_failed`,
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    const reason = profile?.status === "suspended" ? "suspended" : "access_denied";
    return redirectAfterConsumingLaunchNonce(
      `${origin}/login?error=${reason}`,
    );
  }

  return redirectAfterConsumingLaunchNonce(
    `${origin}${sanitizeNextUrl(searchParams.get("next"))}`,
  );
}
