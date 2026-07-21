import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";

import { HUGO_LAUNCH_COOKIE } from "@/app/auth/hugo/launch-nonce";

const exchangeCodeForSession = vi.fn();
const getClaims = vi.fn();
const signOut = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession, getClaims, signOut },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  })),
}));

import { GET } from "./route";

const LAUNCH_NONCE = "3d1fa0bb-f8b5-4f7c-8a98-8a074585fafe";

function makeRequest(url: string, cookieNonce: string | null = LAUNCH_NONCE) {
  return new NextRequest(url, {
    headers: cookieNonce
      ? { cookie: `${HUGO_LAUNCH_COOKIE}=${cookieNonce}` }
      : undefined,
  });
}

function callbackUrl(query: string) {
  return `https://institute.bmhgroupkc.com/auth/callback?${query}&launch_nonce=${LAUNCH_NONCE}`;
}

function expectLaunchNonceConsumed(response: NextResponse) {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain(`${HUGO_LAUNCH_COOKIE}=`);
  expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  expect(setCookie).toContain("Max-Age=0");
  expect(setCookie).toContain("Path=/auth/callback");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=lax");
}

describe("Hugo-only auth callback", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: "oauth-access-token",
          user: {
            id: "existing-user",
            identities: [
              {
                provider: "custom:hugo",
                // A linked identity may predate this login. Freshness is proven
                // by the launch nonce and the signed OAuth AMR, not this field.
                last_sign_in_at: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        },
      },
      error: null,
    });
    getClaims.mockResolvedValue({
      data: {
        claims: { amr: [{ method: "oauth", timestamp: 1784613600 }] },
      },
      error: null,
    });
    maybeSingle.mockResolvedValue({
      data: { status: "active" },
      error: null,
    });
    signOut.mockResolvedValue({ error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://dhvfsyteqsxagokoerrx.supabase.co";
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it("lands a provisioned active Hugo user on the requested page", async () => {
    const response = await GET(
      makeRequest(callbackUrl("flow=sso&code=abc&next=/lessons/abc")),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/lessons/abc",
    );
    expectLaunchNonceConsumed(response);
  });

  it("allows a repeat Hugo login when the linked identity timestamp is stale but AMR is fresh", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: { amr: [{ method: "oauth", timestamp: 1893456000 }] },
      },
      error: null,
    });

    const response = await GET(
      makeRequest(callbackUrl("flow=sso&code=repeat-login")),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("repeat-login");
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/dashboard",
    );
    expectLaunchNonceConsumed(response);
  });

  it("rejects historical password, invite, recovery, and magic-link callbacks", async () => {
    const response = await GET(
      makeRequest(
        callbackUrl("code=legacy&type=recovery"),
      ),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
    expectLaunchNonceConsumed(response);
  });

  it("rejects a callback when the launch nonce cookie is missing", async () => {
    const response = await GET(
      makeRequest(callbackUrl("flow=sso&code=missing-cookie"), null),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
    expectLaunchNonceConsumed(response);
  });

  it("rejects and consumes a mismatched launch nonce", async () => {
    const response = await GET(
      makeRequest(callbackUrl("flow=sso&code=mismatch"), "different-nonce"),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
    expectLaunchNonceConsumed(response);
  });

  it("rejects a replay after the launch nonce cookie was consumed", async () => {
    const firstResponse = await GET(
      makeRequest(callbackUrl("flow=sso&code=first")),
    );
    expect(firstResponse.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/dashboard",
    );
    expectLaunchNonceConsumed(firstResponse);

    exchangeCodeForSession.mockClear();
    const replayResponse = await GET(
      makeRequest(callbackUrl("flow=sso&code=replay"), null),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(replayResponse.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
    expectLaunchNonceConsumed(replayResponse);
  });

  it("rejects a forged callback marker when the exchanged grant was not OAuth", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { amr: [{ method: "magiclink", timestamp: 1 }] } },
      error: null,
    });

    const response = await GET(
      makeRequest(
        callbackUrl("flow=sso&code=forged"),
      ),
    );

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
    expectLaunchNonceConsumed(response);
  });

  it("expires the full Institute auth-cookie namespace when local sign-out returns an error", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { amr: [{ method: "password", timestamp: 1 }] } },
      error: null,
    });
    signOut.mockResolvedValue({ error: { message: "logout failed" } });
    const request = makeRequest(callbackUrl("flow=sso&code=forged"));
    request.cookies.set(
      "sb-dhvfsyteqsxagokoerrx-auth-token.0",
      "seeded-session-chunk",
    );
    request.cookies.set(
      "sb-dhvfsyteqsxagokoerrx-auth-token-code-verifier",
      "seeded-verifier",
    );
    request.cookies.set(
      "sb-dhvfsyteqsxagokoerrx-auth-token-user",
      "seeded-user",
    );
    request.cookies.set("unrelated", "keep");

    const response = await GET(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(setCookie).toContain("sb-dhvfsyteqsxagokoerrx-auth-token=");
    expect(setCookie).toContain("sb-dhvfsyteqsxagokoerrx-auth-token.0=");
    expect(setCookie).toContain("sb-dhvfsyteqsxagokoerrx-auth-token.4=");
    expect(setCookie).toContain(
      "sb-dhvfsyteqsxagokoerrx-auth-token-code-verifier=",
    );
    expect(setCookie).toContain(
      "sb-dhvfsyteqsxagokoerrx-auth-token-user=",
    );
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).not.toContain("unrelated=");
    expectLaunchNonceConsumed(response);
  });

  it("expires auth cookies when the code exchange throws", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("exchange failed"));
    const request = makeRequest(callbackUrl("flow=sso&code=throws"));
    request.cookies.set(
      "sb-dhvfsyteqsxagokoerrx-auth-token",
      "seeded-session",
    );

    const response = await GET(request);

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "sb-dhvfsyteqsxagokoerrx-auth-token=",
    );
    expectLaunchNonceConsumed(response);
  });

  it("expires auth cookies when post-exchange authorization throws", async () => {
    maybeSingle.mockRejectedValue(new Error("profiles unavailable"));
    const request = makeRequest(callbackUrl("flow=sso&code=profile-throws"));
    request.cookies.set(
      "sb-dhvfsyteqsxagokoerrx-auth-token-code-verifier.1",
      "seeded-verifier-chunk",
    );

    const response = await GET(request);

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=access_denied",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "sb-dhvfsyteqsxagokoerrx-auth-token-code-verifier.1=",
    );
    expectLaunchNonceConsumed(response);
  });

  it("expires auth cookies and redirects when local sign-out throws", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    signOut.mockRejectedValue(new Error("local storage failed"));
    const request = makeRequest(callbackUrl("flow=sso&code=missing-profile"));
    request.cookies.set(
      "sb-dhvfsyteqsxagokoerrx-auth-token.3",
      "seeded-session-chunk",
    );

    const response = await GET(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=access_denied",
    );
    expect(setCookie).toContain("sb-dhvfsyteqsxagokoerrx-auth-token.3=");
    expect(setCookie).toContain("Max-Age=0");
    expectLaunchNonceConsumed(response);
  });

  it("does not expire Institute auth cookies for an authorized Hugo session", async () => {
    const request = makeRequest(callbackUrl("flow=sso&code=authorized"));
    request.cookies.set(
      "sb-dhvfsyteqsxagokoerrx-auth-token",
      "existing-session",
    );

    const response = await GET(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/dashboard",
    );
    expect(setCookie).not.toContain("sb-dhvfsyteqsxagokoerrx-auth-token=");
    expectLaunchNonceConsumed(response);
  });

  it("rejects an OAuth callback whose current identity is not custom:hugo", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: "other-oauth-token",
          user: {
            id: "existing-user",
            identities: [
              {
                provider: "google",
              },
            ],
          },
        },
      },
      error: null,
    });

    const response = await GET(
      makeRequest(
        callbackUrl("flow=sso&code=google"),
      ),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
    expectLaunchNonceConsumed(response);
  });

  it("signs out a Hugo identity with no provisioned Institute profile", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(
      makeRequest(
        callbackUrl("flow=sso&code=abc"),
      ),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=access_denied",
    );
    expectLaunchNonceConsumed(response);
  });

  it("signs out a suspended Institute user without a redirect loop", async () => {
    maybeSingle.mockResolvedValue({
      data: { status: "suspended" },
      error: null,
    });

    const response = await GET(
      makeRequest(
        callbackUrl("flow=sso&code=abc"),
      ),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=suspended",
    );
    expectLaunchNonceConsumed(response);
  });

  it("signs out an invited Institute profile until access is activated", async () => {
    maybeSingle.mockResolvedValue({
      data: { status: "invited" },
      error: null,
    });

    const response = await GET(
      makeRequest(
        callbackUrl("flow=sso&code=abc"),
      ),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=access_denied",
    );
    expectLaunchNonceConsumed(response);
  });
});
