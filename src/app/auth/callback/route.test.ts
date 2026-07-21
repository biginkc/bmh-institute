import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const signOut = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession, signOut },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  })),
}));

import { GET } from "./route";

function makeRequest(url: string) {
  const nextUrl = new URL(url);
  return { nextUrl } as unknown as Parameters<typeof GET>[0];
}

describe("Hugo-only auth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: "existing-user" } } },
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
      makeRequest(
        "https://institute.bmhgroupkc.com/auth/callback?flow=sso&code=abc&next=/lessons/abc",
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/lessons/abc",
    );
  });

  it("rejects historical password, invite, recovery, and magic-link callbacks", async () => {
    const response = await GET(
      makeRequest(
        "https://institute.bmhgroupkc.com/auth/callback?code=legacy&type=recovery",
      ),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=sso_failed",
    );
  });

  it("signs out a Hugo identity with no provisioned Institute profile", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(
      makeRequest(
        "https://institute.bmhgroupkc.com/auth/callback?flow=sso&code=abc",
      ),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=access_denied",
    );
  });

  it("signs out a suspended Institute user without a redirect loop", async () => {
    maybeSingle.mockResolvedValue({
      data: { status: "suspended" },
      error: null,
    });

    const response = await GET(
      makeRequest(
        "https://institute.bmhgroupkc.com/auth/callback?flow=sso&code=abc",
      ),
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://institute.bmhgroupkc.com/login?error=suspended",
    );
  });
});
