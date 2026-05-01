// HARDEN-02: regression for resendInvite. Six branches covering requireAdmin
// gating, admin client acquisition failure, accepted-invite rejection,
// missing-invite rejection, happy-path token rotation, and inviteUserByEmail
// failure surfacing. Mocks @/lib/auth/guard, @/lib/supabase/server,
// @/lib/supabase/admin, and next/cache. Uses the same call-order pattern as
// plan 1-1's HARDEN-01 regression so requireAdmin gating is verified, not
// just exercised.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

let inviteRow:
  | {
      id: string;
      email: string;
      system_role: string;
      role_group_ids: string[];
      accepted_at: string | null;
    }
  | null = null;

let lookupError: { message: string } | null = null;
let updatePatch: Record<string, unknown> | null = null;
let updateError: { message: string } | null = null;
let inviteEmailArgs: { email: string; opts: Record<string, unknown> } | null =
  null;
let inviteEmailError: { message: string } | null = null;
let adminFactoryThrows: Error | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", email: "admin@bmh.test", system_role: "owner" };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "invites") {
        throw new Error(`Unexpected learner-client table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push("invites.select");
              return { data: inviteRow, error: lookupError };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePatch = patch;
          return {
            eq: async () => {
              calls.push("invites.update");
              return { error: updateError };
            },
          };
        },
      };
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (adminFactoryThrows) throw adminFactoryThrows;
    return {
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(
            async (email: string, opts: Record<string, unknown>) => {
              inviteEmailArgs = { email, opts };
              calls.push("inviteUserByEmail");
              return { data: null, error: inviteEmailError };
            },
          ),
        },
      },
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resendInvite } from "./actions";

describe("resendInvite (HARDEN-02)", () => {
  beforeEach(() => {
    calls.length = 0;
    inviteRow = null;
    lookupError = null;
    updatePatch = null;
    updateError = null;
    inviteEmailArgs = null;
    inviteEmailError = null;
    adminFactoryThrows = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls requireAdmin before any Supabase work", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
    };
    const result = await resendInvite("inv-1");
    expect(result).toEqual({ ok: true });
    expect(calls[0]).toBe("requireAdmin");
    const guardIdx = calls.indexOf("requireAdmin");
    const supabaseFirstIdx = Math.min(
      ...["invites.select", "invites.update", "inviteUserByEmail"]
        .map((label) => calls.indexOf(label))
        .filter((idx) => idx >= 0),
    );
    expect(guardIdx).toBeLessThan(supabaseFirstIdx);
  });

  it("returns the admin client error when env vars are missing", async () => {
    adminFactoryThrows = new Error("Service role key missing");
    const result = await resendInvite("inv-1");
    expect(result).toEqual({
      ok: false,
      error: "Service role key missing",
    });
    expect(calls).not.toContain("invites.select");
    expect(calls).not.toContain("invites.update");
    expect(calls).not.toContain("inviteUserByEmail");
  });

  it("rejects when the invite has already been accepted", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: "2026-04-01T00:00:00.000Z",
    };
    const result = await resendInvite("inv-1");
    expect(result).toEqual({
      ok: false,
      error: "This invite was already accepted.",
    });
    expect(calls).not.toContain("invites.update");
    expect(calls).not.toContain("inviteUserByEmail");
  });

  it("rejects when the invite is not found", async () => {
    inviteRow = null;
    const result = await resendInvite("inv-missing");
    expect(result).toEqual({ ok: false, error: "Invite not found." });
    expect(calls).not.toContain("invites.update");
    expect(calls).not.toContain("inviteUserByEmail");
  });

  it("rotates the token and refreshes expires_at on the happy path", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
    };
    const before = Date.now();
    const result = await resendInvite("inv-1");
    expect(result).toEqual({ ok: true });
    expect(updatePatch).not.toBeNull();
    const newToken = updatePatch!.token as string;
    expect(typeof newToken).toBe("string");
    expect(newToken.length).toBeGreaterThan(0);
    expect(newToken).not.toBe("old-token");
    const newExpiry = new Date(updatePatch!.expires_at as string).getTime();
    expect(newExpiry).toBeGreaterThan(before);
    expect(inviteEmailArgs).not.toBeNull();
    expect(inviteEmailArgs!.email).toBe("u@example.com");
    expect(String(inviteEmailArgs!.opts.redirectTo)).toContain(
      encodeURIComponent(newToken),
    );
  });

  it("surfaces inviteUserByEmail failure", async () => {
    inviteRow = {
      id: "inv-1",
      email: "u@example.com",
      system_role: "admin",
      role_group_ids: [],
      accepted_at: null,
    };
    inviteEmailError = { message: "rate limited" };
    const result = await resendInvite("inv-1");
    expect(result).toEqual({
      ok: false,
      error: "Supabase rejected the invite: rate limited",
    });
  });
});
