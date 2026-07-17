import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { findRemoteAssetProblems } from "../src/lib/course-import/asset-transfer";
import {
  assertApprovedUploadIntegrity,
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "../src/lib/course-import/asset-upload";
import {
  applyImportPlan,
  reconcileImportPlan,
  type CourseImportAdapter,
} from "../src/lib/course-import/execute";
import { validateCanaryScope, validateCourseManifest } from "../src/lib/course-import/manifest";
import { buildImportPlan } from "../src/lib/course-import/operations";
import { inspectStorageRollbackAssets } from "../src/lib/course-import/storage-rollback";
import type { Database } from "../src/lib/supabase/types";
import { assertCourseImportEnvironment } from "../src/lib/course-import/environment";
import {
  manifestGateForCommand,
  type CourseImportCommand,
} from "../src/lib/course-import/command-policy";
import { runRestartableRollback } from "../src/lib/course-import/rollback-command";

async function main() {
  const { command, manifestPath, flags } = parseArgs(process.argv.slice(2));
  const absoluteManifestPath = resolve(manifestPath);
  const raw = JSON.parse(await readFile(absoluteManifestPath, "utf8")) as unknown;
  const result = validateCourseManifest(raw, {
    gate: manifestGateForCommand(command, flags.canary),
  });
  if (!result.ok) throw new Error(result.errors.map((error) => `- ${error}`).join("\n"));
  if (flags.canary) {
    const canaryErrors = validateCanaryScope(result.value);
    if (canaryErrors.length > 0) throw new Error(canaryErrors.map((error) => `- ${error}`).join("\n"));
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
  assertCourseImportEnvironment(url, flags.allowProduction);
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adapter = createSupabaseAdapter(supabase);

  if (command === "upload") {
    await uploadApprovedAssets({
      endpoint: resumableEndpoint(url),
      serviceKey,
      importId: plan.importId,
      sourceRoot: flags.sourceRoot ? resolve(flags.sourceRoot) : process.cwd(),
      assets: plan.assets,
      bucket: supabase.storage.from("content") as unknown as CourseImportUploadBucket,
      stateRoot: resolve(
        flags.stateRoot ?? join(process.cwd(), ".course-import-state"),
      ),
    });
    return;
  }
  if (command === "apply") {
    await applyImportPlan(plan, adapter);
    return;
  }
  if (command === "verify") {
    const reconciliation = await reconcileImportPlan(plan, adapter);
    const assetProblems = await findAssetProblems(supabase, plan.assets);
    console.log(JSON.stringify({ ...reconciliation, assetProblems }, null, 2));
    if (
      reconciliation.missing.length > 0 ||
      reconciliation.mismatches.length > 0 ||
      assetProblems.length > 0
    ) {
      process.exitCode = 1;
    }
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
      return;
    }

    const { storageRollback } = await runRestartableRollback({
      plan,
      adapter,
      receiptPath: resolve(
        flags.stateRoot ?? join(process.cwd(), ".course-import-state"),
        "rollback-receipts",
        `${plan.importId}.json`,
      ),
      inspectStorage,
      onDatabaseSettled(databaseRollback) {
        console.log(JSON.stringify({ phase: "rollback_settled", databaseRollback }, null, 2));
      },
    });
    console.log(JSON.stringify({ phase: "storage_inspection", storageRollback }, null, 2));
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
): CourseImportAdapter {
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
