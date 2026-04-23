/**
 * Deterministic Fisher–Yates shuffle driven by a string seed.
 * Same input + same seed always yields the same output, so a quiz that
 * randomises question order stays stable across refreshes during one
 * attempt (the seed is the attempt id or the user+quiz pair).
 */
export function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const out = items.slice();
  if (out.length < 2) return out;

  const rng = makeRng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** mulberry32 seeded PRNG keyed off a string hash of the input seed. */
function makeRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
