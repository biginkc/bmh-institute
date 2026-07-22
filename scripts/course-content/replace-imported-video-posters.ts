import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  COURSE_IMPORT_BUCKET,
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "../../src/lib/course-import/asset-upload";
import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { validateCourseManifest } from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";
import { removeExactReplacedAssets } from "../../src/lib/course-import/replaced-asset-cleanup";
import {
  assertImportedVideoPosterReplacementApproval,
  assertLocalSupersededVideoPosterAssets,
  buildSupersededVideoPosterAssets,
  buildImportedVideoPosterReplacements,
  hashVideoPosterReplacementPayload,
  hashVideoPosterTargetState,
} from "../../src/lib/course-import/video-poster-replacement";

const DEFAULT_LEDGER = "docs/course-production/thumbnail-pilots/production-ledger.json";
const DEFAULT_APPROVAL = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json";
const DEFAULT_PREFLIGHT = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-production-preflight-2026-07-21.json";
const EXPECTED_IMPORT_ID = "bmh-employee-training-v1";
const EXPECTED_REPLACEMENTS = 29;

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args[0];
  if (!manifestPath) {
    throw new Error("Usage: npm run course:video-posters:replace -- <manifest.json> [--execute --allow-production --confirm=bmh-employee-training-v1] [--ledger=<path>] [--approval=<path>] [--preflight=<path>] [--state-root=<path>]");
  }
  const execute = args.includes("--execute");
  const allowProduction = args.includes("--allow-production");
  const confirm = value(args, "--confirm=");
  const ledgerPath = value(args, "--ledger=") ?? DEFAULT_LEDGER;
  const approvalPath = value(args, "--approval=") ?? DEFAULT_APPROVAL;
  const preflightPath = value(args, "--preflight=") ?? DEFAULT_PREFLIGHT;

  const [manifestBytes, ledgerBytes, approvalBytes, preflightBytes] = await Promise.all([
    readFile(resolve(manifestPath)),
    readFile(resolve(ledgerPath)),
    readFile(resolve(approvalPath)),
    readFile(resolve(preflightPath)),
  ]);
  const validated = validateCourseManifest(JSON.parse(manifestBytes.toString("utf8")) as unknown, { gate: "release" });
  if (!validated.ok) throw new Error(validated.errors.map((error) => `- ${error}`).join("\n"));
  const plan = buildImportPlan(validated.value);
  if (plan.importId !== EXPECTED_IMPORT_ID) {
    throw new Error(`Video poster replacement is restricted to ${EXPECTED_IMPORT_ID}.`);
  }
  const ledger = JSON.parse(ledgerBytes.toString("utf8")) as unknown;
  const replacements = buildImportedVideoPosterReplacements(
    plan,
    ledger,
  );
  if (replacements.length !== EXPECTED_REPLACEMENTS) {
    throw new Error(`Expected ${EXPECTED_REPLACEMENTS} exact video poster replacements, got ${replacements.length}.`);
  }
  const approval = JSON.parse(approvalBytes.toString("utf8")) as unknown;
  const approvalSha256 = createHash("sha256").update(approvalBytes).digest("hex");
  assertImportedVideoPosterReplacementApproval({
    replacements,
    ledgerInput: ledger,
    approvalInput: approval,
    approvalPath,
    approvalSha256,
  });
  const clientPayloadSha256 = hashVideoPosterReplacementPayload(replacements);
  const targetStateSha256 = hashVideoPosterTargetState(replacements);
  const preflight = JSON.parse(preflightBytes.toString("utf8")) as Record<string, unknown>;
  if (
    preflight.schema_version !== "bmh-video-poster-production-preflight/v1"
    || preflight.import_id !== plan.importId
    || typeof preflight.catalog_sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(preflight.catalog_sha256)
    || preflight.target_count !== EXPECTED_REPLACEMENTS
    || preflight.target_mismatch_count !== 0
    || preflight.target_state_sha256 !== targetStateSha256
    || preflight.client_payload_sha256 !== clientPayloadSha256
    || preflight.approval_evidence !== approvalPath
    || preflight.approval_evidence_sha256 !== approvalSha256
    || typeof preflight.recorded_at !== "string"
    || !Number.isFinite(Date.parse(preflight.recorded_at))
  ) {
    throw new Error("Video poster replacement production preflight is invalid or stale relative to the exact payload.");
  }
  const preflightSha256 = createHash("sha256").update(preflightBytes).digest("hex");
  const replacementPaths = new Set(replacements.map((replacement) => replacement.replacement_poster_path));
  const replacementAssets = plan.assets.filter((asset) => replacementPaths.has(asset.storage_path));
  const superseded = buildSupersededVideoPosterAssets(replacements);
  if (replacementAssets.length !== EXPECTED_REPLACEMENTS) {
    throw new Error("Replacement payload does not bind one manifest asset to every video poster.");
  }

  console.log(JSON.stringify({
    phase: "released_video_poster_replacement_plan",
    import_id: plan.importId,
    replacement_count: replacements.length,
    approval_sha256: approvalSha256,
    preflight_sha256: preflightSha256,
    expected_catalog_sha256: preflight.catalog_sha256,
    execute,
  }, null, 2));
  if (!execute) return;
  if (!allowProduction || confirm !== plan.importId) {
    throw new Error(`Execution requires --allow-production --confirm=${plan.importId}.`);
  }
  await assertLocalSupersededVideoPosterAssets(process.cwd(), superseded);

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertCourseImportEnvironment(url, true);
  const stateRoot = resolve(value(args, "--state-root=") ?? join(process.cwd(), ".course-import-state"));
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await uploadApprovedAssets({
    endpoint: resumableEndpoint(url),
    serviceKey,
    importId: plan.importId,
    sourceRoot: process.cwd(),
    assets: replacementAssets,
    bucket: client.storage.from(COURSE_IMPORT_BUCKET) as unknown as CourseImportUploadBucket,
    stateRoot,
  });

  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await rpc.rpc("fn_replace_released_imported_video_posters", {
    p_import_id: plan.importId,
    p_replacements: replacements,
    p_client_payload_sha256: clientPayloadSha256,
    p_approval_evidence_sha256: approvalSha256,
    p_expected_catalog_sha256: preflight.catalog_sha256,
    p_preflight_evidence_sha256: preflightSha256,
  });
  if (error) throw new Error(`Released video poster replacement failed: ${error.message}`);
  console.log(JSON.stringify({ phase: "released_video_posters_replaced", result: data }, null, 2));

  const bucket = client.storage.from(COURSE_IMPORT_BUCKET) as unknown as CourseImportUploadBucket & {
    remove(paths: string[]): Promise<{ data?: unknown; error: { message: string; statusCode?: string | number; status?: string | number } | null }>;
  };
  const cleanup = await removeExactReplacedAssets({
    importId: plan.importId,
    assets: superseded,
    bucket,
    assertUnreferenced: (storagePath) => assertStoragePathUnreferenced(client, storagePath),
  });
  console.log(JSON.stringify({ phase: "superseded_video_posters_removed", ...cleanup }, null, 2));
}

function value(args: string[], prefix: string) {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requiredEnv(name: string) {
  const result = process.env[name];
  if (!result) throw new Error(`${name} is required for --execute.`);
  return result;
}

async function assertStoragePathUnreferenced(
  client: unknown,
  storagePath: string,
) {
  const query = client as unknown as {
    from(table: "content_blocks"): {
      select(columns: "id"): {
        contains(column: "content", value: Record<string, unknown>): {
          limit(count: number): PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await query.from("content_blocks")
    .select("id")
    .contains("content", { poster_path: storagePath })
    .limit(1);
  if (error) throw new Error(`Could not prove ${storagePath} is unreferenced: ${error.message}`);
  if ((data?.length ?? 0) > 0) throw new Error(`Refused to remove still-referenced poster ${storagePath}.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
