import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionEq: vi.fn(),
  adminUpdate: vi.fn(),
  adminEq: vi.fn(),
  adminSelect: vi.fn(),
  adminMaybeSingle: vi.fn(),
  rpc: vi.fn(),
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
      from: () => ({
        update: mocks.sessionUpdate,
      }),
      rpc: mocks.rpc,
    });
    mocks.createAdminClient.mockReturnValue({
      from: () => ({
        update: mocks.adminUpdate,
      }),
    });
    mocks.sessionUpdate.mockReturnValue({ eq: mocks.sessionEq });
    mocks.sessionEq.mockResolvedValue({ error: null });
    mocks.adminUpdate.mockReturnValue({ eq: mocks.adminEq });
    mocks.adminEq.mockReturnValue({ select: mocks.adminSelect });
    mocks.adminSelect.mockReturnValue({
      maybeSingle: mocks.adminMaybeSingle,
    });
    mocks.adminMaybeSingle.mockResolvedValue({
      data: { id: "learner-1" },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("keeps Institute system-role editing", async () => {
    await expect(
      updateUserRole({
        userId: "learner-1",
        system_role: "admin",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.adminUpdate).toHaveBeenCalledWith({ system_role: "admin" });
    expect(mocks.adminEq).toHaveBeenCalledWith("id", "learner-1");
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("keeps the self-demotion guard", async () => {
    await expect(
      updateUserRole({
        userId: "owner-1",
        system_role: "admin",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "You can't change your own role here.",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.adminUpdate).not.toHaveBeenCalled();
  });

  it("reports a missing target instead of returning a false success", async () => {
    mocks.adminMaybeSingle.mockResolvedValue({
      data: null,
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

    await expect(
      updateUserRole({
        userId: "admin-1",
        system_role: "owner",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "You can't change your own role here.",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("keeps Institute role-group assignment", async () => {
    await expect(
      setUserRoleGroups({
        userId: "learner-1",
        role_group_ids: ["group-1"],
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.rpc).toHaveBeenCalledWith("fn_set_user_role_groups", {
      p_user_id: "learner-1",
      p_role_group_ids: ["group-1"],
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
