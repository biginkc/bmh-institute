// HARDEN-02: regression for applyInvite expiry handling.
// Mocks @/lib/supabase/admin to exercise the four invite states.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InviteRow = {
  id: string;
  system_role: string;
  role_group_ids: string[];
  accepted_at: string | null;
  expires_at: string;
} | null;

let inviteRow: InviteRow = null;
const profileUpdate = vi.fn(async () => ({ error: null }));
const userRoleInsert = vi.fn(async () => ({ error: null }));
const userRoleDelete = vi.fn(async () => ({ error: null }));

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
  })),
}));

import { applyInvite } from "./route";

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
