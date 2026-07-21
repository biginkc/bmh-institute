import { NextResponse, type NextRequest } from "next/server";

import { sanitizeNextUrl } from "@/app/(auth)/login/sanitize-next";
import { createClient } from "@/lib/supabase/server";

type AuthenticationMethod = string | { method?: string; timestamp?: number };

function methodName(method: AuthenticationMethod) {
  return typeof method === "string" ? method : method.method;
}

function hasOAuthAuthenticationMethod(methods: AuthenticationMethod[] | undefined) {
  return Boolean(methods?.some((method) => methodName(method) === "oauth"));
}

function hasCurrentHugoIdentity(
  identities: Array<{ provider?: string; last_sign_in_at?: string }> | undefined,
  methods: AuthenticationMethod[] | undefined,
) {
  const oauthTimestamp = Math.max(
    ...(
      methods
        ?.filter(
          (method) =>
            typeof method !== "string" &&
            method.method === "oauth" &&
            method.timestamp,
        )
        .map((method) =>
          typeof method === "string" ? 0 : (method.timestamp as number),
        ) ?? []
    ),
  );
  if (!Number.isFinite(oauthTimestamp)) return false;

  return Boolean(
    identities?.some((identity) => {
      if (identity.provider !== "custom:hugo" || !identity.last_sign_in_at) {
        return false;
      }
      const lastSignIn = Date.parse(identity.last_sign_in_at) / 1000;
      return Number.isFinite(lastSignIn) && Math.abs(lastSignIn - oauthTimestamp) <= 5;
    }),
  );
}

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

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
    data.session.access_token,
  );
  if (
    claimsError ||
    !claimsData ||
    !hasOAuthAuthenticationMethod(claimsData.claims.amr) ||
    !hasCurrentHugoIdentity(
      data.session.user.identities ?? undefined,
      claimsData.claims.amr,
    )
  ) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=sso_failed`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    const reason = profile?.status === "suspended" ? "suspended" : "access_denied";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  return NextResponse.redirect(
    `${origin}${sanitizeNextUrl(searchParams.get("next"))}`,
  );
}
