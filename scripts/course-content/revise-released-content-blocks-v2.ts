import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import {
  buildReleasedContentBlockRevisionV2,
  releasedContentBlockRevisionV2ClientPayloadSha256,
  releasedContentBlockRevisionV2DatabasePayloadSha256,
  type ReleasedContentBlockRevisionV2Mutation,
  type ReleasedContentBlockRevisionV2Row,
} from "../../src/lib/course-import/released-content-block-revision-v2";
import {
  runReleasedContentBlockRevisionV2Command,
  type ReleasedContentBlockRevisionV2Audit,
} from "../../src/lib/course-import/released-content-block-revision-v2-controller";

/**
 * Versioned, reusable successor to revise-released-content-blocks.ts (which
 * is bound to one exact 44-row historical payload). Usage:
 *
 *   npm run course:content-blocks:revise-v2 -- \
 *     <import_id> <legacy-manifest-path> <target-manifest-path> \
 *     --execute --confirm=<printed-confirmation-string>
 *
 * Run once without --execute to print the plan (mutation count, diff
 * summary, and the exact confirmation string this run will require), review
 * it, then re-run with --execute --confirm=<that string>.
 */

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const [importId, legacyManifestPath, targetManifestPath] = positional;
  if (!importId || !legacyManifestPath || !targetManifestPath) {
    throw new Error(
      "Usage: revise-released-content-blocks-v2.ts <import_id> <legacy-manifest-path> <target-manifest-path> [--execute] [--allow-production] [--confirm=...]",
    );
  }
  const execute = args.includes("--execute");
  const allowProduction = args.includes("--allow-production");
  const confirmation = args.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length);

  const [legacyManifest, targetManifest] = await Promise.all([
    readFile(resolve(legacyManifestPath)),
    readFile(resolve(targetManifestPath)),
  ]);
  const revision = buildReleasedContentBlockRevisionV2({
    importId,
    legacyManifest,
    targetManifest,
  });
  const clientPayloadSha256 = releasedContentBlockRevisionV2ClientPayloadSha256(revision.mutations);
  const databasePayloadSha256 = releasedContentBlockRevisionV2DatabasePayloadSha256(revision.mutations);
  const expectedPriorManifestSha256 = sha256(legacyManifest);
  const manifestSha256 = sha256(targetManifest);

  const plan = {
    phase: "released_content_block_revision_v2_plan",
    environment: execute ? "validated_at_execution_gate" : "offline",
    import_id: importId,
    expected_prior_manifest_sha256: expectedPriorManifestSha256,
    manifest_sha256: manifestSha256,
    client_payload_sha256: clientPayloadSha256,
    database_payload_sha256: databasePayloadSha256,
    ...revision.summary,
    mutation_source_keys: revision.mutations.map((mutation) => mutation.source_key),
    execute,
  };

  await runReleasedContentBlockRevisionV2Command<SupabaseClient>({
    options: { execute, allowProduction, confirmation },
    importId,
    expectedPriorManifestSha256,
    manifestSha256,
    mutations: revision.mutations,
    clientPayloadSha256,
    environment: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    plan,
  }, {
    classifyEnvironment: assertCourseImportEnvironment,
    createClient: (url, serviceRoleKey) =>
      createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    loadActiveRevision: async (client, activeImportId) => {
      // content_import_active_release_v1 is SHARED with the quiz-revision
      // mechanism (one ledger, one active-state view for every mutation
      // kind) -- see the migration's design notes for why a per-kind view
      // would be a split-brain risk.
      const active = await client
        .from("content_import_active_release_v1")
        .select("import_id,active_revision,active_manifest_sha256,active_catalog_sha256")
        .eq("import_id", activeImportId)
        .single();
      return requiredQueryData(active, "Released content revision v2 active-state preflight failed");
    },
    loadCatalogSha256: async (client, catalogImportId) => {
      const result = await client.rpc("fn_course_import_catalog_sha256", { p_import_id: catalogImportId });
      return requiredStringQueryData(result, "Released content revision v2 catalog preflight failed");
    },
    loadMutationRows: async (client, mutations: ReleasedContentBlockRevisionV2Mutation[]) => {
      const result = await client
        .from("content_blocks")
        .select("id,lesson_id,block_type,content,sort_order,is_required_for_completion")
        .in("id", mutations.map((mutation) => mutation.block_id));
      if (result.error) {
        throw new Error(`Released content revision v2 block preflight failed: ${result.error.message}`);
      }
      return result.data as ReleasedContentBlockRevisionV2Row[];
    },
    loadAudit: async (client, auditImportId, auditRevision) => {
      // Same shared table the quiz-revision mechanism writes to. Keyed by
      // the (import_id, revision) primary key -- NEVER by manifest hash:
      // after a rollback + reapply the same manifest hash appears on
      // multiple ledger rows and a hash-keyed single-row lookup errors on
      // the ambiguity (post-commit, which would misreport a successful
      // write as a failure). The kind filter guards against a same-numbered
      // quiz row ever being misread as a content-block receipt.
      const result = await client
        .from("content_import_release_revisions")
        .select(
          "import_id,revision,manifest_sha256,prior_catalog_sha256,catalog_sha256,payload_sha256,client_payload_sha256,mutation_count,update_count,insert_count,evidence",
        )
        .eq("import_id", auditImportId)
        .eq("revision", auditRevision)
        .eq("kind", "content_blocks")
        .maybeSingle();
      if (result.error) {
        throw new Error(`Released content revision v2 audit preflight failed: ${result.error.message}`);
      }
      if (!result.data) return null;
      return {
        ...result.data,
        database_payload_sha256: result.data.payload_sha256,
      } as ReleasedContentBlockRevisionV2Audit;
    },
    callRevision: async (client, callArgs) => {
      const result = await client.rpc("fn_revise_released_content_blocks_v2", callArgs);
      return { data: result.data, error: result.error ? { message: result.error.message } : null };
    },
    log: console.log,
  });
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredQueryData<T>(
  result: { data: T | null; error: { message: string } | null },
  label: string,
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!result.data) throw new Error(`${label}: not found`);
  return result.data;
}

function requiredStringQueryData(
  result: { data: unknown; error: { message: string } | null },
  label: string,
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (typeof result.data !== "string") throw new Error(`${label}: invalid checksum`);
  return result.data;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
