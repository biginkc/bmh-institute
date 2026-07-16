import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { findRemoteAssetProblems } from "../src/lib/course-import/asset-transfer";
import {
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "../src/lib/course-import/asset-upload";
import {
  applyImportPlan,
  batchIds,
  reconcileImportPlan,
  rollbackImportPlan,
  type CourseImportAdapter,
} from "../src/lib/course-import/execute";
import { validateCanaryScope, validateCourseManifest } from "../src/lib/course-import/manifest";
import { buildImportPlan, type ImportPlan, type ImportTable } from "../src/lib/course-import/operations";
import { assertNoExternalRollbackReferences } from "../src/lib/course-import/rollback-safety";
import type { Database } from "../src/lib/supabase/types";

const PRODUCTION_PROJECT_REF = "dhvfsyteqsxagokoerrx";

async function main() {
  const { command, manifestPath, flags } = parseArgs(process.argv.slice(2));
  const absoluteManifestPath = resolve(manifestPath);
  const raw = JSON.parse(await readFile(absoluteManifestPath, "utf8")) as unknown;
  const releaseGate = command === "apply" || command === "verify" || flags.canary;
  const result = validateCourseManifest(raw, { gate: releaseGate ? "release" : "draft" });
  if (!result.ok) throw new Error(result.errors.map((error) => `- ${error}`).join("\n"));
  if (flags.canary) {
    const canaryErrors = validateCanaryScope(result.value);
    if (canaryErrors.length > 0) throw new Error(canaryErrors.map((error) => `- ${error}`).join("\n"));
  }
  const plan = buildImportPlan(result.value);

  console.log(JSON.stringify({ command, canary: flags.canary, dryRun: !flags.execute, summary: plan.summary }, null, 2));
  if (command === "validate") return;
  if (!flags.execute) {
    console.log("Dry run only. Add --execute after reviewing this plan.");
    return;
  }

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  guardEnvironment(url, flags.allowProduction);
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adapter = createSupabaseAdapter(supabase);

  if (command === "upload") {
    await uploadApprovedAssets({
      endpoint: resumableEndpoint(url),
      serviceKey,
      sourceRoot: flags.sourceRoot ? resolve(flags.sourceRoot) : process.cwd(),
      assets: plan.assets,
      bucket: supabase.storage.from("content") as unknown as CourseImportUploadBucket,
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
  if (command === "rollback") {
    if (flags.confirm !== plan.importId) {
      throw new Error(`Rollback requires --confirm=${plan.importId}.`);
    }
    await rollbackImportPlan(plan, adapter);
    const { error } = await supabase.storage.from("content").remove(
      plan.assets.map((asset) => asset.storage_path),
    );
    if (error) throw new Error(`Storage rollback failed: ${error.message}`);
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
    async upsert(table, row) {
      const tableApi = supabase.from(table) as unknown as {
        upsert(value: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
      };
      const { error } = await tableApi.upsert(row);
      if (error) throw new Error(`${table} upsert failed: ${error.message}`);
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
    async deleteByIds(table, ids) {
      const tableApi = supabase.from(table) as unknown as {
        delete(): {
          in(column: string, values: string[]): PromiseLike<{ error: { message: string } | null }>;
        };
      };
      const { error } = await tableApi.delete().in("id", ids);
      if (error) throw new Error(`${table} rollback failed: ${error.message}`);
    },
    async assertSafeRollback(plan) {
      await assertNoExternalDependents(supabase, plan);
    },
  };
}

async function assertNoExternalDependents(
  supabase: SupabaseClient<Database>,
  plan: ImportPlan,
) {
  const ids = (table: ImportTable) =>
    plan.operations.filter((operation) => operation.table === table).map((operation) => operation.id);
  await assertNoExternalRollbackReferences(plan, async ({ table, column, ids: batch }) => {
    const { data, error } = await dynamicReferenceQuery(supabase, table, column, batch);
    if (error) {
      throw new Error(
        `Rollback preflight failed for external ${table} references: ${error.message}`,
      );
    }
    return data ?? [];
  });
  const checks = [
    ["QA group memberships", "user_role_groups", "role_group_id", ids("role_groups")],
    ["block progress rows", "user_block_progress", "block_id", ids("content_blocks")],
    ["video progress rows", "user_video_progress", "block_id", ids("content_blocks")],
    ["lesson completions", "user_lesson_completions", "lesson_id", ids("lessons")],
    ["quiz attempts", "user_quiz_attempts", "quiz_id", ids("quizzes")],
    ["assignment submissions", "assignment_submissions", "lesson_id", ids("lessons")],
    ["role-play results", "role_play_results", "block_id", ids("content_blocks")],
    ["course resume rows", "user_course_resume", "course_id", ids("courses")],
    ["course certificates", "certificates", "course_id", ids("courses")],
    ["program certificates", "program_certificates", "program_id", ids("programs")],
  ] as const;
  for (const [label, table, column, checkIds] of checks) {
    let total = 0;
    for (const batch of batchIds([...checkIds])) {
      const { count, error } = await dynamicCountQuery(supabase, table, column, batch);
      if (error) throw new Error(`Rollback preflight failed for ${label}: ${error.message}`);
      total += count ?? 0;
    }
    if (total > 0) throw new Error(`Rollback blocked: found ${total} external ${label}.`);
  }
}

function dynamicReferenceQuery(
  supabase: SupabaseClient<Database>,
  table: string,
  column: string,
  values: string[],
) {
  const client = supabase as unknown as {
    from(name: string): {
      select(columns: string): {
        in(field: string, items: string[]): PromiseLike<{
          data: Array<{ id: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  return client.from(table).select("id").in(column, values);
}

function dynamicCountQuery(
  supabase: SupabaseClient<Database>,
  table: string,
  column: string,
  values: string[],
) {
  const client = supabase as unknown as {
    from(name: string): {
      select(columns: string, options: { count: "exact"; head: true }): {
        in(field: string, items: string[]): PromiseLike<{
          count: number | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  return client.from(table).select("id", { count: "exact", head: true }).in(column, values);
}

function parseArgs(args: string[]) {
  const command = args[0];
  const manifestPath = args[1];
  if (!["validate", "upload", "apply", "verify", "rollback"].includes(command) || !manifestPath) {
    throw new Error("Usage: npm run course:import -- <validate|upload|apply|verify|rollback> <manifest.json> [--execute] [--canary] [--source-root=<path>] [--allow-production] [--confirm=<import_id>]");
  }
  return {
    command: command as "validate" | "upload" | "apply" | "verify" | "rollback",
    manifestPath,
    flags: {
      execute: args.includes("--execute"),
      canary: args.includes("--canary"),
      allowProduction: args.includes("--allow-production"),
      confirm: args.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length),
      sourceRoot: args.find((arg) => arg.startsWith("--source-root="))?.slice("--source-root=".length),
    },
  };
}

function guardEnvironment(url: string, allowProduction: boolean) {
  if (url.includes(PRODUCTION_PROJECT_REF) && !allowProduction) {
    throw new Error("Production writes are blocked. Review the dry run and add --allow-production only at an approved gate.");
  }
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
