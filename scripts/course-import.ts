import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Upload as TusUpload } from "tus-js-client";

import { findRemoteAssetProblems } from "../src/lib/course-import/asset-transfer";
import { createVerifiedFileSnapshot } from "../src/lib/course-import/asset-staging";
import { applyImportPlan, reconcileImportPlan, rollbackImportPlan, type CourseImportAdapter } from "../src/lib/course-import/execute";
import { validateCanaryScope, validateCourseManifest } from "../src/lib/course-import/manifest";
import { buildImportPlan, type ImportPlan, type ImportTable } from "../src/lib/course-import/operations";
import type { Database } from "../src/lib/supabase/types";

const PRODUCTION_PROJECT_REF = "dhvfsyteqsxagokoerrx";
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

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
    await uploadAssets({
      url,
      serviceKey,
      sourceRoot: flags.sourceRoot ? resolve(flags.sourceRoot) : process.cwd(),
      assets: plan.assets,
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
  const checks = [
    ["QA group memberships", supabase.from("user_role_groups").select("user_id", { count: "exact", head: true }).in("role_group_id", ids("role_groups"))],
    ["block progress rows", supabase.from("user_block_progress").select("id", { count: "exact", head: true }).in("block_id", ids("content_blocks"))],
    ["video progress rows", dynamicCountQuery(supabase, "user_video_progress", "block_id", ids("content_blocks"))],
    ["lesson completions", supabase.from("user_lesson_completions").select("id", { count: "exact", head: true }).in("lesson_id", ids("lessons"))],
    ["quiz attempts", supabase.from("user_quiz_attempts").select("id", { count: "exact", head: true }).in("quiz_id", ids("quizzes"))],
    ["assignment submissions", supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).in("lesson_id", ids("lessons"))],
    ["role-play results", supabase.from("role_play_results").select("id", { count: "exact", head: true }).in("block_id", ids("content_blocks"))],
    ["course resume rows", supabase.from("user_course_resume").select("user_id", { count: "exact", head: true }).in("course_id", ids("courses"))],
    ["course certificates", supabase.from("certificates").select("id", { count: "exact", head: true }).in("course_id", ids("courses"))],
    ["program certificates", supabase.from("program_certificates").select("id", { count: "exact", head: true }).in("program_id", ids("programs"))],
  ] as const;
  for (const [label, query] of checks) {
    const { count, error } = await query;
    if (error) throw new Error(`Rollback preflight failed for ${label}: ${error.message}`);
    if ((count ?? 0) > 0) throw new Error(`Rollback blocked: found ${count} external ${label}.`);
  }
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

async function uploadAssets({
  url,
  serviceKey,
  sourceRoot,
  assets,
}: {
  url: string;
  serviceKey: string;
  sourceRoot: string;
  assets: ReturnType<typeof buildImportPlan>["assets"];
}) {
  const storage = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const asset of assets) {
    if (asset.approval_status === "missing") continue;
    const existingProblems = await findAssetProblems(storage, [asset]);
    if (existingProblems.length === 0) {
      console.log(`Already uploaded ${asset.source_key} -> ${asset.storage_path}`);
      continue;
    }
    const localPath = await resolveSourcePath(sourceRoot, asset.local_path);
    const snapshotParent = resolve(process.cwd(), ".course-import-state", "upload-snapshots");
    await mkdir(snapshotParent, { recursive: true });
    const snapshotDirectory = await mkdtemp(join(snapshotParent, "asset-"));
    try {
      const snapshot = await createVerifiedFileSnapshot({
        source: localPath,
        destination: join(snapshotDirectory, basename(localPath)),
        expectedSize: asset.size_bytes,
        expectedChecksum: asset.checksum_sha256,
      });
      await uploadTus({
        endpoint: resumableEndpoint(url),
        serviceKey,
        localPath: snapshot.path,
        size: snapshot.size,
        storagePath: asset.storage_path,
        contentType: asset.mime_type,
        fingerprint: `${snapshot.checksum_sha256}:${asset.storage_path}`,
        checksum: snapshot.checksum_sha256,
      });
      const uploadedProblems = await findAssetProblems(storage, [
        {
          ...asset,
          size_bytes: snapshot.size,
          checksum_sha256: snapshot.checksum_sha256,
        },
      ]);
      if (uploadedProblems.length > 0) {
        throw new Error(
          `${asset.source_key} upload failed exact remote verification: ${uploadedProblems.map((problem) => problem.problem).join(", ")}`,
        );
      }
      console.log(`Uploaded ${asset.source_key} -> ${asset.storage_path}`);
    } finally {
      await rm(snapshotDirectory, { recursive: true, force: true });
    }
  }
}

function uploadTus({
  endpoint,
  serviceKey,
  localPath,
  size,
  storagePath,
  contentType,
  fingerprint,
  checksum,
}: {
  endpoint: string;
  serviceKey: string;
  localPath: string;
  size: number;
  storagePath: string;
  contentType: string;
  fingerprint: string;
  checksum: string | null;
}) {
  const stream = createReadStream(localPath);
  const urlStorage = new JsonTusUrlStorage(
    resolve(process.cwd(), ".course-import-state", "tus-uploads.json"),
  );
  return new Promise<void>((resolveUpload, reject) => {
    const upload = new TusUpload(stream as unknown as Buffer, {
      endpoint,
      uploadSize: size,
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: { authorization: `Bearer ${serviceKey}`, "x-upsert": "false" },
      metadata: {
        bucketName: "content",
        objectName: storagePath,
        contentType,
        cacheControl: "3600",
        filename: basename(localPath),
        metadata: JSON.stringify({ sha256: checksum }),
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      fingerprint: async () => `bmh:${fingerprint}`,
      urlStorage,
      onError: reject,
      onProgress: (sent, total) => process.stdout.write(`\r${storagePath}: ${Math.round((sent / total) * 100)}%`),
      onSuccess: () => {
        process.stdout.write("\n");
        resolveUpload();
      },
    });
    void upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, reject);
  });
}

type StoredTusUpload = {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
  fingerprint: string;
};

class JsonTusUrlStorage {
  constructor(private readonly filePath: string) {}

  async findAllUploads() {
    return Object.values(await this.read());
  }

  async findUploadsByFingerprint(fingerprint: string) {
    return (await this.findAllUploads()).filter((upload) => upload.fingerprint === fingerprint);
  }

  async addUpload(fingerprint: string, upload: Omit<StoredTusUpload, "fingerprint">) {
    const entries = await this.read();
    const key = `${fingerprint}:${upload.creationTime}`;
    entries[key] = { ...upload, fingerprint, urlStorageKey: key };
    await this.write(entries);
    return key;
  }

  async removeUpload(key: string) {
    const entries = await this.read();
    delete entries[key];
    await this.write(entries);
  }

  private async read(): Promise<Record<string, StoredTusUpload>> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, StoredTusUpload>;
    } catch {
      return {};
    }
  }

  private async write(entries: Record<string, StoredTusUpload>) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }
}

async function resolveSourcePath(sourceRoot: string, localPath: string) {
  const root = await realpath(sourceRoot);
  const candidate = await realpath(resolve(root, localPath));
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.startsWith("..") || resolve(root, pathFromRoot) !== candidate) {
    throw new Error(`Asset path escapes --source-root: ${localPath}`);
  }
  return candidate;
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

function resumableEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  const projectId = url.hostname.endsWith(".supabase.co")
    ? url.hostname.slice(0, -".supabase.co".length)
    : null;
  return projectId
    ? `${url.protocol}//${projectId}.storage.supabase.co/storage/v1/upload/resumable`
    : `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
