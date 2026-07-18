import { describe, expect, it } from "vitest";

import { requireInstituteProductionBaseUrl } from "./production-base-url";

describe("requireInstituteProductionBaseUrl", () => {
  it("accepts only the canonical BMH Institute production origin", () => {
    expect(requireInstituteProductionBaseUrl("https://institute.bmhgroupkc.com"))
      .toBe("https://institute.bmhgroupkc.com");
    expect(requireInstituteProductionBaseUrl("https://institute.bmhgroupkc.com/"))
      .toBe("https://institute.bmhgroupkc.com");
  });

  it("fails closed when the target is unset or belongs to another deployment", () => {
    expect(() => requireInstituteProductionBaseUrl(undefined)).toThrow(/E2E_PROD_BASE_URL is required/);
    expect(() => requireInstituteProductionBaseUrl("https://sandra-university.vercel.app"))
      .toThrow(/must target https:\/\/institute\.bmhgroupkc\.com/);
    expect(() => requireInstituteProductionBaseUrl("https://example.com"))
      .toThrow(/must target https:\/\/institute\.bmhgroupkc\.com/);
  });

  it("rejects credentials, query strings, fragments, and non-root paths", () => {
    for (const candidate of [
      "https://user:pass@institute.bmhgroupkc.com",
      "https://institute.bmhgroupkc.com/admin",
      "https://institute.bmhgroupkc.com?preview=1",
      "https://institute.bmhgroupkc.com#fragment",
    ]) {
      expect(() => requireInstituteProductionBaseUrl(candidate)).toThrow(/bare canonical production origin/);
    }
  });
});
