import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Profile = { id: string; email: string; system_role: string };
type RoleRpcResult = { ok: boolean; code?: string };

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
let roleRpcData: RoleRpcResult | null = { ok: true };
let roleRpcError: { message: string } | null = null;

const adminRpcCalls: Array<{
  name: string;
  args: Record<string, unknown>;
}> = [];
const sessionRpcCalls: Array<{
  name: string;
  args: Record<string, unknown>;
}> = [];
const adminMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

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
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      sessionRpcCalls.push({ name, args });
      return { data: null, error: null };
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: adminMocks.createAdminClient,
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
    roleRpcData = { ok: true };
    roleRpcError = null;
    adminRpcCalls.length = 0;
    sessionRpcCalls.length = 0;
    adminMocks.createAdminClient.mockReturnValue({
      rpc: async (name: string, args: Record<string, unknown>) => {
        adminRpcCalls.push({ name, args });
        return { data: roleRpcData, error: roleRpcError };
      },
    });
    vi.mocked(sendEmail).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("changes an existing user's role and role groups through one RPC", async () => {
    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "admin",
      role_group_ids: ["group-1"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(adminRpcCalls).toEqual([
      {
        name: "fn_update_institute_role",
        args: {
          p_actor_id: "admin-1",
          p_target_id: "learner-1",
          p_role: "admin",
          p_role_group_ids: ["group-1"],
        },
      },
    ]);
    expect(sessionRpcCalls).toEqual([]);
  });

  it("uses the same atomic RPC without a role-group diff", async () => {
    userRoleGroupsRows = [{ role_group_id: "group-1" }];

    const result = await saveUserSettings({
      userId: "learner-1",
      system_role: "admin",
      role_group_ids: ["group-1"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(adminRpcCalls).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not mutate when the enrollment diff snapshot cannot be read", async () => {
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
    expect(adminRpcCalls).toEqual([]);
  });

  it("returns an atomic RPC failure without a compensating write", async () => {
    roleRpcError = { message: "role update failed" };

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "learner",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({ ok: false, error: "role update failed" });
    expect(adminRpcCalls).toHaveLength(1);
    expect(sessionRpcCalls).toEqual([]);
  });

  it("reports a missing target from the write-time RPC", async () => {
    roleRpcData = { ok: false, code: "NOT_FOUND" };

    await expect(
      saveUserSettings({
        userId: "missing-user",
        system_role: "learner",
        role_group_ids: ["new-group"],
      }),
    ).resolves.toEqual({ ok: false, error: "User not found." });
    expect(adminRpcCalls).toHaveLength(1);
  });

  it("reports an atomically rejected role-group rewrite", async () => {
    roleRpcData = { ok: false, code: "ROLE_GROUP_NOT_FOUND" };

    await expect(
      saveUserSettings({
        userId: "learner-1",
        system_role: "admin",
        role_group_ids: ["missing-group"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "One or more role groups no longer exist.",
    });
    expect(adminRpcCalls).toHaveLength(1);
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

  it("keeps the owner self-demotion error from the database guard", async () => {
    actor = { id: "owner-1", email: "owner@example.com", system_role: "owner" };
    roleRpcData = { ok: false, code: "SELF_ROLE_CHANGE" };

    const result = await saveUserSettings({
      userId: "owner-1",
      system_role: "admin",
      role_group_ids: [],
    });

    expect(result).toEqual({
      ok: false,
      error: "You can't downgrade your own role. You'd lock yourself out.",
    });
    expect(adminRpcCalls).toHaveLength(1);
  });

  it("prevents a case-varied and whitespace-padded self promotion", async () => {
    const actorId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    actor = {
      id: actorId,
      email: "admin@example.com",
      system_role: "admin",
    };
    roleRpcData = { ok: false, code: "SELF_ROLE_CHANGE" };

    const result = await saveUserSettings({
      userId: `  ${actorId.toUpperCase()}  `,
      system_role: "owner",
      role_group_ids: [],
    });

    expect(result).toEqual({
      ok: false,
      error: "You can't downgrade your own role. You'd lock yourself out.",
    });
    expect(adminRpcCalls).toEqual([
      {
        name: "fn_update_institute_role",
        args: {
          p_actor_id: actorId,
          p_target_id: actorId.toUpperCase(),
          p_role: "owner",
          p_role_group_ids: [],
        },
      },
    ]);
  });

  it("allows an admin to save their own groups when the role is unchanged", async () => {
    actor = { id: "admin-1", email: "admin@example.com", system_role: "admin" };

    const result = await saveUserSettings({
      userId: "admin-1",
      system_role: "admin",
      role_group_ids: ["group-1"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: [] });
    expect(adminRpcCalls).toHaveLength(1);
  });
});
