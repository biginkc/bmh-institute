import { beforeEach, describe, expect, it, vi } from "vitest";
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

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
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
