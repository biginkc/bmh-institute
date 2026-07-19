export type WatchedRange = [number, number];

const MAX_OBSERVATION_SECONDS = 15;
const MAX_INITIAL_OBSERVATION_SECONDS = 2;
const INITIAL_OBSERVATION_TOLERANCE_SECONDS = 1;
const RANGE_EPSILON_SECONDS = 0.5;
const PLAYHEAD_EPSILON_SECONDS = 1;

export function applyPlaybackObservation(input: {
  existingRanges: WatchedRange[];
  observedFrom: number;
  observedTo: number;
  duration: number;
  previousObservedPosition: number | null;
  previousObservedAt: Date | null;
  observedAt: Date;
}): { ok: boolean; ranges: WatchedRange[] } {
  const existing = normalizeRanges(input.existingRanges, input.duration);
  const from = clamp(input.observedFrom, 0, input.duration);
  const to = clamp(input.observedTo, 0, input.duration);
  const span = to - from;
  const elapsedSeconds = input.previousObservedAt
    ? Math.max(
        0,
        (input.observedAt.getTime() - input.previousObservedAt.getTime()) / 1000,
      )
    : MAX_OBSERVATION_SECONDS;
  const credibleSpan = input.previousObservedAt
    ? Math.min(MAX_OBSERVATION_SECONDS, elapsedSeconds * 2.25)
    : MAX_INITIAL_OBSERVATION_SECONDS +
      INITIAL_OBSERVATION_TOLERANCE_SECONDS;
  const continuesStoredPlayhead =
    input.previousObservedPosition === null
      ? from <= PLAYHEAD_EPSILON_SECONDS
      : Number.isFinite(input.previousObservedPosition) &&
        Math.abs(from - input.previousObservedPosition) <=
          PLAYHEAD_EPSILON_SECONDS;
  if (
    !Number.isFinite(input.duration) ||
    input.duration <= 0 ||
    !Number.isFinite(span) ||
    span <= 0 ||
    span > credibleSpan ||
    !continuesStoredPlayhead
  ) {
    return { ok: false, ranges: existing };
  }

  return {
    ok: true,
    ranges: normalizeRanges([...existing, [from, to]], input.duration),
  };
}

export function watchedCoverageRatio(
  ranges: WatchedRange[],
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const watched = normalizeRanges(ranges, duration).reduce(
    (total, [from, to]) => total + (to - from),
    0,
  );
  return Math.min(1, watched / duration);
}

export function parseWatchedRanges(value: unknown): WatchedRange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "number" ||
      typeof entry[1] !== "number"
    ) {
      return [];
    }
    return [[entry[0], entry[1]] as WatchedRange];
  });
}

function normalizeRanges(
  ranges: WatchedRange[],
  duration: number,
): WatchedRange[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const sorted = ranges
    .map(([from, to]) => [
      clamp(from, 0, duration),
      clamp(to, 0, duration),
    ] as WatchedRange)
    .filter(([from, to]) => Number.isFinite(from) && to > from)
    .sort((a, b) => a[0] - b[0]);

  const merged: WatchedRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range[0] > previous[1] + RANGE_EPSILON_SECONDS) {
      merged.push([...range]);
      continue;
    }
    previous[1] = Math.max(previous[1], range[1]);
  }
  return merged;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
