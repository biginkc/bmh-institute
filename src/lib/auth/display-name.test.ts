import { describe, expect, it } from "vitest";

import { formatDisplayName } from "./display-name";

describe("formatDisplayName", () => {
  it("capitalizes each lowercase name part", () => {
    expect(formatDisplayName("mel smith")).toBe("Mel Smith");
  });

  it("capitalizes a single fallback name", () => {
    expect(formatDisplayName("mel")).toBe("Mel");
  });

  it("preserves existing capitalization after the first character", () => {
    expect(formatDisplayName("McDonald O'Neil")).toBe("McDonald O'Neil");
  });
});
