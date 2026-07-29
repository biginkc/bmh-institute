import { beforeEach, describe, expect, it, vi } from "vitest";

let calls: Array<{ name: string; params: Record<string, unknown> }> = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", system_role: "owner" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });
      return { error: null };
    },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setRoleGroupAccess } from "./actions";

describe("setRoleGroupAccess", () => {
  beforeEach(() => { calls = []; });

  it("delegates an idempotent program grant to the transactional RPC", async () => {
    await expect(setRoleGroupAccess({
      roleGroupId: "group-1",
      scope: "program",
      targetId: "program-1",
      enabled: true,
    })).resolves.toEqual({ ok: true });
    expect(calls).toEqual([{
      name: "fn_set_role_group_access",
      params: {
        p_role_group_id: "group-1",
        p_scope: "program",
        p_target_id: "program-1",
        p_enabled: true,
      },
    }]);
  });

  it("rejects an invalid scope before touching the database", async () => {
    await expect(setRoleGroupAccess({
      roleGroupId: "group-1",
      scope: "module" as "program",
      targetId: "module-1",
      enabled: true,
    })).resolves.toEqual({ ok: false, error: "Choose a program or course access scope." });
    expect(calls).toHaveLength(0);
  });
});
