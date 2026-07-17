import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CREDENTIAL_SAFE_PLAYWRIGHT_USE } from "./credential-artifact-policy";

const PRODUCTION_CONFIGS = [
  "playwright.prod.config.ts",
  "playwright.prod-readiness.config.ts",
  "playwright.prod-dryrun.config.ts",
] as const;

describe("credential-bearing Playwright artifact policy", () => {
  it("disables every browser recording surface", () => {
    expect(CREDENTIAL_SAFE_PLAYWRIGHT_USE).toEqual({
      trace: "off",
      screenshot: "off",
      video: "off",
    });
  });

  it("is applied by every production Playwright config", () => {
    for (const filename of PRODUCTION_CONFIGS) {
      const source = fs.readFileSync(path.resolve(process.cwd(), filename), "utf8");
      expect(source, filename).toContain("CREDENTIAL_SAFE_PLAYWRIGHT_USE");
      expect(source, filename).not.toMatch(/trace:\s*["'](?:on|retain-on-failure|on-first-retry)["']/);
      expect(source, filename).not.toMatch(/screenshot:\s*["'](?:on|only-on-failure)["']/);
      expect(source, filename).not.toMatch(/video:\s*["'](?:on|retain-on-failure|on-first-retry)["']/);
    }
  });
});
