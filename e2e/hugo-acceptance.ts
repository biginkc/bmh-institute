import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import type { TestInfo } from "@playwright/test";

export { assertHugoBrowserTarget } from "../src/lib/testing/hugo-browser-target";

export const HUGO_ACCEPTANCE_SCHEMA = "hugo-acceptance.v1" as const;
export const HUGO_CLEANUP_MANIFEST_SCHEMA = "hugo-cleanup-manifest.v1" as const;
export const HUGO_EVIDENCE_SCHEMA = "hugo-browser-evidence.v1" as const;

export type HugoProject = "institute" | "closer" | "sandra" | "jitter";
export type HugoRole = "owner" | "admin" | "member" | "operator" | "learner";
export type HugoAcceptanceStatus = "PASS" | "PARTIAL" | "FAIL" | "BLOCKED";

/**
 * The approved acceptance surface is intentionally explicit. Empty or
 * placeholder rows are still useful because they prevent a missing app or
 * role from being mistaken for completed coverage.
 */
export const HUGO_PROJECT_ROLE_MATRIX = Object.freeze([
  Object.freeze({ project: "institute" as const, roles: Object.freeze(["owner", "admin", "learner"] as const), state: "seeded" as const }),
  Object.freeze({ project: "closer" as const, roles: Object.freeze(["admin", "member"] as const), state: "placeholder" as const }),
  Object.freeze({ project: "sandra" as const, roles: Object.freeze(["owner", "member"] as const), state: "placeholder" as const }),
  Object.freeze({ project: "jitter" as const, roles: Object.freeze(["admin", "operator"] as const), state: "placeholder" as const }),
] as const);

const MAX_RUN_ID_LENGTH = 64;

export type HugoAcceptanceRun = Readonly<{
  schema_version: typeof HUGO_ACCEPTANCE_SCHEMA;
  run_id: string;
  target: "test";
  fixture_prefix: string;
  project_role_matrix: typeof HUGO_PROJECT_ROLE_MATRIX;
}>;

export type HugoCleanupResource = Readonly<{
  project: HugoProject;
  kind: string;
  id: string;
}>;

export type HugoCleanupManifest = Readonly<{
  schema_version: typeof HUGO_CLEANUP_MANIFEST_SCHEMA;
  run_id: string;
  target: "test";
  immutable: true;
  created_at: string;
  resources: readonly HugoCleanupResource[];
}>;

export type HugoEvidenceArtifact = Readonly<{
  kind: "screenshot" | "trace" | "console" | "network" | "cleanup-manifest" | "other";
  path: string;
}>;

export type HugoEvidenceRecord = Readonly<{
  schema_version: typeof HUGO_EVIDENCE_SCHEMA;
  run_id: string;
  target: "test" | "production";
  project: HugoProject;
  roles: readonly HugoRole[];
  journey: string;
  status: HugoAcceptanceStatus;
  entry_point: string;
  actions: readonly string[];
  success_signals: readonly string[];
  failure_signals: readonly string[];
  artifacts: readonly HugoEvidenceArtifact[];
  cleanup_manifest_sha256: string;
  manual_chrome_proof_required: true;
  generated_at: string;
}>;

function normalizeRunId(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_RUN_ID_LENGTH);
  if (!normalized) throw new Error("Hugo E2E run id must contain an identifier.");
  return normalized;
}

function safeLabel(value: string): string {
  const label = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!label) throw new Error("Hugo synthetic fixture label cannot be empty.");
  return label;
}

export function createHugoAcceptanceRun(
  requestedRunId = process.env.HUGO_E2E_RUN_ID ?? `local-${randomUUID()}`,
): HugoAcceptanceRun {
  const runId = normalizeRunId(requestedRunId);
  return Object.freeze({
    schema_version: HUGO_ACCEPTANCE_SCHEMA,
    run_id: runId,
    target: "test",
    fixture_prefix: `HUGO-E2E-${runId}`,
    project_role_matrix: HUGO_PROJECT_ROLE_MATRIX,
  });
}

export const HUGO_ACCEPTANCE_RUN = createHugoAcceptanceRun();

export function syntheticFixtureLabel(
  run: HugoAcceptanceRun,
  purpose: string,
): string {
  return `${run.fixture_prefix}-${safeLabel(purpose)}`;
}

