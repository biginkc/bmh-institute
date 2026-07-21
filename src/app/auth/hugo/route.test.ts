import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signInWithOAuth } })),
}));

import { GET } from "./route";

function makeRequest(url: string) {
  const nextUrl = new URL(url);
  return { nextUrl } as unknown as Parameters<typeof GET>[0];
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
        redirectTo:
          "https://institute.bmhgroupkc.com/auth/callback?flow=sso&next=%2Flessons%2Fabc",
        scopes: "openid email profile",
      },
    });
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
          redirectTo:
            "https://institute.bmhgroupkc.com/auth/callback?flow=sso&next=%2Fdashboard",
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
