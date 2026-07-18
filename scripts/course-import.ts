import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  findRemoteAssetProblems,
  findUnexpectedRemoteAssetPaths,
  type RemoteAssetListingBucket,
} from "../src/lib/course-import/asset-transfer";
import {
  assertApprovedUploadIntegrity,
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "../src/lib/course-import/asset-upload";
import {
  applyImportPlanWithUploadReceipt,
} from "../src/lib/course-import/execute";
import {
  assertExactReconciliationClean,
  reconcileImportPlanExact,
  type ExactCourseImportAdapter,
  type ManagedIdInventory,
} from "../src/lib/course-import/exact-reconciliation";
import { importStoragePrefix } from "../src/lib/artwork/paths";
import { validateCanaryScope, validateCourseManifest } from "../src/lib/course-import/manifest";
import { buildImportPlan } from "../src/lib/course-import/operations";
import {
  assertStorageRollbackInspectionClean,
  inspectStorageRollbackAssets,
} from "../src/lib/course-import/storage-rollback";
import type { Database } from "../src/lib/supabase/types";
import { assertCourseImportEnvironment } from "../src/lib/course-import/environment";
import {
  manifestGateForCommand,
  type CourseImportCommand,
} from "../src/lib/course-import/command-policy";
import { runRestartableRollback } from "../src/lib/course-import/rollback-command";
import { databaseRollbackReceiptPath } from "../src/lib/course-import/rollback-settlement";
import {
  buildUploadReceiptExpectation,
  invalidateUploadReceipt,
  uploadReceiptPath,
  writeCompletedUploadReceipt,
} from "../src/lib/course-import/upload-receipt";
import {
  assertBmhImportInvocationScope,
  assertBmhImportSemanticGate,
  validateBmhImportSemanticGate,
} from "./course-content/import-semantic-gate.mjs";

async function main() {
  const { command, manifestPath, flags } = parseArgs(process.argv.slice(2));
  const absoluteManifestPath = resolve(manifestPath);
  const manifestBytes = await readFile(absoluteManifestPath);
  const raw = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  const result = validateCourseManifest(raw, {
    gate: manifestGateForCommand(command, flags.canary),
  });
  if (!result.ok) throw new Error(result.errors.map((error) => `- ${error}`).join("\n"));
  if (flags.canary) {
    const canaryErrors = validateCanaryScope(result.value);
    if (canaryErrors.length > 0) throw new Error(canaryErrors.map((error) => `- ${error}`).join("\n"));
  }
  const semanticReport = await validateBmhImportSemanticGate({
    manifest: result.value,
  });
  if (semanticReport) {
    console.log(JSON.stringify({ phase: "bmh_semantic_validation", report: semanticReport }, null, 2));
    assertBmhImportInvocationScope(semanticReport, flags.canary);
    if (command !== "rollback" && command !== "inspect-rollback-storage") {
      assertBmhImportSemanticGate(semanticReport, {
        enforcePublicationBlockers:
          manifestGateForCommand(command, flags.canary) === "release",
      });
    }
  }
  const plan = buildImportPlan(result.value);
  if (command === "upload") assertApprovedUploadIntegrity(plan.assets);

  console.log(JSON.stringify({ command, canary: flags.canary, dryRun: !flags.execute, summary: plan.summary }, null, 2));
  if (command === "validate") return;
  if (!flags.execute) {
    console.log("Dry run only. Add --execute after reviewing this plan.");
    return;
  }

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const environment = assertCourseImportEnvironment(url, flags.allowProduction);
  const stateRoot = resolve(flags.stateRoot ?? join(process.cwd(), ".course-import-state"));
  const uploadExpectation = buildUploadReceiptExpectation({
    manifestBytes,
    importId: plan.importId,
    scope: flags.canary ? "canary" : "full",
    environment,
    environmentUrl: url,
    assets: plan.assets,
  });
  const receiptPath = uploadReceiptPath(stateRoot, uploadExpectation);
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adapter = createSupabaseAdapter(supabase);

  if (command === "upload") {
    await invalidateUploadReceipt(receiptPath);
    await uploadApprovedAssets({
      endpoint: resumableEndpoint(url),
      serviceKey,
      importId: plan.importId,
      sourceRoot: flags.sourceRoot ? resolve(flags.sourceRoot) : process.cwd(),
      assets: plan.assets,
      bucket: supabase.storage.from("content") as unknown as CourseImportUploadBucket,
      stateRoot,
    });
    const receipt = await writeCompletedUploadReceipt(receiptPath, uploadExpectation);
    console.log(JSON.stringify({ phase: "upload_settled", receipt }, null, 2));
    return;
  }
  if (command === "apply") {
    await applyImportPlanWithUploadReceipt({
      plan,
      adapter,
      receiptPath,
      uploadExpectation,
      verifyRemoteAssets: () => findAssetProblems(supabase, plan.assets),
    });
    return;
  }
  if (command === "verify") {
    const reconciliation = await reconcileImportPlanExact(plan, adapter);
    const assetProblems = await findAssetProblems(supabase, plan.assets);
    const prefix = importStoragePrefix(plan.importId);
    if (!prefix) throw new Error("Import has no canonical storage prefix.");
    const unexpectedStorage = await findUnexpectedRemoteAssetPaths(
      supabase.storage.from("content") as unknown as RemoteAssetListingBucket,
      plan.importId,
      prefix,
      plan.assets,
    );
    console.log(JSON.stringify({ ...reconciliation, assetProblems, unexpectedStorage }, null, 2));
    assertExactReconciliationClean({ database: reconciliation, assetProblems, unexpectedStorage });
    return;
  }
  if (command === "inspect-rollback-storage" || command === "rollback") {
    if (flags.confirm !== plan.importId) {
      throw new Error(`${command} requires --confirm=${plan.importId}.`);
    }
    const inspectStorage = () => inspectStorageRollbackAssets({
      importId: plan.importId,
      assets: plan.assets,
      bucket: supabase.storage.from("content"),
    });
    if (command === "inspect-rollback-storage") {
      const storageRollback = await inspectStorage();
      console.log(JSON.stringify({ phase: "storage_inspection", storageRollback }, null, 2));
      assertStorageRollbackInspectionClean(storageRollback);
      return;
    }

    const { storageRollback } = await runRestartableRollback({
      plan,
      adapter,
      receiptPath: databaseRollbackReceiptPath(stateRoot, {
        importId: plan.importId,
        scope: flags.canary ? "canary" : "full",
        environment,
      }),
      context: {
        scope: flags.canary ? "canary" : "full",
        environment,
        environmentUrl: url,
      },
      inspectStorage,
      onDatabaseSettled(databaseRollback) {
        console.log(JSON.stringify({ phase: "rollback_settled", databaseRollback }, null, 2));
      },
    });
    console.log(JSON.stringify({ phase: "storage_inspection", storageRollback }, null, 2));
    assertStorageRollbackInspectionClean(storageRollback);
  }
}

async function findAssetProblems(
  supabase: SupabaseClient<Database>,
  assets: ReturnType<typeof buildImportPlan>["assets"],
) {
  return findRemoteAssetProblems(supabase.storage.from("content"), assets);
}

function createSupabaseAdapter(
  supabase: SupabaseClient<Database>,
): ExactCourseImportAdapter {
  return {
    async applyAtomically(importId, operations) {
      const client = supabase as unknown as {
        rpc(name: string, args: Record<string, unknown>): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
      const { data, error } = await client.rpc("fn_apply_course_import", {
        p_import_id: importId,
        p_operations: operations,
      });
      if (error) throw new Error(`Atomic course import apply failed: ${error.message}`);
      return data;
    },
    async readRows(table, ids) {
      const tableApi = supabase.from(table) as unknown as {
        select(columns: string): {
          in(column: string, values: string[]): PromiseLike<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
      const { data, error } = await tableApi.select("*").in("id", ids);
      if (error) throw new Error(`${table} verify failed: ${error.message}`);
      return new Map((data ?? []).map((row) => [String(row.id), row]));
    },
    async rollbackAtomically(importId, ownedIds) {
      const client = supabase as unknown as {
        rpc(name: string, args: Record<string, unknown>): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
      const { data, error } = await client.rpc("fn_rollback_course_import", {
        p_import_id: importId,
        p_owned: ownedIds,
      });
      if (error) throw new Error(`Atomic course import rollback failed: ${error.message}`);
      return data;
    },
    async readManagedIds(importId) {
      const client = supabase as unknown as {
        rpc(name: string, args: Record<string, unknown>): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
      const { data, error } = await client.rpc("fn_course_import_managed_ids", {
        p_import_id: importId,
      });
      if (error) throw new Error(`Managed inventory failed: ${error.message}`);
      return data as ManagedIdInventory;
    },
    async readCatalogSha256(importId) {
      const client = supabase as unknown as {
        rpc(name: string, args: Record<string, unknown>): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
      const { data, error } = await client.rpc("fn_course_import_catalog_sha256", {
        p_import_id: importId,
      });
      if (error) throw new Error(`Catalog checksum failed: ${error.message}`);
      return String(data);
    },
  };
}

function parseArgs(args: string[]) {
  const command = args[0];
  const manifestPath = args[1];
  if (!["validate", "upload", "apply", "verify", "rollback", "inspect-rollback-storage"].includes(command) || !manifestPath) {
    throw new Error("Usage: npm run course:import -- <validate|upload|apply|verify|rollback|inspect-rollback-storage> <manifest.json> [--execute] [--canary] [--source-root=<path>] [--state-root=<path>] [--allow-production] [--confirm=<import_id>]");
  }
  return {
    command: command as CourseImportCommand,
    manifestPath,
    flags: {
      execute: args.includes("--execute"),
      canary: args.includes("--canary"),
      allowProduction: args.includes("--allow-production"),
      confirm: args.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length),
      sourceRoot: args.find((arg) => arg.startsWith("--source-root="))?.slice("--source-root=".length),
      stateRoot: args.find((arg) => arg.startsWith("--state-root="))?.slice("--state-root=".length),
    },
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for --execute.`);
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
