import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { validateCourseManifest } from "../../src/lib/course-import/manifest";
import {
  RELEASED_CONTENT_BLOCK_REVISION,
  buildReleasedContentBlockRevision,
  releasedContentBlockRevisionConfirmation,
  releasedContentBlockRevisionDatabasePayloadSha256,
  releasedContentBlockRevisionPayloadSha256,
  type ReleasedContentBlockMutation,
  type ReleasedContentBlockRow,
} from "../../src/lib/course-import/released-content-block-revision";
import {
  runReleasedContentBlockRevisionCommand,
  type ReleasedContentBlockRevisionAudit,
} from "../../src/lib/course-import/released-content-block-revision-controller";
import {
  assertCompletedUploadReceipt,
} from "../../src/lib/course-import/upload-receipt";

const DEFAULT_MANIFEST =
  "content/course-manifests/bmh-employee-training.v1.json";
const LEGACY_MANIFEST =
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json";

type CommandOptions = {
  manifestPath: string;
  execute: boolean;
  allowProduction: boolean;
  confirmation: string | undefined;
  stateRoot: string;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
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
  await runReleasedContentBlockRevisionCommand<SupabaseClient>({
    options,
    targetManifest,
    targetAssets: targetValidation.value.assets,
    mutations: revision.mutations,
    clientPayloadSha256,
    databasePayloadSha256,
    expectedConfirmation,
    environment: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    plan: {
      phase: "released_content_block_revision_plan",
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
      mutation_ids: revision.mutations.map((mutation) => mutation.block_id),
      execute: options.execute,
      required_confirmation: expectedConfirmation,
    },
  }, {
    classifyEnvironment: assertCourseImportEnvironment,
    loadUploadReceipt: assertCompletedUploadReceipt,
    createClient: (url, serviceRoleKey) => createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
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

function parseOptions(args: string[]): CommandOptions {
  const manifestPath = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_MANIFEST;
  return {
    manifestPath,
    execute: args.includes("--execute"),
    allowProduction: args.includes("--allow-production"),
    confirmation: value(args, "--confirm="),
    stateRoot: resolve(
      value(args, "--state-root=") ??
        join(process.cwd(), ".course-import-state"),
    ),
  };
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

function value(args: string[], prefix: string) {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
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
