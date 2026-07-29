import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
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
  createClient: vi.fn(async () => ({
    from: () => ({
      update: mocks.update,
    }),
    rpc: mocks.rpc,
  })),
}));

import { setUserRoleGroups, updateUserRole } from "./actions";

describe("Institute user roles and course access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
    });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("keeps Institute system-role editing", async () => {
    await expect(
      updateUserRole({
        userId: "learner-1",
        system_role: "admin",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.update).toHaveBeenCalledWith({ system_role: "admin" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "learner-1");
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
    expect(mocks.update).not.toHaveBeenCalled();
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
  });
});
