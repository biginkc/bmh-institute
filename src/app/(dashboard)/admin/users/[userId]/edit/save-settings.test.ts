// INTEG-01: saveUserSettings must explain release-control failures without
// exposing database policy language.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let actor = { id: "admin-1", email: "admin@bmh.test", system_role: "owner" };
let rpcError: { message: string } | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => actor),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: async () => ({ data: null, error: rpcError }),
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
          update: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: "user-1" },
                  error: null,
                }),
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
    rpcError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("explains release-control access failures without exposing database jargon", async () => {
    rpcError = {
      message:
        "Unreleased imported catalog access requires the evidence-bound release operation.",
    };

    const result = await saveUserSettings({
      userId: "user-1",
      system_role: "learner",
      role_group_ids: ["employee-group"],
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Imported course content can only be published or granted to employees by the evidence-bound release operation.",
    });
  });
});
