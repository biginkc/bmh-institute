import { describe, expect, it } from "vitest";

import { extractClientIp } from "./ip";

describe("extractClientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const headersList = new Headers({
      "x-forwarded-for": "203.0.113.1, 198.51.100.2",
    });

    expect(extractClientIp(headersList)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip", () => {
    const headersList = new Headers({ "x-real-ip": "198.51.100.3" });

    expect(extractClientIp(headersList)).toBe("198.51.100.3");
  });

  it("falls back to x-vercel-forwarded-for", () => {
    const headersList = new Headers({
      "x-vercel-forwarded-for": "198.51.100.4",
    });

    expect(extractClientIp(headersList)).toBe("198.51.100.4");
  });

  it("returns a stable local fallback when no IP headers are present", () => {
    expect(extractClientIp(new Headers())).toBe("127.0.0.1");
  });
});
