// INTEG-02: module reorder must be delegated to the transactional database
// function rather than app-side multi-update sort_order rewrites.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
let rpcError: { message: string } | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    email: "admin@bmh.test",
    system_role: "owner",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return { data: null, error: rpcError };
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { moveModule } from "./actions";

describe("moveModule (INTEG-02)", () => {
  beforeEach(() => {
    rpcCalls = [];
    rpcError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("moves modules through the transactional database function", async () => {
    const result = await moveModule({
      moduleId: "module-1",
      courseId: "course-1",
      direction: "down",
    });

    expect(result).toEqual({ ok: true });
    expect(rpcCalls).toEqual([
      {
        name: "fn_move_module",
        params: {
          p_module_id: "module-1",
          p_course_id: "course-1",
          p_direction: "down",
        },
      },
    ]);
  });

  it("surfaces database reorder errors", async () => {
    rpcError = { message: "Module not found." };

    const result = await moveModule({
      moduleId: "missing-module",
      courseId: "course-1",
      direction: "up",
    });

    expect(result).toEqual({ ok: false, error: "Module not found." });
  });
});

