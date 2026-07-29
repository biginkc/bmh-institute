import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Profile = { id: string; email: string; system_role: string };
let actor: Profile = { id: "admin-1", email: "a@b.com", system_role: "admin" };
let profileEmailRow: { email: string } | null = null;
let profileRoleRow: { system_role: string } | null = {
  system_role: "learner",
};
let profileRoleError: { message: string } | null = null;
let userRoleGroupsRows: Array<{ role_group_id: string }> = [];
let userRoleGroupsError: { message: string } | null = null;
let programAccessRows: Array<{
  role_group_id: string;
  program_id: string;
  is_published?: boolean;
}> = [];
let programRows: Array<{ id: string; title: string }> = [];
let rpcError: { message: string } | null = null;
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => actor),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        if (table === "user_role_groups") {
          return {
            eq: async () => ({
              data: userRoleGroupsRows,
              error: userRoleGroupsError,
            }),
          };
        }
        if (table === "program_access") {
          return {
            in: async (_column: string, ids: string[]) => ({
              data: programAccessRows
                .filter((row) => ids.includes(row.role_group_id))
                .map((row) => ({
                  program_id: row.program_id,
                  programs: { is_published: row.is_published ?? true },
                })),
              error: null,
            }),
          };
        }
        if (table === "programs") {
          return {
            in: async (_column: string, ids: string[]) => ({
              data: programRows.filter((row) => ids.includes(row.id)),
              error: null,
            }),
          };
        }
        if (table !== "profiles") {
          throw new Error(`Unexpected table ${table}`);
        }
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: columns === "system_role" ? profileRoleRow : profileEmailRow,
              error: columns === "system_role" ? profileRoleError : null,
            }),
          }),
        };
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { error: rpcError };
    },
  })),
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
import { saveUserSettings } from "./actions";

describe("saveUserSettings", () => {
  beforeEach(() => {
    actor = { id: "admin-1", email: "a@b.com", system_role: "admin" };
    profileEmailRow = null;
    profileRoleRow = { system_role: "learner" };
    profileRoleError = null;
    userRoleGroupsRows = [];
    userRoleGroupsError = null;
    programAccessRows = [];
    programRows = [];
    rpcError = null;
    rpcCalls.length = 0;
    vi.mocked(sendEmail).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves Institute role groups when the role is unchanged", async () => {
    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "learner",
      role_group_ids: ["group-1"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(rpcCalls).toEqual([
      {
        name: "fn_set_user_role_groups",
        args: {
          p_user_id: "learner-1",
          p_role_group_ids: ["group-1"],
        },
      },
    ]);
  });

  it("rejects role changes before mutating role groups", async () => {
    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "admin",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({
      ok: false,
      error:
        "This role cannot be changed safely until Institute can keep Hugo access in sync without changing login status.",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("does not mutate anything when the target role cannot be read", async () => {
    profileRoleError = { message: "profile role read failed" };

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "learner",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "profile role read failed",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("does not mutate anything when the target profile does not exist", async () => {
    profileRoleRow = null;

    await expect(
      saveUserSettings({
        userId: "missing-user",
        system_role: "learner",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "User not found.",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("does not mutate anything when current role groups cannot be read", async () => {
    userRoleGroupsError = { message: "role-group read failed" };

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "learner",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "role-group read failed",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("does not change the role when the role-group save fails", async () => {
    rpcError = { message: "role group insert failed" };

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "learner",
        role_group_ids: ["group-1"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "role group insert failed",
    });
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
      role_group_ids: ["old-group", "new-group"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: ["Pilot Program"] });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "learner@example.com",
      subject: "Enrollment",
      html: "<p>Enrollment</p>",
    });
  });

  it("does not claim an unpublished imported program in enrollment email", async () => {
    programAccessRows = [
      {
        role_group_id: "qa-group",
        program_id: "unreleased-program",
        is_published: false,
      },
    ];
    programRows = [{ id: "unreleased-program", title: "Unreleased Program" }];
    profileEmailRow = { email: "learner@example.com" };

    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "learner",
      role_group_ids: ["qa-group"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("prevents an owner from downgrading their own role", async () => {
    actor = { id: "owner-1", email: "owner@example.com", system_role: "owner" };

    const result = await saveUserSettings({
      userId: "owner-1",
      system_role: "admin",
      role_group_ids: [],
    });

    expect(result).toEqual({
      ok: false,
      error: "You can't downgrade your own role. You'd lock yourself out.",
    });
    expect(rpcCalls).toEqual([]);
  });
});
