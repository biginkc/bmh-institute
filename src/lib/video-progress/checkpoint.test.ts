import { describe, expect, it } from "vitest";

import { parseVideoCheckpoint } from "./checkpoint";

describe("video checkpoint payload", () => {
  it("accepts finite bounded same-video resume data", () => {
    expect(parseVideoCheckpoint({
      blockId: "video-1",
      positionSeconds: 42,
      durationSeconds: 100,
      checkpointSequence: 17,
    })).toEqual({
      blockId: "video-1",
      positionSeconds: 42,
      durationSeconds: 100,
      checkpointSequence: 17,
    });
  });

  it("rejects ownership-shaped and out-of-bounds payloads", () => {
    expect(parseVideoCheckpoint({ userId: "victim", blockId: "video-1", positionSeconds: 42, durationSeconds: 100, checkpointSequence: 1 })).toBeNull();
    expect(parseVideoCheckpoint({ blockId: "video-1", positionSeconds: 101, durationSeconds: 100, checkpointSequence: 1 })).toBeNull();
    expect(parseVideoCheckpoint({ blockId: "video-1", positionSeconds: 42, durationSeconds: 100, checkpointSequence: -1 })).toBeNull();
    expect(parseVideoCheckpoint({ blockId: "video-1", positionSeconds: 42, durationSeconds: 100, clientUpdatedAt: 1_700_000_000_000 })).toBeNull();
  });
});
