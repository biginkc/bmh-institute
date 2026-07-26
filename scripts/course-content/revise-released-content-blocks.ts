import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "../../src/lib/course-import/asset-upload";
import { findRemoteAssetProblems } from "../../src/lib/course-import/asset-transfer";
import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { validateCourseManifest } from "../../src/lib/course-import/manifest";
import {
  RELEASED_CONTENT_BLOCK_REVISION,
  buildReleasedContentBlockRevision,
  releasedContentBlockRevisionConfirmation,
  releasedContentBlockRevisionDatabasePayloadSha256,
  releasedContentBlockRevisionPayloadSha256,
  selectReleasedContentBlockRevisionGuideAssets,
  type ReleasedContentBlockMutation,
  type ReleasedContentBlockRow,
} from "../../src/lib/course-import/released-content-block-revision";
import {
  parseReleasedContentBlockRevisionCliOptions,
  runReleasedContentBlockRevisionAssetPreparation,
  runReleasedContentBlockRevisionCommand,
  type ReleasedContentBlockRevisionAudit,
} from "../../src/lib/course-import/released-content-block-revision-controller";
import {
  assertCompletedReleasedContentBlockRevisionAssetReceipt,
  invalidateReleasedContentBlockRevisionAssetReceipt,
  writeCompletedReleasedContentBlockRevisionAssetReceipt,
} from "../../src/lib/course-import/released-content-block-revision-receipt";

const DEFAULT_MANIFEST =
  "content/course-manifests/bmh-employee-training.v1.json";
const LEGACY_MANIFEST =
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json";

async function main() {
  const options = parseReleasedContentBlockRevisionCliOptions(
    process.argv.slice(2),
    {
      cwd: process.cwd(),
      defaultManifest: DEFAULT_MANIFEST,
    },
  );
  const [legacyManifest, targetManifest] = await Promise.all([
    readFile(resolve(LEGACY_MANIFEST)),
    readFile(resolve(options.manifestPath)),
  ]);
  const revision = buildReleasedContentBlockRevision({
    legacyManifest,
    targetManifest,
  });
  const clientPayloadSha256 = releasedContentBlockRevisionPayloadSha256(
    revision.mutations,
  );
  const databasePayloadSha256 =
    releasedContentBlockRevisionDatabasePayloadSha256(revision.mutations);
  const expectedConfirmation = releasedContentBlockRevisionConfirmation({
    expectedCatalogSha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
    payloadSha256: clientPayloadSha256,
  });

  const targetValidation = validateCourseManifest(
    JSON.parse(targetManifest.toString("utf8")) as unknown,
    { gate: "release" },
  );
  if (!targetValidation.ok) {
    throw new Error(targetValidation.errors.join("\n"));
  }
  const guideAssets = selectReleasedContentBlockRevisionGuideAssets(
    targetValidation.value.assets,
    revision.mutations,
  );
  const environment = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const plan = {
    phase:
      options.mode === "prepare-assets"
        ? "released_content_block_revision_asset_plan"
        : "released_content_block_revision_plan",
    mode: options.mode,
    environment: options.execute ? "validated_at_execution_gate" : "offline",
    import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
    original_release_manifest_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.originalReleaseManifestSha256,
    expected_active_manifest_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256,
    manifest_sha256: RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    expected_prior_catalog_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
    client_payload_sha256: clientPayloadSha256,
    database_payload_sha256: databasePayloadSha256,
    ...revision.summary,
    mutation_count: revision.mutations.length,
    guide_asset_count: guideAssets.length,
    guide_asset_paths: guideAssets.map((asset) => asset.storage_path),
    mutation_ids: revision.mutations.map((mutation) => mutation.block_id),
    execute: options.execute,
    required_confirmation: expectedConfirmation,
  };
  if (options.mode === "prepare-assets") {
    await runReleasedContentBlockRevisionAssetPreparation<SupabaseClient>({
      options,
      targetManifest,
      guideAssets,
      mutations: revision.mutations,
      clientPayloadSha256,
      expectedConfirmation,
      sourceRoot: options.sourceRoot,
      environment,
      plan,
    }, {
      classifyEnvironment: assertCourseImportEnvironment,
      createClient: createRevisionClient,
      invalidateReceipt:
        invalidateReleasedContentBlockRevisionAssetReceipt,
      uploadGuideAssets: async (client, input) => {
        await uploadApprovedAssets({
          endpoint: resumableEndpoint(input.endpoint),
          serviceKey: input.serviceRoleKey,
          importId: input.importId,
          sourceRoot: input.sourceRoot,
          assets: input.assets,
          bucket: client.storage.from("content") as unknown as
            CourseImportUploadBucket,
          stateRoot: input.stateRoot,
        });
      },
      verifyGuideAssets: (client, assets) =>
        findRemoteAssetProblems(client.storage.from("content"), assets),
      writeReceipt:
        writeCompletedReleasedContentBlockRevisionAssetReceipt,
      log: console.log,
    });
    return;
  }
  await runReleasedContentBlockRevisionCommand<SupabaseClient>({
    options,
    targetManifest,
    guideAssets,
    mutations: revision.mutations,
    clientPayloadSha256,
    databasePayloadSha256,
    expectedConfirmation,
    environment,
    plan,
  }, {
    classifyEnvironment: assertCourseImportEnvironment,
    loadUploadReceipt:
      assertCompletedReleasedContentBlockRevisionAssetReceipt,
    createClient: createRevisionClient,
    verifyGuideAssets: (client, assets) =>
      findRemoteAssetProblems(client.storage.from("content"), assets),
    loadActiveRelease,
    loadCatalogSha256,
    loadAudit,
    loadMutationRows: loadLiveMutationRows,
    callRevision: async (client, args) => {
      const result = await client.rpc(
        "fn_revise_released_content_blocks_v1",
        args,
      );
      return {
        data: result.data,
        error: result.error
          ? { message: result.error.message }
          : null,
      };
    },
    log: console.log,
  });
}

function createRevisionClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadActiveRelease(client: SupabaseClient) {
  const active = await client
    .from("content_import_active_release_v1")
    .select(
      "import_id,active_revision,active_manifest_sha256,active_catalog_sha256",
    )
    .eq("import_id", RELEASED_CONTENT_BLOCK_REVISION.importId)
    .single();
  return requiredQueryData(
    active,
    "Released content revision active-release preflight failed",
  );
}

async function loadCatalogSha256(client: SupabaseClient) {
  const result = await client.rpc("fn_course_import_catalog_sha256", {
    p_import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
  });
  return requiredStringQueryData(
    result,
    "Released content revision catalog preflight failed",
  );
}

async function loadLiveMutationRows(
  client: SupabaseClient,
  mutations: ReleasedContentBlockMutation[],
) {
  const result = await client
    .from("content_blocks")
    .select(
      "id,lesson_id,block_type,content,sort_order,is_required_for_completion",
    )
    .in("id", mutations.map((mutation) => mutation.block_id));
  if (result.error) {
    throw new Error(
      `Released content revision block preflight failed: ${result.error.message}`,
    );
  }
  return result.data as ReleasedContentBlockRow[];
}

async function loadAudit(
  client: SupabaseClient,
): Promise<ReleasedContentBlockRevisionAudit | null> {
  const result = await client
    .from("content_import_released_content_block_revision_records")
    .select(
      "import_id,manifest_sha256,prior_catalog_sha256,replacement_catalog_sha256,database_payload_sha256,client_payload_sha256,guide_update_count,flashcard_update_count,role_play_insert_count,evidence",
    )
    .eq("import_id", RELEASED_CONTENT_BLOCK_REVISION.importId)
    .eq(
      "manifest_sha256",
      RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    )
    .maybeSingle();
  if (result.error) {
    throw new Error(
      `Released content revision audit preflight failed: ${result.error.message}`,
    );
  }
  return result.data as ReleasedContentBlockRevisionAudit | null;
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
  if (typeof result.data !== "string") {
    throw new Error(`${label}: invalid checksum`);
  }
  return result.data;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
