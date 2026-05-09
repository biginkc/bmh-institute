import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppUrl } from "./app-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppUrl", () => {
  it("uses the configured app URL without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");

    expect(getAppUrl()).toBe("https://example.test");
  });

  it("falls back when the configured app URL is blank", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getAppUrl()).toBe("http://localhost:3100");
  });
});
