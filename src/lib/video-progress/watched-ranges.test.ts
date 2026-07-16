import { describe, expect, it } from "vitest";

import {
  applyPlaybackObservation,
  watchedCoverageRatio,
  type WatchedRange,
} from "./watched-ranges";

describe("watched video ranges", () => {
  it("merges overlapping playback observations", () => {
    const first = applyPlaybackObservation({
      existingRanges: [],
      observedFrom: 0,
      observedTo: 6,
      duration: 100,
      previousObservedAt: null,
      observedAt: new Date("2026-01-01T00:00:06Z"),
    });
    const second = applyPlaybackObservation({
      existingRanges: first.ranges,
      observedFrom: 5,
      observedTo: 12,
      duration: 100,
      previousObservedAt: new Date("2026-01-01T00:00:06Z"),
      observedAt: new Date("2026-01-01T00:00:12Z"),
    });

    expect(second).toEqual({ ok: true, ranges: [[0, 12]] });
  });

  it("does not credit a seek jump as watched time", () => {
    const result = applyPlaybackObservation({
      existingRanges: [[0, 5]],
      observedFrom: 5,
      observedTo: 90,
      duration: 100,
      previousObservedAt: new Date("2026-01-01T00:00:05Z"),
      observedAt: new Date("2026-01-01T00:00:06Z"),
    });

    expect(result).toEqual({ ok: false, ranges: [[0, 5]] });
  });

  it("rejects synthetic contiguous chunks sent faster than playback time", () => {
    const first = applyPlaybackObservation({
      existingRanges: [],
      observedFrom: 0,
      observedTo: 5,
      duration: 100,
      previousObservedAt: null,
      observedAt: new Date("2026-01-01T00:00:05Z"),
    });
    const immediateSecond = applyPlaybackObservation({
      existingRanges: first.ranges,
      observedFrom: 5,
      observedTo: 15,
      duration: 100,
      previousObservedAt: new Date("2026-01-01T00:00:05Z"),
      observedAt: new Date("2026-01-01T00:00:05.100Z"),
    });

    expect(first.ok).toBe(true);
    expect(immediateSecond).toEqual({ ok: false, ranges: [[0, 5]] });
  });

  it("completes only after actual merged coverage reaches 90 percent", () => {
    const ranges: WatchedRange[] = [
      [0, 40],
      [45, 95],
    ];

    expect(watchedCoverageRatio(ranges, 100)).toBe(0.9);
  });
});
