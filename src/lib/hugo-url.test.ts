import { afterEach, describe, expect, it, vi } from "vitest";

import { getHugoUrl } from "./hugo-url";

describe("getHugoUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the production Hugo URL by default", () => {
    vi.stubEnv("NEXT_PUBLIC_HUGO_URL", "");
    expect(getHugoUrl()).toBe("https://hugo.bmhgroupkc.com");
  });

  it("normalizes a configured Hugo URL", () => {
    vi.stubEnv("NEXT_PUBLIC_HUGO_URL", " https://hugo.example.test/ ");
    expect(getHugoUrl()).toBe("https://hugo.example.test");
  });
});
