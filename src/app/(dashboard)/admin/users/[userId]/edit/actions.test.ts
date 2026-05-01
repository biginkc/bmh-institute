// HARDEN-03: regression for deleteUser. Six branches: self, last-owner,
// owner-with-peers, non-owner, admin-client-fail, auth-delete-fail.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Profile = { id: string; email: string; system_role: string };
let actor: Profile = { id: "admin-1", email: "a@b.com", system_role: "admin" };
let targetRow: { system_role: string } | null = null;
let ownerCount = 0;
let adminFactoryThrows: Error | null = null;
const deleteUserSpy = vi.fn(
  async (_id: string) => ({
    data: null,
    error: null as { message: string } | null,
  }),
);

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => actor),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: (
          _cols: string,
          opts?: { count?: string; head?: boolean },
        ) => {
          if (opts?.count === "exact") {
            return {
              eq: async () => ({ count: ownerCount, error: null }),
            };
          }
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: targetRow, error: null }),
            }),
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
      auth: { admin: { deleteUser: deleteUserSpy } },
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteUser } from "./actions";

describe("deleteUser (HARDEN-03)", () => {
  beforeEach(() => {
    actor = { id: "admin-1", email: "a@b.com", system_role: "admin" };
    targetRow = null;
    ownerCount = 0;
    adminFactoryThrows = null;
    deleteUserSpy.mockReset();
    deleteUserSpy.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to delete the acting admin themselves", async () => {
    const result = await deleteUser("admin-1");
    expect(result).toEqual({ ok: false, error: "You can't delete yourself." });
    expect(deleteUserSpy).not.toHaveBeenCalled();
  });

  it("refuses to delete the last remaining owner", async () => {
    targetRow = { system_role: "owner" };
    ownerCount = 1;
    const result = await deleteUser("owner-2");
    expect(result).toEqual({
      ok: false,
      error: "Can't delete the last owner.",
    });
    expect(deleteUserSpy).not.toHaveBeenCalled();
  });

  it("allows deletion of an owner when at least one other owner remains", async () => {
    targetRow = { system_role: "owner" };
    ownerCount = 2;
    const result = await deleteUser("owner-2");
    expect(result).toEqual({ ok: true });
    expect(deleteUserSpy).toHaveBeenCalledWith("owner-2");
  });

  it("calls admin.auth.admin.deleteUser for a non-owner target", async () => {
    targetRow = { system_role: "admin" };
    const result = await deleteUser("admin-2");
    expect(result).toEqual({ ok: true });
    expect(deleteUserSpy).toHaveBeenCalledWith("admin-2");
  });

  it("surfaces the admin client error when env vars are missing", async () => {
    targetRow = { system_role: "admin" };
    adminFactoryThrows = new Error("Service role key missing");
    const result = await deleteUser("admin-2");
    expect(result).toEqual({ ok: false, error: "Service role key missing" });
  });

  it("surfaces auth.admin.deleteUser failure", async () => {
    targetRow = { system_role: "admin" };
    deleteUserSpy.mockResolvedValueOnce({
      data: null,
      error: { message: "user not found" },
    });
    const result = await deleteUser("admin-2");
    expect(result).toEqual({ ok: false, error: "user not found" });
  });
});
