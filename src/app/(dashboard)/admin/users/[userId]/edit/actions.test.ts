// HARDEN-03: regression for deleteUser. Six branches: self, last-owner,
// owner-with-peers, non-owner, admin-client-fail, auth-delete-fail.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Profile = { id: string; email: string; system_role: string };
let actor: Profile = { id: "admin-1", email: "a@b.com", system_role: "admin" };
let targetRow: { system_role: string } | null = null;
let profileEmailRow: { email: string } | null = null;
let ownerCount = 0;
let adminFactoryThrows: Error | null = null;
let userRoleGroupsRows: Array<{ role_group_id: string }> = [];
let programAccessRows: Array<{ role_group_id: string; program_id: string }> = [];
let programRows: Array<{ id: string; title: string }> = [];
let rpcError: { message: string } | null = null;
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const deleteUserSpy = vi.fn(
  async (id: string) => {
    void id;
    return {
      data: null,
      error: null as { message: string } | null,
    };
  },
);

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => actor),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      return {
        select: (
          cols: string,
          opts?: { count?: string; head?: boolean },
        ) => {
          if (table === "user_role_groups") {
            return {
              eq: async () => ({ data: userRoleGroupsRows, error: null }),
            };
          }
          if (table === "program_access") {
            return {
              in: async (_col: string, ids: string[]) => ({
                data: programAccessRows
                  .filter((row) => ids.includes(row.role_group_id))
                  .map((row) => ({ program_id: row.program_id })),
                error: null,
              }),
            };
          }
          if (table === "programs") {
            return {
              in: async (_col: string, ids: string[]) => ({
                data: programRows.filter((row) => ids.includes(row.id)),
                error: null,
              }),
            };
          }
          if (table !== "profiles") {
            throw new Error(`Unexpected table ${table}`);
          }
          if (opts?.count === "exact") {
            return {
              eq: async () => ({ count: ownerCount, error: null }),
            };
          }
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: cols === "email" ? profileEmailRow : targetRow,
                error: null,
              }),
            }),
          };
        },
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { error: rpcError };
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
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://institute.test" }));
vi.mock("@/lib/email/enrollment", () => ({
  renderEnrollmentEmail: vi.fn(() => ({
    subject: "Enrollment",
    html: "<p>Enrollment</p>",
  })),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

import { sendEmail } from "@/lib/email/send";
import { deleteUser, saveUserSettings } from "./actions";

describe("deleteUser (HARDEN-03)", () => {
  beforeEach(() => {
    actor = { id: "admin-1", email: "a@b.com", system_role: "admin" };
    targetRow = null;
    profileEmailRow = null;
    ownerCount = 0;
    adminFactoryThrows = null;
    userRoleGroupsRows = [];
    programAccessRows = [];
    programRows = [];
    rpcError = null;
    rpcCalls.length = 0;
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

  it("translates the migration 010 trigger raise into the friendly last-owner toast", async () => {
    // WR-04: when a concurrent delete has already removed the only other
    // owner, fn_prevent_last_owner_deletion fires on cascade and the
    // auth delete returns a Postgres check_violation surfaced through
    // the admin SDK as a generic message containing "last remaining
    // owner". Translate to the same friendly string the in-process
    // guard returns so the UX is consistent regardless of who lost the
    // race.
    targetRow = { system_role: "admin" };
    deleteUserSpy.mockResolvedValueOnce({
      data: null,
      error: {
        message:
          "Database error: Cannot delete the last remaining owner.",
      },
    });
    const result = await deleteUser("admin-2");
    expect(result).toEqual({
      ok: false,
      error: "Can't delete the last owner.",
    });
  });
});

describe("saveUserSettings", () => {
  beforeEach(() => {
    actor = { id: "admin-1", email: "a@b.com", system_role: "admin" };
    targetRow = null;
    profileEmailRow = null;
    userRoleGroupsRows = [];
    programAccessRows = [];
    programRows = [];
    rpcError = null;
    rpcCalls.length = 0;
    vi.mocked(sendEmail).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves role, status, and role groups through the transactional RPC", async () => {
    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "learner",
      status: "active",
      role_group_ids: ["group-1"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(rpcCalls).toEqual([
      {
        name: "fn_save_user_settings",
        args: {
          p_user_id: "learner-1",
          p_system_role: "learner",
          p_status: "active",
          p_role_group_ids: ["group-1"],
        },
      },
    ]);
  });

  it("returns new program titles and sends enrollment email for newly granted programs", async () => {
    userRoleGroupsRows = [{ role_group_id: "old-group" }];
    programAccessRows = [
      { role_group_id: "old-group", program_id: "program-old" },
      { role_group_id: "new-group", program_id: "program-new" },
    ];
    programRows = [{ id: "program-new", title: "Pilot Program" }];
    profileEmailRow = { email: "learner@example.com" };

    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "learner",
      status: "active",
      role_group_ids: ["old-group", "new-group"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: ["Pilot Program"] });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "learner@example.com",
      subject: "Enrollment",
      html: "<p>Enrollment</p>",
    });
  });

  it("prevents an owner from downgrading their own role", async () => {
    actor = { id: "owner-1", email: "owner@example.com", system_role: "owner" };

    const result = await saveUserSettings({
      userId: "owner-1",
      system_role: "admin",
      status: "active",
      role_group_ids: [],
    });

    expect(result).toEqual({
      ok: false,
      error: "You can't downgrade your own role. You'd lock yourself out.",
    });
    expect(rpcCalls).toEqual([]);
  });
});