function buildCleanupManifest(
  runId: string,
  resources: readonly HugoCleanupResource[],
  createdAt: string,
): HugoCleanupManifest {
  const sorted = [...resources].sort((left, right) =>
    `${left.project}:${left.kind}:${left.id}`.localeCompare(
      `${right.project}:${right.kind}:${right.id}`,
    ),
  );
  return Object.freeze({
    schema_version: HUGO_CLEANUP_MANIFEST_SCHEMA,
    run_id: runId,
    target: "test",
    immutable: true,
    created_at: createdAt,
    resources: Object.freeze(sorted.map((resource) => Object.freeze({ ...resource }))),
  });
}

export function createHugoCleanupManifest(
  run: HugoAcceptanceRun,
  resources: readonly HugoCleanupResource[] = [],
): HugoCleanupManifest {
  return buildCleanupManifest(run.run_id, resources, new Date().toISOString());
}

/** Return a new frozen manifest instead of mutating the existing record. */
export function addHugoCleanupResource(
  manifest: HugoCleanupManifest,
  resource: HugoCleanupResource,
): HugoCleanupManifest {
  return buildCleanupManifest(
    manifest.run_id,
    [...manifest.resources, resource],
    manifest.created_at,
  );
}

export function hashHugoCleanupManifest(manifest: HugoCleanupManifest): string {
  return createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
}

function assertNoCredentialLikeValue(value: string, field: string): void {
  if (/password|secret|token|authorization|api[_-]?key|service[_-]?role/i.test(value)) {
    throw new Error(`Hugo evidence ${field} cannot contain credential-like text.`);
  }
}

export function createHugoEvidenceRecord(input: {
  run: HugoAcceptanceRun;
  project: HugoProject;
  roles: readonly HugoRole[];
  journey: string;
  status: HugoAcceptanceStatus;
  entryPoint: string;
  actions: readonly string[];
  successSignals: readonly string[];
  failureSignals?: readonly string[];
  artifacts?: readonly HugoEvidenceArtifact[];
  cleanupManifest: HugoCleanupManifest;
  target?: "test" | "production";
}): HugoEvidenceRecord {
  for (const value of [input.journey, input.entryPoint, ...input.actions, ...input.successSignals, ...(input.failureSignals ?? [])]) {
    assertNoCredentialLikeValue(value, "record");
  }
  const target = input.target ?? "test";
  if (target === "production") {
    throw new Error("Production Hugo evidence requires an explicitly approved read-only recorder.");
  }
  return Object.freeze({
    schema_version: HUGO_EVIDENCE_SCHEMA,
    run_id: input.run.run_id,
    target,
    project: input.project,
    roles: Object.freeze([...input.roles]),
    journey: input.journey,
    status: input.status,
    entry_point: input.entryPoint,
    actions: Object.freeze([...input.actions]),
    success_signals: Object.freeze([...input.successSignals]),
    failure_signals: Object.freeze([...(input.failureSignals ?? [])]),
    artifacts: Object.freeze([...(input.artifacts ?? [])].map((artifact) => Object.freeze({ ...artifact }))),
    cleanup_manifest_sha256: hashHugoCleanupManifest(input.cleanupManifest),
    manual_chrome_proof_required: true,
    generated_at: new Date().toISOString(),
  });
}

export async function writeHugoEvidence(
  testInfo: Pick<TestInfo, "outputPath" | "attach">,
  record: HugoEvidenceRecord,
): Promise<string> {
  const outputPath = testInfo.outputPath("hugo-evidence.json");
  await mkdir(outputPath.replace(/\/[^/]+$/, ""), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await testInfo.attach("hugo-evidence", {
    path: outputPath,
    contentType: "application/json",
  });
  return outputPath;
}

export async function writeHugoCleanupManifest(
  testInfo: Pick<TestInfo, "outputPath" | "attach">,
  manifest: HugoCleanupManifest,
): Promise<string> {
  const outputPath = testInfo.outputPath("hugo-cleanup-manifest.json");
  await mkdir(outputPath.replace(/\/[^/]+$/, ""), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await testInfo.attach("hugo-cleanup-manifest", {
    path: outputPath,
    contentType: "application/json",
  });
  return outputPath;
}
