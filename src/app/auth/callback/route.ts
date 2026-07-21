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

function supabaseAuthCookieBase(): string | null {
  try {
    const projectRef = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    ).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function expireSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const base = supabaseAuthCookieBase();
  if (!base) return response;

  const names = new Set<string>([
    base,
    `${base}-code-verifier`,
    `${base}-user`,
  ]);
  for (let chunk = 0; chunk < 5; chunk += 1) {
    names.add(`${base}.${chunk}`);
    names.add(`${base}-code-verifier.${chunk}`);
    names.add(`${base}-user.${chunk}`);
  }
  for (const { name } of request.cookies.getAll()) {
    if (
      name === base ||
      name.startsWith(`${base}.`) ||
      name.startsWith(`${base}-code-verifier`) ||
      name.startsWith(`${base}-user`)
    ) {
      names.add(name);
    }
  }

  for (const name of names) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
  }
  return response;
}

async function rejectExchangedSession(
  request: NextRequest,
  supabase: Awaited<ReturnType<typeof createClient>>,
  url: string,
): Promise<NextResponse> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The explicit cookie expiry below is the final local-session boundary.
  }
  return expireSupabaseAuthCookies(
    request,
    redirectAfterConsumingLaunchNonce(url),
  );
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

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return redirectAfterConsumingLaunchNonce(
      `${origin}/login?error=sso_failed`,
    );
  }

  let exchange: Awaited<
    ReturnType<typeof supabase.auth.exchangeCodeForSession>
  >;
  try {
    exchange = await supabase.auth.exchangeCodeForSession(code);
  } catch {
    return rejectExchangedSession(
      request,
      supabase,
      `${origin}/login?error=sso_failed`,
    );
  }
  const { error, data } = exchange;
  if (error || !data.session) {
    return rejectExchangedSession(
      request,
      supabase,
      `${origin}/login?error=sso_failed`,
    );
  }

  let claimsResult: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    claimsResult = await supabase.auth.getClaims(data.session.access_token);
  } catch {
    return rejectExchangedSession(
      request,
      supabase,
      `${origin}/login?error=sso_failed`,
    );
  }
  const { data: claimsData, error: claimsError } = claimsResult;
  if (
    claimsError ||
    !claimsData ||
    !hasOAuthAuthenticationMethod(claimsData.claims.amr) ||
    !hasHugoIdentity(data.session.user.identities ?? undefined)
  ) {
    return rejectExchangedSession(
      request,
      supabase,
      `${origin}/login?error=sso_failed`,
    );
  }

  let profile: { status: string } | null = null;
  try {
    const result = await supabase
      .from("profiles")
      .select("status")
      .eq("id", data.session.user.id)
      .maybeSingle();
    profile = result.data;
  } catch {
    return rejectExchangedSession(
      request,
      supabase,
      `${origin}/login?error=access_denied`,
    );
  }

  if (!profile || profile.status !== "active") {
    const reason = profile?.status === "suspended" ? "suspended" : "access_denied";
    return rejectExchangedSession(
      request,
      supabase,
      `${origin}/login?error=${reason}`,
    );
  }

  return redirectAfterConsumingLaunchNonce(
    `${origin}${sanitizeNextUrl(searchParams.get("next"))}`,
  );
}
