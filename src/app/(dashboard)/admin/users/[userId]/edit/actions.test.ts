import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Profile = { id: string; email: string; system_role: string };
let actor: Profile = { id: "admin-1", email: "a@b.com", system_role: "admin" };
let profileEmailRow: { email: string } | null = null;
let userRoleGroupsRows: Array<{ role_group_id: string }> = [];
let userRoleGroupsError: { message: string } | null = null;
let programAccessRows: Array<{
  role_group_id: string;
  program_id: string;
  is_published?: boolean;
}> = [];
let programRows: Array<{ id: string; title: string }> = [];
let profileUpdateRow: { id: string } | null = { id: "learner-1" };
let profileUpdateError: { message: string } | null = null;
let rpcError: { message: string } | null = null;
let rpcErrors: Array<{ message: string } | null> = [];
const profileUpdateCalls: Array<{
  values: Record<string, unknown>;
  userId: string;
}> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const mutationEvents: string[] = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => actor),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => {
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
              data: profileEmailRow,
              error: null,
            }),
          }),
        };
      },
      update: (values: Record<string, unknown>) => {
        if (table !== "profiles") {
          throw new Error(`Unexpected update table ${table}`);
        }
        return {
          eq: (_column: string, userId: string) => {
            profileUpdateCalls.push({ values, userId });
            mutationEvents.push("role");
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: profileUpdateRow,
                  error: profileUpdateError,
                }),
              }),
            };
          },
        };
      },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      mutationEvents.push("role-groups");
      return {
        error: rpcErrors.length > 0 ? rpcErrors.shift()! : rpcError,
      };
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
    userRoleGroupsRows = [];
    userRoleGroupsError = null;
    programAccessRows = [];
    programRows = [];
    profileUpdateRow = { id: "learner-1" };
    profileUpdateError = null;
    rpcError = null;
    rpcErrors = [];
    profileUpdateCalls.length = 0;
    rpcCalls.length = 0;
    mutationEvents.length = 0;
    vi.mocked(sendEmail).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("changes an existing user's Institute role alongside role groups", async () => {
    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "admin",
      role_group_ids: ["group-1"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(mutationEvents).toEqual(["role-groups", "role"]);
    expect(profileUpdateCalls).toEqual([
      {
        values: { system_role: "admin" },
        userId: "learner-1",
      },
    ]);
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

  it("changes an existing user's Institute role without a role-group diff", async () => {
    userRoleGroupsRows = [{ role_group_id: "group-1" }];

    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "admin",
      role_group_ids: ["group-1"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(profileUpdateCalls).toEqual([
      {
        values: { system_role: "admin" },
        userId: "learner-1",
      },
    ]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not mutate anything when the rollback snapshot cannot be read", async () => {
    userRoleGroupsError = { message: "role-group read failed" };

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "admin",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "role-group read failed",
    });
    expect(rpcCalls).toEqual([]);
    expect(profileUpdateCalls).toEqual([]);
  });

  it("restores the previous role groups when the role update fails", async () => {
    userRoleGroupsRows = [{ role_group_id: "old-group" }];
    profileUpdateError = { message: "role update failed" };

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "learner",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({ ok: false, error: "role update failed" });
    expect(rpcCalls).toEqual([
      {
        name: "fn_set_user_role_groups",
        args: {
          p_user_id: "learner-1",
          p_role_group_ids: ["new-group"],
        },
      },
      {
        name: "fn_set_user_role_groups",
        args: {
          p_user_id: "learner-1",
          p_role_group_ids: ["old-group"],
        },
      },
    ]);
  });

  it("restores role groups when the target profile no longer exists", async () => {
    userRoleGroupsRows = [{ role_group_id: "old-group" }];
    profileUpdateRow = null;

    await expect(
      saveUserSettings({
        userId: "missing-user",
        system_role: "learner",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({ ok: false, error: "User not found." });
    expect(rpcCalls.at(-1)).toEqual({
      name: "fn_set_user_role_groups",
      args: {
        p_user_id: "missing-user",
        p_role_group_ids: ["old-group"],
      },
    });
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
    expect(profileUpdateCalls).toEqual([]);
  });

  it("reports both failures when role-group rollback also fails", async () => {
    userRoleGroupsRows = [{ role_group_id: "old-group" }];
    profileUpdateError = { message: "role update failed" };
    rpcErrors = [null, { message: "rollback failed" }];

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "admin",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({
      ok: false,
      error:
        "role update failed Role-group changes could not be restored: rollback failed",
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
