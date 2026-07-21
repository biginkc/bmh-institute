import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  HUGO_LAUNCH_COOKIE,
  HUGO_LAUNCH_MAX_AGE_SECONDS,
} from "./launch-nonce";

const signInWithOAuth = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signInWithOAuth } })),
}));

import { GET } from "./route";

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe("GET /auth/hugo", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
  });

  it("starts custom:hugo and preserves a safe return path", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://hugo.bmhgroupkc.com/oauth/authorize?request=1" },
      error: null,
    });

    const response = await GET(
      makeRequest("https://institute.bmhgroupkc.com/auth/hugo?next=/lessons/abc"),
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "custom:hugo",
      options: {
        redirectTo: expect.stringContaining(
          "https://institute.bmhgroupkc.com/auth/callback?flow=sso&next=%2Flessons%2Fabc&launch_nonce=",
        ),
        scopes: "openid email profile",
      },
    });
    const redirectTo = new URL(
      signInWithOAuth.mock.calls[0][0].options.redirectTo,
    );
    const launchNonce = redirectTo.searchParams.get("launch_nonce");
    expect(launchNonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.cookies.get(HUGO_LAUNCH_COOKIE)?.value).toBe(launchNonce);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Path=/auth/callback");
    expect(response.headers.get("set-cookie")).toContain(
      `Max-Age=${HUGO_LAUNCH_MAX_AGE_SECONDS}`,
    );
    expect(response.headers.get("location")).toBe(
      "https://hugo.bmhgroupkc.com/oauth/authorize?request=1",
    );
  });

  it("rejects an external return target", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://hugo.bmhgroupkc.com/oauth/authorize?request=2" },
      error: null,
    });

    await GET(
      makeRequest(
        "https://institute.bmhgroupkc.com/auth/hugo?next=https://evil.example",
      ),
    );

    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: expect.stringContaining(
            "https://institute.bmhgroupkc.com/auth/callback?flow=sso&next=%2Fdashboard&launch_nonce=",
          ),
        }),
      }),
    );
  });

  it("returns to the one-button login surface if startup fails", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("provider unavailable"),
    });

    const response = await GET(
      makeRequest("https://institute.bmhgroupkc.com/auth/hugo"),
    );

    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
  });
});
