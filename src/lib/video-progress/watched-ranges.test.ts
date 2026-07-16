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
      observedTo: 2,
      duration: 100,
      previousObservedPosition: null,
      previousObservedAt: null,
      observedAt: new Date("2026-01-01T00:00:06Z"),
    });
    const second = applyPlaybackObservation({
      existingRanges: first.ranges,
      observedFrom: 2,
      observedTo: 12,
      duration: 100,
      previousObservedPosition: 2,
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
      previousObservedPosition: 5,
      previousObservedAt: new Date("2026-01-01T00:00:05Z"),
      observedAt: new Date("2026-01-01T00:00:06Z"),
    });

    expect(result).toEqual({ ok: false, ranges: [[0, 5]] });
  });

  it("rejects synthetic contiguous chunks sent faster than playback time", () => {
    const first = applyPlaybackObservation({
      existingRanges: [],
      observedFrom: 0,
      observedTo: 2,
      duration: 100,
      previousObservedPosition: null,
      previousObservedAt: null,
      observedAt: new Date("2026-01-01T00:00:05Z"),
    });
    const immediateSecond = applyPlaybackObservation({
      existingRanges: first.ranges,
      observedFrom: 2,
      observedTo: 12,
      duration: 100,
      previousObservedPosition: 2,
      previousObservedAt: new Date("2026-01-01T00:00:05Z"),
      observedAt: new Date("2026-01-01T00:00:05.100Z"),
    });

    expect(first.ok).toBe(true);
    expect(immediateSecond).toEqual({ ok: false, ranges: [[0, 2]] });
  });

  it("does not grant a fixed amount of watch time to every rapid request", () => {
    const result = applyPlaybackObservation({
      existingRanges: [[0, 5]],
      observedFrom: 5,
      observedTo: 6.9,
      duration: 100,
      previousObservedPosition: 5,
      previousObservedAt: new Date("2026-01-01T00:00:05Z"),
      observedAt: new Date("2026-01-01T00:00:05Z"),
    });

    expect(result).toEqual({ ok: false, ranges: [[0, 5]] });
  });

  it("rejects a plausible-sized observation that starts away from the stored playhead", () => {
    const result = applyPlaybackObservation({
      existingRanges: [[0, 5]],
      observedFrom: 40,
      observedTo: 45,
      duration: 100,
      previousObservedPosition: 5,
      previousObservedAt: new Date("2026-01-01T00:00:05Z"),
      observedAt: new Date("2026-01-01T00:00:10Z"),
    });

    expect(result).toEqual({ ok: false, ranges: [[0, 5]] });
  });

  it("does not let the first observation claim an arbitrary range after a seek", () => {
    const result = applyPlaybackObservation({
      existingRanges: [],
      observedFrom: 50,
      observedTo: 65,
      duration: 100,
      previousObservedPosition: null,
      previousObservedAt: null,
      observedAt: new Date("2026-01-01T00:00:15Z"),
    });

    expect(result).toEqual({ ok: false, ranges: [] });
  });

  it("does not let the first observation claim fifteen seconds from the start", () => {
    const result = applyPlaybackObservation({
      existingRanges: [],
      observedFrom: 0,
      observedTo: 15,
      duration: 100,
      previousObservedPosition: null,
      previousObservedAt: null,
      observedAt: new Date("2026-01-01T00:00:15Z"),
    });

    expect(result).toEqual({ ok: false, ranges: [] });
  });

  it("cannot accumulate small free chunks through rapid sequential calls", () => {
    let ranges: WatchedRange[] = [[0, 5]];
    let playhead = 5;
    const observedAt = new Date("2026-01-01T00:00:05Z");

    for (let request = 0; request < 20; request += 1) {
      const result = applyPlaybackObservation({
        existingRanges: ranges,
        observedFrom: playhead,
        observedTo: playhead + 0.25,
        duration: 100,
        previousObservedPosition: playhead,
        previousObservedAt: observedAt,
        observedAt,
      });
      expect(result.ok).toBe(false);
      ranges = result.ranges;
      playhead += 0.25;
    }

    expect(ranges).toEqual([[0, 5]]);
  });

  it("completes only after actual merged coverage reaches 90 percent", () => {
    const ranges: WatchedRange[] = [
      [0, 40],
      [45, 95],
    ];

    expect(watchedCoverageRatio(ranges, 100)).toBe(0.9);
  });
});
