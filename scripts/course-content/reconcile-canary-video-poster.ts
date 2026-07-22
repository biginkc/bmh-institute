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
import { validateCanaryScope, validateCourseManifest } from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";
import {
  assertImportedVideoPosterReplacementApproval,
  assertLocalSupersededVideoPosterAssets,
  buildImportedVideoPosterReplacements,
  buildSupersededVideoPosterAssets,
  hashVideoPosterReplacementPayload,
} from "../../src/lib/course-import/video-poster-replacement";

const EXPECTED_IMPORT_ID = "bmh-employee-training-canary-v1";
const FULL_MANIFEST = "content/course-manifests/bmh-employee-training.v1.json";
const DEFAULT_LEDGER = "docs/course-production/thumbnail-pilots/production-ledger.json";
const DEFAULT_APPROVAL = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json";

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args[0];
  if (!manifestPath) {
    throw new Error(`Usage: npm run course:video-posters:reconcile-canary -- <manifest.json> [--execute --confirm=${EXPECTED_IMPORT_ID}] [--state-root=<path>]`);
  }
  const execute = args.includes("--execute");
  const confirm = value(args, "--confirm=");
  const ledgerPath = value(args, "--ledger=") ?? DEFAULT_LEDGER;
  const approvalPath = value(args, "--approval=") ?? DEFAULT_APPROVAL;
  const [canaryBytes, fullBytes, ledgerBytes, approvalBytes] = await Promise.all([
    readFile(resolve(manifestPath)),
    readFile(resolve(FULL_MANIFEST)),
    readFile(resolve(ledgerPath)),
    readFile(resolve(approvalPath)),
  ]);
  const canary = validateCourseManifest(JSON.parse(canaryBytes.toString("utf8")) as unknown, { gate: "canary" });
  if (!canary.ok) throw new Error(canary.errors.map((error) => `- ${error}`).join("\n"));
  const scopeErrors = validateCanaryScope(canary.value);
  if (scopeErrors.length > 0) throw new Error(scopeErrors.map((error) => `- ${error}`).join("\n"));
  const plan = buildImportPlan(canary.value);
  if (plan.importId !== EXPECTED_IMPORT_ID) {
    throw new Error(`Canary poster reconciliation is restricted to ${EXPECTED_IMPORT_ID}.`);
  }
  const full = validateCourseManifest(JSON.parse(fullBytes.toString("utf8")) as unknown, { gate: "release" });
  if (!full.ok) throw new Error(full.errors.map((error) => `- ${error}`).join("\n"));
  const ledger = JSON.parse(ledgerBytes.toString("utf8")) as unknown;
  const fullReplacements = buildImportedVideoPosterReplacements(buildImportPlan(full.value), ledger);
  const approvalSha256 = createHash("sha256").update(approvalBytes).digest("hex");
  assertImportedVideoPosterReplacementApproval({
    replacements: fullReplacements,
    ledgerInput: ledger,
    approvalInput: JSON.parse(approvalBytes.toString("utf8")) as unknown,
    approvalPath,
    approvalSha256,
  });

  const replacements = buildImportedVideoPosterReplacements(plan, ledger);
  if (replacements.length !== 1) {
    throw new Error(`Expected exactly one Tech Stack canary poster replacement, got ${replacements.length}.`);
  }
  const replacementPaths = new Set(replacements.map((replacement) => replacement.replacement_poster_path));
  const assets = plan.assets.filter((asset) => replacementPaths.has(asset.storage_path));
  if (assets.length !== 1) throw new Error("Canary replacement does not bind exactly one approved poster asset.");
  const superseded = buildSupersededVideoPosterAssets(replacements);
  const clientPayloadSha256 = hashVideoPosterReplacementPayload(replacements);

  console.log(JSON.stringify({
    phase: "canary_video_poster_reconciliation_plan",
    import_id: plan.importId,
    replacement_count: replacements.length,
    client_payload_sha256: clientPayloadSha256,
    execute,
  }, null, 2));
  if (!execute) return;
  if (confirm !== plan.importId) throw new Error(`Execution requires --confirm=${plan.importId}.`);
  await assertLocalSupersededVideoPosterAssets(process.cwd(), superseded);

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertCourseImportEnvironment(url, false);
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = client.storage.from(COURSE_IMPORT_BUCKET) as unknown as CourseImportUploadBucket;
  await uploadApprovedAssets({
    endpoint: resumableEndpoint(url),
    serviceKey,
    importId: plan.importId,
    sourceRoot: process.cwd(),
    assets,
    bucket,
    stateRoot: resolve(value(args, "--state-root=") ?? join(process.cwd(), ".course-import-state")),
  });

  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await rpc.rpc("fn_replace_unreleased_imported_video_posters", {
    p_import_id: plan.importId,
    p_replacements: replacements,
    p_client_payload_sha256: clientPayloadSha256,
  });
  if (error) throw new Error(`Canary video poster reconciliation failed: ${error.message}`);

  console.log(JSON.stringify({
    phase: "canary_video_poster_reconciled",
    result: data,
    retained_rollback_paths: superseded.map((asset) => asset.storage_path),
  }, null, 2));
}

function value(args: string[], prefix: string) {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requiredEnv(name: string) {
  const result = process.env[name];
  if (!result) throw new Error(`${name} is required for --execute.`);
  return result;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
