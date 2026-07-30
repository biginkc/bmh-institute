import { describe, expect, it } from "vitest";

import { parseVideoCheckpoint } from "./checkpoint";

describe("video checkpoint payload", () => {
  it("accepts finite bounded same-video resume data", () => {
    expect(parseVideoCheckpoint({
      blockId: "06306306-3063-4063-8063-463063063063",
      positionSeconds: 42,
      durationSeconds: 100,
      checkpointSequence: 17,
    })).toEqual({
      blockId: "06306306-3063-4063-8063-463063063063",
      positionSeconds: 42,
      durationSeconds: 100,
      checkpointSequence: 17,
    });
  });

  it("accepts newer UUID versions by shape", () => {
    expect(parseVideoCheckpoint({
      blockId: "018f4c2a-7b6d-7abc-8def-0123456789ab",
      positionSeconds: 1,
      durationSeconds: 10,
      checkpointSequence: 0,
    })).not.toBeNull();
  });

  it("rejects ownership-shaped and out-of-bounds payloads", () => {
    expect(parseVideoCheckpoint({ userId: "victim", blockId: "06306306-3063-4063-8063-463063063063", positionSeconds: 42, durationSeconds: 100, checkpointSequence: 1 })).toBeNull();
    expect(parseVideoCheckpoint({ blockId: "06306306-3063-4063-8063-463063063063", positionSeconds: 101, durationSeconds: 100, checkpointSequence: 1 })).toBeNull();
    expect(parseVideoCheckpoint({ blockId: "06306306-3063-4063-8063-463063063063", positionSeconds: 42, durationSeconds: 100, checkpointSequence: -1 })).toBeNull();
    expect(parseVideoCheckpoint({ blockId: "06306306-3063-4063-8063-463063063063", positionSeconds: 42, durationSeconds: 100, clientUpdatedAt: 1_700_000_000_000 })).toBeNull();
    expect(parseVideoCheckpoint({ blockId: "video-1", positionSeconds: 42, durationSeconds: 100, checkpointSequence: 1 })).toBeNull();
  });
});
