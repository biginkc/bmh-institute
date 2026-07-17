import { beforeEach, describe, expect, it, vi } from "vitest";

const emitSandraSpy = vi.fn(async (client: unknown, input: unknown) => {
  void client;
  void input;
});
let existingProgress: Record<string, unknown> | null = null;
let progressUpsert: Record<string, unknown> | null = null;
let completionUpsert: Record<string, unknown> | null = null;
let completionError: { message: string } | null = null;

vi.mock("@/lib/integrations/sandra/course-completed", () => ({
  emitSandraCourseCompletedForBlock: (client: unknown, input: unknown) =>
    emitSandraSpy(client, input),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      if (table === "content_blocks") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "video-1",
                  lesson_id: "lesson-1",
                  block_type: "video",
                  content: { duration_seconds: 100 },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user_video_progress") {
        const query = {
          eq: () => query,
          maybeSingle: async () => ({ data: existingProgress, error: null }),
        };
        return { select: () => query };
      }
      throw new Error(`Unexpected learner table ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "user_video_progress") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            progressUpsert = row;
            return { error: null };
          },
        };
      }
      if (table === "user_block_progress") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            completionUpsert = row;
            return { error: completionError };
          },
        };
      }
      throw new Error(`Unexpected admin table ${table}`);
    },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { recordVideoProgress } from "./actions";

describe("recordVideoProgress server validation", () => {
  beforeEach(() => {
    existingProgress = null;
    progressUpsert = null;
    completionUpsert = null;
    completionError = null;
    emitSandraSpy.mockClear();
  });

  it("rejects a client position that disagrees with the observed range", async () => {
    const result = await recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 40,
      durationSeconds: 100,
      observedFrom: 0,
      observedTo: 2,
    });

    expect(result).toEqual({
      ok: false,
      error: "Video position does not match the observed playback range.",
    });
    expect(progressUpsert).toBeNull();
  });

  it("rejects an invalid observation instead of advancing the trusted playhead", async () => {
    const result = await recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 51,
      durationSeconds: 100,
      observedFrom: 50,
      observedTo: 51,
    });

    expect(result).toEqual({
      ok: false,
      error: "Video playback observation could not be verified.",
    });
    expect(progressUpsert).toBeNull();
  });

  it("persists the validated observed endpoint rather than the client position", async () => {
    existingProgress = {
      position_seconds: 5,
      duration_seconds: 100,
      watched_ranges: [[0, 5]],
      last_observed_position_seconds: 5,
      last_observed_at: new Date(Date.now() - 5_000).toISOString(),
    };

    const result = await recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 10.5,
      durationSeconds: 100,
      observedFrom: 5,
      observedTo: 10,
    });

    expect(result).toMatchObject({ ok: true, positionSeconds: 10 });
    expect(progressUpsert).toMatchObject({
      position_seconds: 10,
      last_observed_position_seconds: 10,
    });
  });

  it("does not report completion or call Sandra when completion persistence fails", async () => {
    existingProgress = {
      position_seconds: 89,
      duration_seconds: 100,
      watched_ranges: [[0, 89]],
      last_observed_position_seconds: 89,
      last_observed_at: new Date(Date.now() - 5_000).toISOString(),
    };
    completionError = { message: "completion write failed" };

    const result = await recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 90,
      durationSeconds: 100,
      observedFrom: 89,
      observedTo: 90,
    });

    expect(result).toEqual({ ok: false, error: "completion write failed" });
    expect(completionUpsert).toEqual({
      user_id: "user-1",
      block_id: "video-1",
    });
    expect(emitSandraSpy).not.toHaveBeenCalled();
  });
});
