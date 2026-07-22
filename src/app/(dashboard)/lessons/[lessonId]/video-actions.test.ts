import { beforeEach, describe, expect, it, vi } from "vitest";

const emitSandraSpy = vi.fn(async (...args: unknown[]) => {
  void args;
  return { ok: true };
});
const rpcSpy = vi.fn();
const adminUpsertSpy = vi.fn();
const revalidatePathSpy = vi.fn();
let existingProgress: Record<string, unknown> | null = null;
let completionAssetVersion: string | null = null;

vi.mock("@/lib/integrations/sandra/course-completed", () => ({
  emitSandraCourseCompletedForBlock: (...args: unknown[]) => emitSandraSpy(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    rpc: (...args: unknown[]) => rpcSpy(...args),
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
                  content: {
                    duration_seconds: 100,
                    file_path: "courses/test/video-v2.mp4",
                  },
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
      if (table === "user_block_progress") {
        const query = {
          eq: () => query,
          maybeSingle: async () => ({
            data: completionAssetVersion
              ? { id: "completion-1", asset_version: completionAssetVersion }
              : null,
            error: null,
          }),
        };
        return { select: () => query };
      }
      throw new Error(`Unexpected learner table ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>) => {
        adminUpsertSpy(table, row);
        if (table === "user_block_progress") {
          completionAssetVersion = String(row.asset_version ?? "");
        }
        return { error: null };
      },
    }),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathSpy(...args),
}));

import { loadVideoProgress, recordVideoProgress, recordVideoSeek } from "./actions";

const TRUSTED_STATE = {
  lessonId: "lesson-1",
  positionSeconds: 10,
  watchedRanges: [[0, 10]],
  watchedPercent: 10,
  completed: false,
};

describe("atomic video progress actions", () => {
  beforeEach(() => {
    existingProgress = null;
    completionAssetVersion = null;
    rpcSpy.mockReset();
    rpcSpy.mockResolvedValue({ data: TRUSTED_STATE, error: null });
    adminUpsertSpy.mockClear();
    emitSandraSpy.mockClear();
    revalidatePathSpy.mockClear();
  });

  it("sends the complete observation to the transactional database function", async () => {
    await expect(recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 10.5,
      durationSeconds: 100,
      observedFrom: 5,
      observedTo: 10,
    })).resolves.toMatchObject({ ok: true, positionSeconds: 10 });

    expect(rpcSpy).toHaveBeenCalledWith("fn_record_video_playback", {
      p_user_id: "user-1",
      p_block_id: "video-1",
      p_operation: "observe",
      p_position_seconds: 10.5,
      p_duration_seconds: 100,
      p_observed_from: 5,
      p_observed_to: 10,
    });
    expect(adminUpsertSpy).not.toHaveBeenCalled();
  });

  it("does not revalidate routes for an incomplete playback observation", async () => {
    await expect(recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 2,
      durationSeconds: 100,
      observedFrom: 0,
      observedTo: 2,
    })).resolves.toMatchObject({ ok: true, completed: false });

    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  it("uses the same locked function for seek without adding a watched range", async () => {
    rpcSpy.mockResolvedValue({
      data: { ...TRUSTED_STATE, positionSeconds: 50 },
      error: null,
    });
    await expect(recordVideoSeek({
      blockId: "video-1",
      positionSeconds: 50,
      durationSeconds: 100,
    })).resolves.toEqual({ ok: true, positionSeconds: 50 });

    expect(rpcSpy).toHaveBeenCalledWith("fn_record_video_playback", expect.objectContaining({
      p_operation: "seek",
      p_observed_from: null,
      p_observed_to: null,
    }));
  });

  it("does not call the database for structurally invalid browser timing", async () => {
    await expect(recordVideoProgress({
      blockId: "video-1",
      positionSeconds: Number.NaN,
      durationSeconds: 100,
      observedFrom: 0,
      observedTo: 2,
    })).resolves.toEqual({
      ok: false,
      error: "Video progress contains invalid timing data.",
    });
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("returns database validation failures without attempting a fallback write", async () => {
    rpcSpy.mockResolvedValue({
      data: null,
      error: { message: "Video playback observation could not be verified." },
    });
    await expect(recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 52,
      durationSeconds: 100,
      observedFrom: 50,
      observedTo: 52,
    })).resolves.toEqual({
      ok: false,
      error: "Video playback observation could not be verified.",
    });
    expect(adminUpsertSpy).not.toHaveBeenCalled();
  });

  it("emits course completion only from the trusted completed state", async () => {
    rpcSpy.mockResolvedValue({
      data: { ...TRUSTED_STATE, watchedPercent: 90, completed: true },
      error: null,
    });
    await recordVideoProgress({
      blockId: "video-1",
      positionSeconds: 90,
      durationSeconds: 100,
      observedFrom: 89,
      observedTo: 90,
    });
    expect(emitSandraSpy).toHaveBeenCalledTimes(1);
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  it("does not grant completion from a read-only legacy progress load", async () => {
    existingProgress = {
      position_seconds: 90,
      duration_seconds: 100,
      watched_ranges: [[0, 90]],
      asset_version: "courses/test/video-v2.mp4#duration=100",
    };
    const result = await loadVideoProgress("video-1");
    expect(result).toMatchObject({
      ok: true,
      watchedPercent: 90,
      completed: false,
    });
    expect(adminUpsertSpy).not.toHaveBeenCalled();
  });

  it("discards watched ranges and resume position from a replaced video cut", async () => {
    existingProgress = {
      position_seconds: 90,
      duration_seconds: 100,
      watched_ranges: [[0, 90]],
      asset_version: "courses/test/video-v1.mp4#duration=100",
    };
    await expect(loadVideoProgress("video-1")).resolves.toMatchObject({
      ok: true,
      positionSeconds: 0,
      watchedRanges: [],
      watchedPercent: 0,
      completed: false,
    });
    expect(adminUpsertSpy).not.toHaveBeenCalled();
  });

  it("does not preserve completion credit from a replaced video cut", async () => {
    completionAssetVersion = "courses/test/video-v1.mp4#duration=100";
    existingProgress = {
      position_seconds: 90,
      duration_seconds: 100,
      watched_ranges: [[0, 90]],
      asset_version: "courses/test/video-v2.mp4#duration=100",
    };

    await expect(loadVideoProgress("video-1")).resolves.toMatchObject({
      ok: true,
      watchedPercent: 90,
      completed: false,
    });
  });

  it("reports completion only when progress and credit match the current cut", async () => {
    completionAssetVersion = "courses/test/video-v2.mp4#duration=100";
    existingProgress = {
      position_seconds: 90,
      duration_seconds: 100,
      watched_ranges: [[0, 90]],
      asset_version: "courses/test/video-v2.mp4#duration=100",
    };

    await expect(loadVideoProgress("video-1")).resolves.toMatchObject({
      ok: true,
      watchedPercent: 90,
      completed: true,
    });
  });
});
