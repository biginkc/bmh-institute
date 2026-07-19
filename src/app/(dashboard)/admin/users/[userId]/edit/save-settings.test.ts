// INTEG-01: saveUserSettings must persist profile role/status and role groups
// through one transactional database function.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let actor = { id: "admin-1", email: "admin@bmh.test", system_role: "owner" };
let rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
let rpcError: { message: string } | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => actor),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return { data: null, error: rpcError };
    },
    from: (table: string) => {
      if (table === "user_role_groups") {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ role_group_id: "old-group" }],
              error: null,
            }),
          }),
        };
      }
      if (table === "program_access") {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: ids.includes("new-group")
                ? [
                    {
                      program_id: "program-1",
                      programs: { is_published: true },
                    },
                  ]
                : [],
              error: null,
            }),
          }),
        };
      }
      if (table === "programs") {
        return {
          select: () => ({
            in: async () => ({
              data: [{ id: "program-1", title: "Program One" }],
              error: null,
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { email: "learner@bmh.test" },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveUserSettings } from "./actions";

describe("saveUserSettings (INTEG-01)", () => {
  beforeEach(() => {
    actor = { id: "admin-1", email: "admin@bmh.test", system_role: "owner" };
    rpcCalls = [];
    rpcError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves role, status, and role groups through the transactional database function", async () => {
    const result = await saveUserSettings({
      userId: "user-1",
      system_role: "learner",
      status: "active",
      role_group_ids: ["old-group", "new-group"],
    });

    expect(result).toEqual({ ok: true, newProgramTitles: ["Program One"] });
    expect(rpcCalls).toEqual([
      {
        name: "fn_save_user_settings",
        params: {
          p_user_id: "user-1",
          p_system_role: "learner",
          p_status: "active",
          p_role_group_ids: ["old-group", "new-group"],
        },
      },
    ]);
  });

  it("surfaces transactional save errors before enrollment email work", async () => {
    rpcError = { message: "role group insert failed" };

    const result = await saveUserSettings({
      userId: "user-1",
      system_role: "learner",
      status: "active",
      role_group_ids: ["missing-group"],
    });

    expect(result).toEqual({
      ok: false,
      error: "role group insert failed",
    });
  });

  it("explains release-control access failures without exposing database jargon", async () => {
    rpcError = {
      message:
        "Unreleased imported catalog access requires the evidence-bound release operation.",
    };

    const result = await saveUserSettings({
      userId: "user-1",
      system_role: "learner",
      status: "active",
      role_group_ids: ["employee-group"],
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Imported course content can only be published or granted to employees by the evidence-bound release operation.",
    });
  });
});
