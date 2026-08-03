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

  it("keeps dispatch writes test-only, production structurally non-dispatchable, and pins every action", () => {
    const testSource = fs.readFileSync(
      path.resolve(process.cwd(), ".github/workflows/db-migrate-test.yml"),
      "utf8",
    );
    const productionSource = fs.readFileSync(
      path.resolve(process.cwd(), ".github/workflows/db-migrate-prod.yml"),
      "utf8",
    );
    expect(testSource).toContain("permissions:\n  contents: read");
    expect(productionSource).toContain("permissions:\n  contents: read");
    const triggerBlock = testSource.match(/^on:\n([\s\S]*?)\nenv:/m)?.[1] ?? "";
    expect(triggerBlock).toContain("workflow_dispatch");
    expect(triggerBlock).toContain("workflow_dispatch: {}");
    expect(triggerBlock).not.toContain("expected_sha:");
    expect(triggerBlock).toContain("pull_request");
    const productionTriggerBlock =
      productionSource.match(/^on:\n([\s\S]*?)\nenv:/m)?.[1] ?? "";
    expect(productionTriggerBlock).toContain("workflow_run:");
    expect(productionTriggerBlock).not.toContain("workflow_dispatch:");
    expect(productionTriggerBlock).not.toContain("push:");
    const productionJob = productionSource.slice(
      productionSource.indexOf("  migrate-prod:"),
    );
    expect(productionJob).toContain(
      "github.event.workflow_run.head_branch == 'main'",
    );
    expect(productionJob).toContain(
      "github.event.workflow_run.run_attempt == '1'",
    );
    expect(productionJob).toContain("github.run_attempt == '1'");
    expect(productionJob).toContain(
      "ref: ${{ github.event.workflow_run.head_sha }}",
    );
    const prJob = testSource.slice(
      testSource.indexOf("  validate-pr-migrations:"),
      testSource.indexOf("  migrate-test:"),
    );
    expect(prJob).not.toContain("secrets.");
    expect(prJob).toContain("run-controller-gate-pr-harness.mjs");
    const remoteJob = testSource.slice(testSource.indexOf("  migrate-test:"));
    expect(remoteJob).toContain("if: github.event_name == 'workflow_dispatch'");
    for (const source of [testSource, productionSource]) {
      expect(source).not.toMatch(
        /uses:\s+[^\n]+@(?![a-f0-9]{40}(?:\s|#|$))[^\n]+/,
      );
    }
    const checkoutStep = remoteJob.match(
      /- uses: actions\/checkout@[a-f0-9]{40}[\s\S]*?(?=\n\s{6}- uses:|\n\s{6}- name:|$)/,
    )?.[0] ?? "";
    expect(checkoutStep).toContain("ref: ${{ github.sha }}");
    expect(checkoutStep).toContain("persist-credentials: false");
    expect(checkoutStep).not.toContain("github.ref");
    expect(checkoutStep).not.toContain("github.event.inputs");
    const jobEnv = remoteJob.match(/\n    env:\n([\s\S]*?)\n    steps:/)?.[1] ?? "";
    expect(jobEnv).not.toContain("TEST_SUPABASE_SERVICE_ROLE_KEY");
    const providerStep = remoteJob.match(
      /- name: Run fail-closed provider acceptance[\s\S]*?(?=\n\s{6}- name:|$)/,
    )?.[0] ?? "";
    expect(providerStep).toContain("TEST_SUPABASE_SERVICE_ROLE_KEY");
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

  it("keeps the default production browser suite read-only", () => {
    const productionConfig = fs.readFileSync(
      path.resolve(process.cwd(), "playwright.prod.config.ts"),
      "utf8",
    );
    expect(productionConfig).not.toContain("embed-sandbox");
    expect(productionConfig).not.toContain("TEST_SUPABASE_SERVICE_ROLE_KEY");

    const seededEmbedSpec = fs.readFileSync(
      path.resolve(process.cwd(), "e2e/embed-sandbox.spec.ts"),
      "utf8",
    );
    expect(seededEmbedSpec).toContain("writePathAdminClient");
    expect(seededEmbedSpec).toContain("bootstrapTestSession");
  });
});
