import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { importStoragePrefix } from "../../src/lib/artwork/paths";
import { findRemoteAssetProblems, findUnexpectedRemoteAssetPaths, type RemoteAssetListingBucket } from "../../src/lib/course-import/asset-transfer";
import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { assertExactReconciliationClean, reconcileImportPlanExact, type ExactCourseImportAdapter, type ManagedIdInventory } from "../../src/lib/course-import/exact-reconciliation";
import { validateCanaryScope, validateCourseManifest } from "../../src/lib/course-import/manifest";
import { buildImportPlan, type ImportTable } from "../../src/lib/course-import/operations";
import type { Database } from "../../src/lib/supabase/types";
import {
  assertBmhImportInvocationScope,
  assertBmhImportSemanticGate,
  BMH_CANARY_IMPORT_ID,
  BMH_FULL_IMPORT_ID,
  validateBmhImportSemanticGate,
} from "./import-semantic-gate.mjs";

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function assertCanonicalStorageObjectPath(storagePath: string, canonicalPrefix: string) {
  if (
    typeof storagePath !== "string" ||
    storagePath.length === 0 ||
    !/^[A-Za-z0-9._/-]+$/.test(storagePath) ||
    storagePath.includes("\\") ||
    path.posix.isAbsolute(storagePath) ||
    path.posix.normalize(storagePath) !== storagePath
  ) {
    throw new Error("Exact reconciliation evidence found a noncanonical storage path.");
  }
  const segments = storagePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Exact reconciliation evidence found a noncanonical storage path.");
  }
  if (!storagePath.startsWith(canonicalPrefix)) {
    throw new Error("Exact reconciliation evidence found an asset outside the canonical storage prefix.");
  }
}

export function buildReconciliationEvidence(options: {
  manifestBytes: Buffer;
  importId: string;
  scope: "canary" | "full";
  environment: "test" | "production";
  environmentUrl: string;
  database: Awaited<ReturnType<typeof reconcileImportPlanExact>>;
  assetProblems: Array<{ path: string; problem: string }>;
  unexpectedStorage: string[];
  expectedStoragePaths: string[];
  storagePrefix: string;
}) {
  assertExactReconciliationClean(options);
  if (options.importId === BMH_CANARY_IMPORT_ID && options.scope !== "canary") {
    throw new Error("Exact reconciliation evidence for the BMH Tech Stack canary requires canary scope.");
  }
  if (options.importId === BMH_FULL_IMPORT_ID && options.scope !== "full") {
    throw new Error("Exact reconciliation evidence for the full BMH import requires full scope.");
  }
  const actualEnvironment = assertCourseImportEnvironment(options.environmentUrl, true);
  const environmentUrl = new URL(options.environmentUrl).origin;
  if (actualEnvironment !== options.environment) {
    throw new Error("Exact reconciliation evidence environment URL does not match its environment.");
  }
  const canonicalPrefix = importStoragePrefix(options.importId);
  if (!canonicalPrefix || options.storagePrefix !== canonicalPrefix) {
    throw new Error("Exact reconciliation evidence requires the import's canonical storage prefix.");
  }
  const expectedStoragePaths = [...options.expectedStoragePaths].sort();
  for (const storagePath of expectedStoragePaths) {
    assertCanonicalStorageObjectPath(storagePath, canonicalPrefix);
  }
  if (new Set(expectedStoragePaths).size !== expectedStoragePaths.length) {
    throw new Error("Exact reconciliation evidence found duplicate expected storage paths.");
  }
  const payload = {
    schema_version: 1,
    status: "passed",
    exact: true,
    import_id: options.importId,
    scope: options.scope,
    environment: options.environment,
    environment_url: environmentUrl,
    manifest_sha256: sha256(options.manifestBytes),
    plan_checked_rows: options.database.checked,
    catalog_sha256: options.database.catalogSha256,
    managed_inventory_sha256: options.database.inventorySha256,
    storage_prefix: canonicalPrefix,
    expected_storage_paths_sha256: sha256(stableJson(expectedStoragePaths)),
    expected_storage_object_count: expectedStoragePaths.length,
  };
  return { ...payload, reconciliation_sha256: sha256(stableJson(payload)) };
}

function exactAdapter(supabase: SupabaseClient<Database>): ExactCourseImportAdapter {
  const rpc = supabase as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
  return {
    async applyAtomically() { throw new Error("Reconciliation adapter is read-only."); },
    async rollbackAtomically() { throw new Error("Reconciliation adapter is read-only."); },
    async readRows(table: ImportTable, ids: string[]) {
      const { data, error } = await supabase.from(table).select("*").in("id", ids);
      if (error) throw new Error(`${table} reconciliation failed: ${error.message}`);
      return new Map((data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]));
    },
    async readManagedIds(importId: string) {
      const { data, error } = await rpc.rpc("fn_course_import_managed_ids", { p_import_id: importId });
      if (error) throw new Error(`Managed inventory failed: ${error.message}`);
      return data as ManagedIdInventory;
    },
    async readCatalogSha256(importId: string) {
      const { data, error } = await rpc.rpc("fn_course_import_catalog_sha256", { p_import_id: importId });
      if (error) throw new Error(`Catalog checksum failed: ${error.message}`);
      return String(data);
    },
  };
}

async function writeEvidence(outputPath: string, evidence: unknown) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, outputPath);
}

function parseArgs(args: string[]) {
  const manifestPath = args[0];
  if (!manifestPath || !args.includes("--execute")) throw new Error("Usage: npm run course:reconcile -- <manifest.json> --execute [--canary] [--allow-production] [--output=<evidence.json>]");
  return {
    manifestPath: path.resolve(manifestPath),
    canary: args.includes("--canary"),
    allowProduction: args.includes("--allow-production"),
    outputPath: args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length),
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const manifestBytes = await readFile(flags.manifestPath);
  const validated = validateCourseManifest(JSON.parse(manifestBytes.toString("utf8")), { gate: "release" });
  if (!validated.ok) throw new Error(validated.errors.join("\n"));
  if (flags.canary) {
    const errors = validateCanaryScope(validated.value);
    if (errors.length) throw new Error(errors.join("\n"));
  }
  const semantic = await validateBmhImportSemanticGate({ manifest: validated.value });
  assertBmhImportInvocationScope(semantic, flags.canary);
  assertBmhImportSemanticGate(semantic, { enforcePublicationBlockers: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const environment = assertCourseImportEnvironment(url, flags.allowProduction);
  const supabase = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const plan = buildImportPlan(validated.value);
  const database = await reconcileImportPlanExact(plan, exactAdapter(supabase));
  const bucket = supabase.storage.from("content") as unknown as RemoteAssetListingBucket;
  const prefix = importStoragePrefix(plan.importId);
  if (!prefix) throw new Error("Import has no canonical storage prefix.");
  const [assetProblems, unexpectedStorage] = await Promise.all([
    findRemoteAssetProblems(bucket, plan.assets),
    findUnexpectedRemoteAssetPaths(bucket, plan.importId, prefix, plan.assets),
  ]);
  const evidence = buildReconciliationEvidence({
    manifestBytes,
    importId: plan.importId,
    scope: flags.canary ? "canary" : "full",
    environment,
    environmentUrl: url,
    database,
    assetProblems,
    unexpectedStorage,
    expectedStoragePaths: plan.assets.filter((asset) => asset.approval_status === "approved").map((asset) => asset.storage_path),
    storagePrefix: prefix,
  });
  if (flags.outputPath) await writeEvidence(path.resolve(flags.outputPath), evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1]?.endsWith("build-import-reconciliation-evidence.ts")) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
