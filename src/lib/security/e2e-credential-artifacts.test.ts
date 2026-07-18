import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seed = readFileSync(resolve("scripts/seed-e2e-test-content.ts"), "utf8");
const config = readFileSync(resolve("playwright.config.ts"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
const packageJson = JSON.parse(
  readFileSync(resolve("package.json"), "utf8"),
) as {
  scripts: Record<string, string>;
};

describe("seeded E2E credential containment", () => {
  it("has no durable fallback and supports an account/content cleanup-only run", () => {
    expect(seed).toContain("requireE2eSeedPassword()");
    expect(seed).not.toMatch(/E2E_SEED_PASSWORD[^\n]*\|\|/);
    expect(seed).toContain("--cleanup-only");
    expect(seed).toContain('"claude@test.com"');
    expect(packageJson.scripts["cleanup:e2e"]).toMatch(/--cleanup-only/);
  });

  it("never creates a Playwright trace containing a filled credential", () => {
    expect(config).toMatch(/trace:\s*"off"/);
    expect(config).not.toMatch(/trace:\s*"retain-on-failure"/);
  });

  it("serializes the shared test project and invalidates the one-run secret before artifact upload", () => {
    expect(workflow).toContain(
      "group: bmh-institute-seeded-e2e-shared-test-project",
    );
    expect(workflow).toMatch(
      /Create one-run E2E credential[\s\S]*::add-mask::\$\{E2E_PASSWORD\}/,
    );
    expect(workflow).not.toMatch(/E2E_SEED_PASSWORD:\s*\$\{\{\s*secrets\./);
    const cleanup = workflow.indexOf(
      "- name: Remove seeded E2E accounts and content",
    );
    const upload = workflow.indexOf("- name: Upload Playwright report");
    expect(cleanup).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(cleanup);
    expect(workflow.slice(cleanup, upload)).toContain("if: always()");
  });

  it("checks the checksum-bound Tech Stack canary for remote drift before seeding", () => {
    const driftCheck = workflow.indexOf(
      "- name: Verify Tech Stack canary has no remote drift",
    );
    const seedContent = workflow.indexOf("- name: Seed E2E content");
    expect(driftCheck).toBeGreaterThan(0);
    expect(seedContent).toBeGreaterThan(driftCheck);
    expect(workflow.slice(driftCheck, seedContent)).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}",
    );
    expect(workflow.slice(driftCheck, seedContent)).toContain(
      "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}",
    );
    expect(workflow.slice(driftCheck, seedContent)).toMatch(
      /course:import -- verify[\s\S]*bmh-employee-training-canary\.v1\.json[\s\S]*--canary --execute/,
    );
  });
});
