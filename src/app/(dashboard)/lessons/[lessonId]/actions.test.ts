import { beforeEach, describe, expect, it, vi } from "vitest";

let resultUpsert: Record<string, unknown> | null = null;
let progressUpsert: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1" } },
      }),
    },
    from: (table: string) => {
      if (table === "role_play_results") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            resultUpsert = row;
            return { error: null };
          },
        };
      }
      if (table === "user_block_progress") {
        return {
          upsert: (row: Record<string, unknown>) => {
            progressUpsert = row;
            return {
              select: async () => ({
                data: [{ id: "progress-1" }],
                error: null,
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { completeRolePlayBlock } from "./actions";

describe("completeRolePlayBlock", () => {
  beforeEach(() => {
    resultUpsert = null;
    progressUpsert = null;
  });

  it("saves the role-play result before marking the content block complete", async () => {
    const result = await completeRolePlayBlock({
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: "attempt-1",
      score: 87,
      summaryUrl: "http://localhost:3200/recordings/attempt-1",
    });

    expect(result).toEqual({ ok: true, alreadyMarked: false });
    expect(resultUpsert).toEqual({
      user_id: "user-1",
      block_id: "block-1",
      scenario_id: "scenario-1",
      attempt_id: "attempt-1",
      score: 87,
      summary: { summary_url: "http://localhost:3200/recordings/attempt-1" },
    });
    expect(progressUpsert).toEqual({
      user_id: "user-1",
      block_id: "block-1",
    });
  });
});
