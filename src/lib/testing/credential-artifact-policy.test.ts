import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CREDENTIAL_SAFE_PLAYWRIGHT_USE } from "./credential-artifact-policy";

const PRODUCTION_CONFIGS = [
  "playwright.prod.config.ts",
  "playwright.prod-readiness.config.ts",
  "playwright.prod-dryrun.config.ts",
] as const;

function executableYaml(source: string) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

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
    const testYaml = executableYaml(testSource);
    const productionYaml = executableYaml(productionSource);
    expect(testYaml).toContain("permissions:\n  contents: read");
    expect(productionYaml).toContain("permissions:\n  contents: read");
    const triggerBlock = testYaml.match(/^on:\n([\s\S]*?)\nenv:/m)?.[1] ?? "";
    expect(triggerBlock).toContain("workflow_dispatch");
    expect(triggerBlock).toContain("workflow_dispatch: {}");
    expect(triggerBlock).not.toContain("expected_sha:");
    expect(triggerBlock).toContain("pull_request");
    const productionTriggerBlock =
      productionYaml.match(/^on:\n([\s\S]*?)\nenv:/m)?.[1] ?? "";
    expect(productionTriggerBlock).toContain("workflow_run:");
    expect(productionTriggerBlock).toContain(
      'workflows: ["Apply Supabase migrations to test"]',
    );
    expect(productionTriggerBlock).toContain("types: [completed]");
    expect(productionTriggerBlock).not.toContain("workflow_dispatch:");
    expect(productionTriggerBlock).not.toContain("push:");
    const productionJob = productionYaml.slice(
      productionYaml.indexOf("  migrate-prod:"),
    );
    const productionAdmission =
      productionJob.match(/^    if: (.+)$/m)?.[1] ?? "";
    expect(productionAdmission).toBe(
      "github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.run_attempt == '1' && github.run_attempt == '1'",
    );
    expect(productionJob).toMatch(/^    environment: Production$/m);
    expect(productionJob).not.toMatch(/^    permissions:/m);
    expect(productionJob).toContain(
      "ref: ${{ github.event.workflow_run.head_sha }}",
    );
    const productionCheckout = productionJob.match(
      /- uses: actions\/checkout@[a-f0-9]{40}[^\n]*[\s\S]*?(?=\n\s{6}- uses:|\n\s{6}- name:|$)/,
    )?.[0] ?? "";
    expect(productionCheckout).toContain(
      "ref: ${{ github.event.workflow_run.head_sha }}",
    );
    expect(productionCheckout).toContain("fetch-depth: 0");
    expect(productionCheckout).toContain("persist-credentials: false");
    const productionPush = productionJob.match(
      /- name: Apply pending migrations \(safety gate chained to the push\)[\s\S]*$/,
    )?.[0] ?? "";
    expect(productionPush).toContain(
      "PROD_SUPABASE_DB_PASSWORD: ${{ secrets.PROD_SUPABASE_DB_PASSWORD }}",
    );
    expect(productionPush).toContain(
      'echo "::add-mask::$PROD_SUPABASE_DB_PASSWORD"',
    );
    expect(productionPush).toContain(
      'export PGPASSWORD="$PROD_SUPABASE_DB_PASSWORD"',
    );
    expect(productionPush).toContain(
      "guarded-db-push.sh --target=institute-production",
    );
    expect(productionPush.indexOf("::add-mask::")).toBeLessThan(
      productionPush.indexOf("guarded-db-push.sh --target=institute-production"),
    );
    const prJob = testYaml.slice(
      testYaml.indexOf("  validate-pr-migrations:"),
      testYaml.indexOf("  migrate-test:"),
    );
    expect(prJob).not.toContain("secrets.");
    expect(prJob).toContain("run-controller-gate-pr-harness.mjs");
    const remoteJob = testYaml.slice(testYaml.indexOf("  migrate-test:"));
    expect(remoteJob).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(remoteJob).toContain("TEST_PROJECT_REF: jvaabkchkihkjllehmft");
    expect(remoteJob).toContain("guarded-db-push.sh --target=institute-test");
    expect(remoteJob).not.toMatch(/^    permissions:/m);
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
