// HARDEN-02: regression for applyInvite expiry handling.
// Mocks @/lib/supabase/admin to exercise the four invite states.
// CR-02: regression for the GET handler tearing down the session and the
// freshly created auth.users row when applyInvite returns expired.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InviteRow = {
  id: string;
  system_role: string;
  role_group_ids: string[];
  accepted_at: string | null;
  expires_at: string;
} | null;

let inviteRow: InviteRow = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const profileUpdate = vi.fn(async (_patch: any) => ({ error: null }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const userRoleInsert = vi.fn(async (_rows: any) => ({ error: null }));
const userRoleDelete = vi.fn(async () => ({ error: null }));
const adminAuthDeleteUser = vi.fn(async (_id: string) => ({
  data: null,
  error: null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "invites") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: inviteRow, error: null }),
            }),
          }),
          update: () => ({
            eq: async () => {
              return { error: null };
            },
          }),
        };
      }
      if (table === "profiles") {
        return {
          update: (patch: unknown) => ({
            eq: async () => {
              await profileUpdate(patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "user_role_groups") {
        return {
          delete: () => ({
            eq: async () => {
              await userRoleDelete();
              return { error: null };
            },
          }),
          upsert: async (rows: unknown) => {
            await userRoleInsert(rows);
            return { error: null };
          },
          insert: async (rows: unknown) => {
            await userRoleInsert(rows);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    auth: { admin: { deleteUser: adminAuthDeleteUser } },
  })),
}));

const exchangeCodeForSession = vi.fn(async (_code: string) => ({
  data: {
    session: { user: { id: "user-123" } },
  },
  error: null,
}));
const sessionSignOut = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
      signOut: sessionSignOut,
    },
  })),
}));

import { applyInvite, GET } from "./route";

describe("applyInvite (HARDEN-02)", () => {
  beforeEach(() => {
    inviteRow = null;
    profileUpdate.mockClear();
    userRoleInsert.mockClear();
    userRoleDelete.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("applies role assignment when the invite is active", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    inviteRow = {
      id: "inv-1",
      system_role: "admin",
      role_group_ids: ["g1"],
      accepted_at: null,
      expires_at: future,
    };

    const result = await applyInvite({ userId: "u-1", token: "tok-1" });
    expect(result).toEqual({ ok: true });
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ system_role: "admin" }),
    );
    expect(userRoleInsert).toHaveBeenCalled();
  });

  it("rejects with reason 'expired' when expires_at is in the past", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    inviteRow = {
      id: "inv-2",
      system_role: "admin",
      role_group_ids: ["g1"],
      accepted_at: null,
      expires_at: past,
    };

    const result = await applyInvite({ userId: "u-1", token: "tok-2" });
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(userRoleInsert).not.toHaveBeenCalled();
  });

  it("returns ok when the invite has already been accepted", async () => {
    inviteRow = {
      id: "inv-3",
      system_role: "admin",
      role_group_ids: ["g1"],
      accepted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await applyInvite({ userId: "u-1", token: "tok-3" });
    expect(result).toEqual({ ok: true });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(userRoleInsert).not.toHaveBeenCalled();
  });

  it("returns ok when no matching invite row exists", async () => {
    inviteRow = null;
    const result = await applyInvite({ userId: "u-1", token: "tok-missing" });
    expect(result).toEqual({ ok: true });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(userRoleInsert).not.toHaveBeenCalled();
  });
});

function makeRequest(url: string) {
  // The GET handler reads request.nextUrl.searchParams and request.nextUrl.origin.
  // Build a minimal stand-in instead of pulling NextRequest into the unit test.
  const u = new URL(url);
  return {
    nextUrl: {
      searchParams: u.searchParams,
      origin: u.origin,
    },
  } as unknown as Parameters<typeof GET>[0];
}

describe("auth callback GET (CR-02 expired-invite teardown)", () => {
  beforeEach(() => {
    inviteRow = null;
    profileUpdate.mockClear();
    userRoleInsert.mockClear();
    userRoleDelete.mockClear();
    adminAuthDeleteUser.mockClear();
    sessionSignOut.mockClear();
    exchangeCodeForSession.mockClear();
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: "user-123" } } },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("signs the session out and deletes the auth.users row when the invite is expired", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    inviteRow = {
      id: "inv-expired",
      system_role: "admin",
      role_group_ids: ["g1"],
      accepted_at: null,
      expires_at: past,
    };

    const res = await GET(
      makeRequest(
        "https://example.test/auth/callback?code=abc&invite_token=tok-expired",
      ),
    );

    expect(sessionSignOut).toHaveBeenCalledTimes(1);
    expect(adminAuthDeleteUser).toHaveBeenCalledWith("user-123");
    expect(res.headers.get("location")).toBe(
      "https://example.test/login?error=invite_expired",
    );
  });

  it("preserves invite_token for browser hash-token invite callbacks", async () => {
    const res = await GET(
      makeRequest("https://example.test/auth/callback?invite_token=tok-hash"),
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(
      "https://example.test/login?invite_token=tok-hash",
    );
  });

  it("does not call signOut or deleteUser when the invite is active", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    inviteRow = {
      id: "inv-ok",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
      expires_at: future,
    };

    await GET(
      makeRequest(
        "https://example.test/auth/callback?code=abc&invite_token=tok-ok&type=invite",
      ),
    );

    expect(sessionSignOut).not.toHaveBeenCalled();
    expect(adminAuthDeleteUser).not.toHaveBeenCalled();
  });

  it("redirects to /login?error=invite_expired even when the admin client throws on delete", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    inviteRow = {
      id: "inv-expired-2",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
      expires_at: past,
    };
    adminAuthDeleteUser.mockRejectedValueOnce(new Error("admin unavailable"));

    const res = await GET(
      makeRequest(
        "https://example.test/auth/callback?code=abc&invite_token=tok-expired",
      ),
    );

    // signOut still ran so the cookie session is cleared.
    expect(sessionSignOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toBe(
      "https://example.test/login?error=invite_expired",
    );
  });
});
