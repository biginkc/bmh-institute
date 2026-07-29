import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  sessionRpc: vi.fn(),
  adminRpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { setUserRoleGroups, updateUserRole } from "./actions";

describe("Institute user roles and course access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      system_role: "owner",
    });
    mocks.createClient.mockResolvedValue({
      rpc: mocks.sessionRpc,
    });
    mocks.createAdminClient.mockReturnValue({
      rpc: mocks.adminRpc,
    });
    mocks.sessionRpc.mockResolvedValue({ data: null, error: null });
    mocks.adminRpc.mockResolvedValue({
      data: { ok: true, status: "updated" },
      error: null,
    });
  });

  it("keeps standalone Institute system-role editing on the atomic RPC", async () => {
    await expect(
      updateUserRole({
        userId: "learner-1",
        system_role: "admin",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "fn_update_institute_role",
      {
        p_actor_id: "owner-1",
        p_target_id: "learner-1",
        p_role: "admin",
        p_role_group_ids: null,
      },
    );
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });

  it("keeps the self-demotion guard", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: { ok: false, code: "SELF_ROLE_CHANGE" },
      error: null,
    });

    await expect(
      updateUserRole({
        userId: "owner-1",
        system_role: "admin",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "You can't change your own role here.",
    });
  });

  it("reports a missing target instead of returning a false success", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: { ok: false, code: "NOT_FOUND" },
      error: null,
    });

    await expect(
      updateUserRole({
        userId: "missing-user",
        system_role: "admin",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "User not found.",
    });
  });

  it("does not let an admin promote their own role", async () => {
    mocks.requireAdmin.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      system_role: "admin",
    });
    mocks.adminRpc.mockResolvedValueOnce({
      data: { ok: false, code: "SELF_ROLE_CHANGE" },
      error: null,
    });

    await expect(
      updateUserRole({
        userId: "admin-1",
        system_role: "owner",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "You can't change your own role here.",
    });
  });

  it("does not let case or whitespace bypass the database self-role guard", async () => {
    const actorId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    mocks.requireAdmin.mockResolvedValue({
      id: actorId,
      email: "admin@example.com",
      system_role: "admin",
    });
    mocks.adminRpc.mockResolvedValueOnce({
      data: { ok: false, code: "SELF_ROLE_CHANGE" },
      error: null,
    });

    await expect(
      updateUserRole({
        userId: `  ${actorId.toUpperCase()}  `,
        system_role: "owner",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "You can't change your own role here.",
    });
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "fn_update_institute_role",
      {
        p_actor_id: actorId,
        p_target_id: actorId.toUpperCase(),
        p_role: "owner",
        p_role_group_ids: null,
      },
    );
  });

  it("rejects a caller who lost admin status before the write", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: { ok: false, code: "NOT_ADMIN" },
      error: null,
    });

    await expect(
      updateUserRole({
        userId: "learner-1",
        system_role: "admin",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Admin access required.",
    });
  });

  it("keeps Institute role-group assignment", async () => {
    await expect(
      setUserRoleGroups({
        userId: "learner-1",
        role_group_ids: ["group-1"],
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.sessionRpc).toHaveBeenCalledWith("fn_set_user_role_groups", {
      p_user_id: "learner-1",
      p_role_group_ids: ["group-1"],
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
