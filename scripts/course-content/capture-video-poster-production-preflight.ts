import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { validateCourseManifest } from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";
import {
  assertImportedVideoPosterReplacementApproval,
  buildImportedVideoPosterReplacements,
  buildVideoPosterProductionPreflight,
} from "../../src/lib/course-import/video-poster-replacement";

const EXPECTED_IMPORT_ID = "bmh-employee-training-v1";
const EXPECTED_REPLACEMENTS = 29;
const DEFAULT_LEDGER = "docs/course-production/thumbnail-pilots/production-ledger.json";
const DEFAULT_APPROVAL = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json";
const DEFAULT_OUTPUT = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-production-preflight-2026-07-21.json";

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args[0];
  if (!manifestPath) {
    throw new Error(`Usage: npm run course:video-posters:capture-preflight -- <manifest.json> --execute --allow-production --confirm=${EXPECTED_IMPORT_ID} [--output=<path>]`);
  }
  if (!args.includes("--execute") || !args.includes("--allow-production") || value(args, "--confirm=") !== EXPECTED_IMPORT_ID) {
    throw new Error(`Live preflight capture requires --execute --allow-production --confirm=${EXPECTED_IMPORT_ID}.`);
  }
  const ledgerPath = value(args, "--ledger=") ?? DEFAULT_LEDGER;
  const approvalPath = value(args, "--approval=") ?? DEFAULT_APPROVAL;
  const outputPath = resolve(value(args, "--output=") ?? DEFAULT_OUTPUT);
  const [manifestBytes, ledgerBytes, approvalBytes] = await Promise.all([
    readFile(resolve(manifestPath)),
    readFile(resolve(ledgerPath)),
    readFile(resolve(approvalPath)),
  ]);
  const validated = validateCourseManifest(JSON.parse(manifestBytes.toString("utf8")) as unknown, { gate: "release" });
  if (!validated.ok) throw new Error(validated.errors.map((error) => `- ${error}`).join("\n"));
  const plan = buildImportPlan(validated.value);
  if (plan.importId !== EXPECTED_IMPORT_ID) throw new Error(`Preflight capture is restricted to ${EXPECTED_IMPORT_ID}.`);
  const ledger = JSON.parse(ledgerBytes.toString("utf8")) as unknown;
  const replacements = buildImportedVideoPosterReplacements(plan, ledger);
  if (replacements.length !== EXPECTED_REPLACEMENTS) throw new Error(`Expected ${EXPECTED_REPLACEMENTS} replacements.`);
  const approvalSha256 = createHash("sha256").update(approvalBytes).digest("hex");
  assertImportedVideoPosterReplacementApproval({
    replacements,
    ledgerInput: ledger,
    approvalInput: JSON.parse(approvalBytes.toString("utf8")) as unknown,
    approvalPath,
    approvalSha256,
  });

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (assertCourseImportEnvironment(url, true) !== "production") {
    throw new Error("Production preflight capture requires the canonical production project.");
  }
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const catalog = await rpc.rpc("fn_course_import_catalog_sha256", { p_import_id: plan.importId });
  if (catalog.error) throw new Error(`Production catalog checksum failed: ${catalog.error.message}`);
  const query = client as unknown as {
    from(table: "content_blocks"): {
      select(columns: "id,content"): {
        in(column: "id", values: string[]): PromiseLike<{
          data: Array<{ id: string; content: unknown }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const blocks = await query.from("content_blocks").select("id,content")
    .in("id", replacements.map((replacement) => replacement.block_id));
  if (blocks.error) throw new Error(`Production poster targets could not be read: ${blocks.error.message}`);
  if (blocks.data?.length !== replacements.length) {
    throw new Error(`Production preflight found ${blocks.data?.length ?? 0} of ${replacements.length} exact block IDs.`);
  }
  const receipt = buildVideoPosterProductionPreflight({
    importId: plan.importId,
    catalogSha256: String(catalog.data),
    currentBlocks: blocks.data,
    replacements,
    approvalPath,
    approvalSha256,
    recordedAt: new Date().toISOString(),
  });
  if (receipt.target_mismatch_count !== 0) {
    throw new Error(`Production preflight refused because ${receipt.target_mismatch_count} target blocks drifted.`);
  }
  await atomicWriteJson(outputPath, receipt);
  console.log(JSON.stringify({ phase: "production_video_poster_preflight_captured", output: outputPath, ...receipt }, null, 2));
}

async function atomicWriteJson(path: string, value: unknown) {
  const temporary = resolve(dirname(path), `.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function value(args: string[], prefix: string) {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requiredEnv(name: string) {
  const result = process.env[name];
  if (!result) throw new Error(`${name} is required.`);
  return result;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
