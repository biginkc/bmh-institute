import { describe, expect, it } from "vitest";

import { isDesignSystemPath, isPublicPath } from "./middleware";

describe("isPublicPath", () => {
  it("lets the design-system page own its environment gate", () => {
    expect(isDesignSystemPath("/design-system")).toBe(true);
    expect(isDesignSystemPath("/design-system/example")).toBe(true);
    expect(isDesignSystemPath("/design-system-preview")).toBe(false);
  });

  it("preserves existing public routes in production", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/webhooks/course")).toBe(true);
  });
});
