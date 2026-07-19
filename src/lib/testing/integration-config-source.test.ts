import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const config = readFileSync(
  resolve(process.cwd(), "vitest.integration.config.ts"),
  "utf8",
);
const releaseControl = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/security/import-release-control.integration.test.ts",
  ),
  "utf8",
);

describe("integration config targeting", () => {
  it("loads, validates, and forwards the canonical TEST database URL", () => {
    expect(config).toMatch(
      /process\.env\.TEST_SUPABASE_DB_URL \?\? env\.TEST_SUPABASE_DB_URL/,
    );
    expect(config).toMatch(
      /guardedIntegrationEnvironment = \{[\s\S]*TEST_SUPABASE_DB_URL: testSupabaseDatabaseUrl[\s\S]*assertIntegrationTestEnvironment\(guardedIntegrationEnvironment\)/,
    );
    expect(config).toMatch(
      /defineConfig\(async \(\) => \{[\s\S]*await verifyIntegrationTestKeys\(guardedIntegrationEnvironment\)/,
    );
    expect(config).toMatch(
      /test:[\s\S]*env: \{[\s\S]*TEST_SUPABASE_DB_URL: testSupabaseDatabaseUrl/,
    );
  });

  it("does not skip the required import release coverage when env is absent", () => {
    expect(releaseControl).not.toContain("describe.skipIf");
    expect(releaseControl).toContain(
      'describe("imported catalog release control on a test project"',
    );
  });
});
