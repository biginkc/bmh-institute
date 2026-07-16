import { describe, expect, it } from "vitest";

import { isPublicPath } from "./middleware";

describe("isPublicPath", () => {
  it("exposes the design-system specimen only outside production", () => {
    expect(isPublicPath("/design-system", "development")).toBe(true);
    expect(isPublicPath("/design-system", "test")).toBe(true);
    expect(isPublicPath("/design-system", "production")).toBe(false);
  });

  it("preserves existing public routes in production", () => {
    expect(isPublicPath("/login", "production")).toBe(true);
    expect(isPublicPath("/api/webhooks/course", "production")).toBe(true);
  });
});
