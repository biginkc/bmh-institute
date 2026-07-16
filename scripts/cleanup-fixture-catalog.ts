import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildFixtureCleanupPlan,
  executeFixtureCleanup,
  parseFixtureManifest,
  sha256,
  type FixtureCleanupAdapter,
} from "../src/lib/fixture-cleanup/fixture-cleanup";
import {
  assertProductionEnvironment,
  expectedProductionConfirmation,
  readJsonFile,
  validateExecutionApproval,
  validateFreshRollbackRecord,
} from "../src/lib/fixture-cleanup/guards";

const DEFAULT_MANIFEST = "docs/course-production/fixture-boundary-manifest.json";
const args = parseArgs(process.argv.slice(2));
const execute = args.flags.has("execute");
const manifestPath = resolve(args.values.get("manifest") ?? DEFAULT_MANIFEST);
const rawManifest = await readFile(manifestPath, "utf8");
const manifestSha256 = sha256(rawManifest);
const expectedSidecar = `${manifestSha256}  ${manifestPath.split("/").at(-1)}\n`;
const sidecar = await readFile(`${manifestPath}.sha256`, "utf8");
if (sidecar !== expectedSidecar) throw new Error("Fixture manifest checksum sidecar does not match.");
const manifest = parseFixtureManifest(JSON.parse(rawManifest));

const url = requiredEnv("PROD_SUPABASE_URL");
const serviceRole = requiredEnv("PROD_SUPABASE_SERVICE_ROLE_KEY");
assertProductionEnvironment(url);

if (execute) {
  const confirmation = args.values.get("confirm-production-fixture-cleanup");
  if (confirmation !== expectedProductionConfirmation(manifestSha256)) {
    throw new Error(
      "Execution requires the exact --confirm-production-fixture-cleanup value printed by dry-run.",
    );
  }
  const approvalPath = args.values.get("approval-record");
  const rollbackPath = args.values.get("rollback-record");
  if (!approvalPath || !rollbackPath) {
    throw new Error("Execution requires separate --approval-record and --rollback-record JSON files.");
  }
  validateExecutionApproval(await readJsonFile(resolve(approvalPath)), manifestSha256);
  validateFreshRollbackRecord(await readJsonFile(resolve(rollbackPath)), manifestSha256);
}

const client = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adapter = createSupabaseAdapter(client);
const plan = await buildFixtureCleanupPlan({ manifest, manifestSha256, adapter });

console.log(
  JSON.stringify(
    {
      mode: execute ? "execute" : "dry-run",
      project_ref: manifest.project.ref,
      manifest_sha256: manifestSha256,
      delete_counts: plan.deleteCounts,
      storage_delete_counts: plan.storageDeleteCounts,
      blockers: plan.problems,
      execution_confirmation: expectedProductionConfirmation(manifestSha256),
      authorization_notice:
        "The confirmation value is only a typo guard. It is not authorization to execute. A new Jarrad approval record and fresh rollback record are also required.",
    },
    null,
    2,
  ),
);

if (!execute && plan.problems.length > 0) {
  process.exitCode = 1;
} else if (execute) {
  await executeFixtureCleanup({
    manifest,
    plan,
    adapter,
    confirmation: expectedProductionConfirmation(manifestSha256),
  });
  console.log("Exact fixture manifest rows deleted. Auth users, profiles and audit rows were not deletion targets.");
}

function createSupabaseAdapter(client: SupabaseClient): FixtureCleanupAdapter {
  return {
    async listRows(table) {
      return listAllRows(client, table);
    },
    async listAuthUserIds() {
      const ids: string[] = [];
      for (let page = 1; ; page += 1) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`auth.users read failed: ${error.message}`);
        ids.push(...data.users.map((user) => user.id));
        if (data.users.length < 1000) break;
      }
      return ids;
    },
    async listStorageObjectNames(bucket) {
      const names: string[] = [];
      await walkStorage(client, bucket, "", names);
      return names.sort();
    },
    async executeAtomicCleanup({ manifestSha256, confirmation }) {
      const rpcClient = client as unknown as {
        rpc(
          name: string,
          args: Record<string, unknown>,
        ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
      const { data, error } = await rpcClient.rpc("admin_cleanup_fixture_catalog_v1", {
        p_manifest_sha256: manifestSha256,
        p_confirmation: confirmation,
      });
      if (error) throw new Error(`Atomic fixture cleanup failed: ${error.message}`);
      const result = data as { status?: string; deleted?: Record<string, number> };
      if (result.status !== "deleted" && result.status !== "already_deleted") {
        throw new Error("Atomic fixture cleanup returned an unexpected status.");
      }
      return { status: result.status, deleted: result.deleted ?? {} };
    },
    async deleteStorageObjects(bucket, names) {
      if (names.length === 0) return;
      const { error } = await client.storage.from(bucket).remove(names);
      if (error) throw new Error(`${bucket} storage delete failed: ${error.message}`);
    },
  };
}

async function listAllRows(client: SupabaseClient, table: string) {
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await dynamicTable(client, table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function walkStorage(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
  names: string[],
) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`${bucket} storage inventory failed: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) names.push(path);
      else await walkStorage(client, bucket, path, names);
    }
    if ((data ?? []).length < 1000) break;
  }
}

function dynamicTable(client: SupabaseClient, table: string) {
  return client.from(table) as unknown as {
    select(columns: string): {
      range(from: number, to: number): PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
}

function parseArgs(raw: string[]) {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let index = 0; index < raw.length; index += 1) {
    const match = raw[index].match(/^--([^=]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
    else if (raw[index].startsWith("--") && raw[index + 1] && !raw[index + 1].startsWith("--")) {
      values.set(raw[index].slice(2), raw[++index]);
    } else if (raw[index].startsWith("--")) flags.add(raw[index].slice(2));
    else throw new Error(`Unexpected argument ${raw[index]}.`);
  }
  return { flags, values };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}
