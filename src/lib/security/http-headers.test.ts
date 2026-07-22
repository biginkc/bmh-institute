import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("production HTTP security headers", () => {
  it("protects every route from framing, MIME sniffing, and unsafe referrers", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.experimental?.serverActions?.allowedOrigins).toEqual([
      "institute.bmhgroupkc.com",
    ]);
    const rules = await nextConfig.headers?.();
    const allRoutes = rules?.find((rule) => rule.source === "/:path*");
    const headers = new Map(
      allRoutes?.headers.map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(headers.get("permissions-policy")).toBe(
      "camera=(), geolocation=(), payment=(), usb=()",
    );
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("x-permitted-cross-domain-policies")).toBe("none");
  });
});
