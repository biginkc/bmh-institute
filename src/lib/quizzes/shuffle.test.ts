import { describe, expect, it } from "vitest";

import { deterministicShuffle } from "./shuffle";

describe("deterministicShuffle", () => {
  it("returns an array of the same items", () => {
    const out = deterministicShuffle(["a", "b", "c", "d"], "seed-1");
    expect(out.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the same order for the same seed", () => {
    const seed = "stable-seed";
    const a = deterministicShuffle(["a", "b", "c", "d", "e"], seed);
    const b = deterministicShuffle(["a", "b", "c", "d", "e"], seed);
    expect(a).toEqual(b);
  });

  it("returns a different order for different seeds (almost always)", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const a = deterministicShuffle(items, "seed-A");
    const b = deterministicShuffle(items, "seed-B");
    expect(a).not.toEqual(b);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    deterministicShuffle(input, "x");
    expect(input).toEqual(["a", "b", "c"]);
  });

  it("handles empty and single-item arrays", () => {
    expect(deterministicShuffle([], "x")).toEqual([]);
    expect(deterministicShuffle(["only"], "x")).toEqual(["only"]);
  });
});
