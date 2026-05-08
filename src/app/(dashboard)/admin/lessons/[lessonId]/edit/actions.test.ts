import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let blockTypeRow: { block_type: string } | null = { block_type: "role_play" };
let updatePatch: Record<string, unknown> | null = null;

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => ({
    id: "admin-1",
    email: "admin@bmh.invalid",
    system_role: "owner",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "content_blocks") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: blockTypeRow,
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePatch = patch;
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updateBlock } from "./actions";

describe("updateBlock role_play branch", () => {
  beforeEach(() => {
    blockTypeRow = { block_type: "role_play" };
    updatePatch = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("trims the configured scenario id before saving", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: {
        scenario_id: "  scenario-1  ",
        title: " Handle the price objection ",
        height_px: 900,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(updatePatch).toEqual({
      content: {
        scenario_id: "scenario-1",
        title: "Handle the price objection",
        height_px: 900,
      },
    });
  });

  it("rejects an empty scenario id without updating", async () => {
    const result = await updateBlock({
      blockId: "block-1",
      lessonId: "lesson-1",
      content: { scenario_id: "   ", title: "Role play", height_px: 720 },
    });

    expect(result).toEqual({
      ok: false,
      error: "Scenario ID is required.",
    });
    expect(updatePatch).toBeNull();
  });
});
