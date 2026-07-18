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
  it("captures provider-test output before emitting a redacted summary", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/test-course-import-provider.ts"),
      "utf8",
    );
    expect(source).not.toContain('stdio: "inherit"');
    expect(source).toContain('stdio: ["ignore", "pipe", "pipe"]');
    expect(source).not.toMatch(/console\.(?:log|error)\([^\n]*(?:stdout|stderr)/);
  });

  it("keeps direct psql acceptance credentials out of process arguments", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), ".github/workflows/db-migrate-test.yml"),
      "utf8",
    );
    expect(source).not.toMatch(/psql\s+["']?\$DB_URL/);
    expect(source).toContain('export PGPASSWORD="$TEST_SUPABASE_DB_PASSWORD"');
  });

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
