import { beforeEach, describe, expect, it, vi } from "vitest";

let resultUpsert: Record<string, unknown> | null = null;
let progressUpsert: Record<string, unknown> | null = null;
let adminClientCalls = 0;
let mockUser: { id: string } | null = { id: "user-1" };
let mockUnlocked = true;
let mockBlock = {
  id: "block-1",
  lesson_id: "lesson-1",
  block_type: "role_play",
  content: { scenario_id: "scenario-1" },
};
let mockVerification: { ok: true; score: number; summaryUrl: string; goalsMet: Record<string, boolean> } | { ok: false; error: string } = {
  ok: true,
  score: 87,
  summaryUrl: "http://localhost:3200/recordings/attempt-1",
  goalsMet: { discovery: true, close: false },
};

vi.mock("@/lib/role-plays/completion-token", () => ({
  verifyRolePlayCompletionToken: vi.fn(() => mockVerification),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
    rpc: async () => ({ data: mockUnlocked, error: null }),
    from: (table: string) => {
      if (table === "content_blocks") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: mockBlock,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected learner table ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    adminClientCalls += 1;
    return {
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
      throw new Error(`Unexpected admin table ${table}`);
    },
  };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { completeRolePlayBlock } from "./actions";

describe("completeRolePlayBlock", () => {
  beforeEach(() => {
    resultUpsert = null;
    progressUpsert = null;
    adminClientCalls = 0;
    mockUser = { id: "user-1" };
    mockUnlocked = true;
    mockBlock = {
      id: "block-1",
      lesson_id: "lesson-1",
      block_type: "role_play",
      content: { scenario_id: "scenario-1" },
    };
    mockVerification = {
      ok: true,
      score: 87,
      summaryUrl: "http://localhost:3200/recordings/attempt-1",
      goalsMet: { discovery: true, close: false },
    };
  });

  it("uses the server-verified result before marking the block complete", async () => {
    const result = await completeRolePlayBlock({
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: "attempt-1",
      completionToken: "signed-result",
    });

    expect(result).toEqual({ ok: true, alreadyMarked: false });
    expect(resultUpsert).toEqual({
      user_id: "user-1",
      block_id: "block-1",
      scenario_id: "scenario-1",
      attempt_id: "attempt-1",
      score: 87,
      goals_met: { discovery: true, close: false },
      summary: { summary_url: "http://localhost:3200/recordings/attempt-1" },
    });
    expect(progressUpsert).toEqual({
      user_id: "user-1",
      block_id: "block-1",
    });
  });

  it("rejects an unauthenticated forged completion without privileged writes", async () => {
    mockUser = null;

    await expect(completeRolePlayBlock({
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: "attempt-1",
      completionToken: "forged-result",
    })).resolves.toEqual({ ok: false, error: "You must be signed in." });
    expect(adminClientCalls).toBe(0);
  });

  it("rejects a scenario that is not bound to the requested role-play block", async () => {
    mockBlock = { ...mockBlock, content: { scenario_id: "another-scenario" } };

    const result = await completeRolePlayBlock({
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: "attempt-1",
      completionToken: "forged-result",
    });

    expect(result.ok).toBe(false);
    expect(adminClientCalls).toBe(0);
  });

  it("rejects completion while the lesson is locked without privileged writes", async () => {
    mockUnlocked = false;

    const result = await completeRolePlayBlock({
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: "attempt-1",
      completionToken: "forged-result",
    });

    expect(result.ok).toBe(false);
    expect(adminClientCalls).toBe(0);
  });

  it("rejects a forged completion proof without privileged writes", async () => {
    mockVerification = { ok: false, error: "Role play completion proof is invalid." };

    const result = await completeRolePlayBlock({
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: "attempt-1",
      completionToken: "forged-result",
    });

    expect(result.ok).toBe(false);
    expect(adminClientCalls).toBe(0);
    expect(resultUpsert).toBeNull();
    expect(progressUpsert).toBeNull();
  });
});
