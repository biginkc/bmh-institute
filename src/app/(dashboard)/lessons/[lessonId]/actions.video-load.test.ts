import { beforeEach, describe, expect, it, vi } from "vitest";

let progressError: { message: string } | null = null;
let completionError: { message: string } | null = null;
let blockError: { message: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    from: (table: string) => {
      const result =
        table === "content_blocks"
          ? {
              data: {
                id: "video-1",
                block_type: "video",
                content: {
                  duration_seconds: 100,
                  file_path: "courses/test/video.mp4",
                },
              },
              error: blockError,
            }
          : table === "user_video_progress"
            ? {
                data: {
                  position_seconds: 12,
                  duration_seconds: 100,
                  watched_ranges: [[0, 12]],
                  asset_version: "courses/test/video.mp4#duration=100",
                },
                error: progressError,
              }
            : table === "user_block_progress"
              ? { data: null, error: completionError }
              : null;
      if (!result) throw new Error(`Unexpected table ${table}`);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  })),
}));

import { loadVideoProgress } from "./actions";

describe("loadVideoProgress query failures", () => {
  beforeEach(() => {
    progressError = null;
    completionError = null;
    blockError = null;
  });

  it.each([
    ["content_blocks", "block unavailable"],
    ["user_video_progress", "progress unavailable"],
    ["user_block_progress", "completion unavailable"],
  ] as const)(
    "fails closed when %s cannot be read",
    async (table, expectedError) => {
      if (table === "content_blocks") {
        blockError = { message: "block unavailable" };
      } else if (table === "user_video_progress") {
        progressError = { message: "progress unavailable" };
      } else {
        completionError = { message: "completion unavailable" };
      }

      await expect(loadVideoProgress("video-1")).resolves.toEqual({
        ok: false,
        error: expectedError,
      });
    },
  );
});
