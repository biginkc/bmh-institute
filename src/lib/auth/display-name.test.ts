import { describe, expect, it } from "vitest";

import {
  formatDisplayName,
  resolveDashboardDisplayName,
} from "./display-name";

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

  it("does not expand one initial letter into multiple characters", () => {
    expect(formatDisplayName("ßara smith")).toBe("ßara Smith");
  });

  it("capitalizes a Unicode initial when it has a single-character mapping", () => {
    expect(formatDisplayName("ǳuro smith")).toBe("Ǳuro Smith");
  });

  it("does not alter an email fallback", () => {
    expect(resolveDashboardDisplayName(null, "mel@example.com")).toBe(
      "mel@example.com",
    );
  });

  it("uses the generic fallback when no identity text is available", () => {
    expect(resolveDashboardDisplayName(null, null)).toBe("BMH Institute user");
  });
});
