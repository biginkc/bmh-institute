import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  COURSE_IMPORT_BUCKET,
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "../../src/lib/course-import/asset-upload";
import {
  findRemoteAssetProblems,
  type RemoteStorageError,
} from "../../src/lib/course-import/asset-transfer";
import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import {
  validateCourseManifest,
  type CourseImportAsset,
} from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";
import {
  assertWelcomeVideoReplacementNotRolledBack,
  runWelcomeVideoUploadAfterRollbackGuard,
} from "../../src/lib/course-import/welcome-video-replacement-policy";

const EXPECTED_IMPORT_ID = "bmh-employee-training-v1";
const VIDEO_KEY = "video-slot-01-welcome";
const CAPTION_KEY = "caption-video-slot-01-welcome";
const DEFAULT_EVIDENCE =
  "docs/course-production/video-zero-release-2026-07-30/README.md";
const EXPECTED_BLOCK_ID = "e8d2c1d2-7a02-5b28-a807-9dad78b46306";
const EXPECTED_CATALOG_SHA256 =
  "6b1413b3c74aa9c35ba64ce12c7ec598d373fa876769a307d03c4d3e38352859";
const APPROVAL_EVIDENCE_SHA256 =
  "6997993901d79abec0a542dad342b67e990cfda6b7b3b7abbce484b5e782b7b3";
const EXPECTED_CLIENT_PAYLOAD_SHA256 =
  "ce6b666c7f13eb9f235b5484916c98aef03752c74afcffd430a19a65af02b900";
const PRIOR_DURATION_SECONDS = 246.186;
const APPROVED_DURATION_SECONDS = 318.351;

const PRIOR_VIDEO = {
  path: "courses/bmh-employee-training/v1/videos/video-slot-01-welcome.493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72.mp4",
  sha256: "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72",
  size: 35_190_296,
  mimeType: "video/mp4",
} as const;
const PRIOR_CAPTION = {
  path: "courses/bmh-employee-training/v1/captions/video-slot-01-welcome.54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11.vtt",
  sha256: "54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11",
  size: 5_636,
  mimeType: "text/vtt",
} as const;
const APPROVED_VIDEO = {
  sha256: "06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b",
  size: 74_404_741,
} as const;
const APPROVED_CAPTION = {
  sha256: "bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939",
  size: 7_629,
} as const;

type JsonObject = Record<string, unknown>;
const PRIOR_CONTENT: JsonObject = {
  title: "Welcome and the Service Playbook",
  file_path: PRIOR_VIDEO.path,
  part_label: "Part A",
  poster_path:
    "courses/bmh-employee-training/v1/posters/video-slot-01-welcome-2e481279cc270f73c2af666857dd7379c529679388d5ccd41b0d8eace71c11b0.webp",
  caption_path: PRIOR_CAPTION.path,
  duration_seconds: PRIOR_DURATION_SECONDS,
};
type VideoRow = {
  id: string;
  content: JsonObject;
  lesson_id: string;
  lessons: { content_import_id: string | null } | null;
};
type StorageInfo = {
  size?: number;
  metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};
type TargetAssets = {
  video: CourseImportAsset & { checksum_sha256: string; size_bytes: number };
  caption: CourseImportAsset & { checksum_sha256: string; size_bytes: number };
};
type WelcomeReplacement = {
  block_id: string;
  video_asset_key: typeof VIDEO_KEY;
  caption_asset_key: typeof CAPTION_KEY;
  expected_content: JsonObject;
  expected_video_path: string;
  expected_video_sha256: string;
  expected_video_size_bytes: number;
  expected_video_mime_type: string;
  expected_caption_path: string;
  expected_caption_sha256: string;
  expected_caption_size_bytes: number;
  expected_caption_mime_type: string;
  expected_duration_seconds: number;
  replacement_video_path: string;
  replacement_video_sha256: string;
  replacement_video_size_bytes: number;
  replacement_video_mime_type: string;
  replacement_caption_path: string;
  replacement_caption_sha256: string;
  replacement_caption_size_bytes: number;
  replacement_caption_mime_type: string;
  replacement_duration_seconds: number;
};
type Options = {
  manifestPath: string;
  evidencePath: string;
  execute: boolean;
  rollback: boolean;
  allowProduction: boolean;
  confirm: string | undefined;
  stateRoot: string;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const { importId, assets, evidenceBytes } = await loadTargetAssets(options);
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertCourseImportEnvironment(url, true);
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = client.storage.from(
    COURSE_IMPORT_BUCKET,
  ) as unknown as CourseImportUploadBucket;
  const row = await loadLiveWelcomeBlock(client, importId);
  const state = classifyState(row.content, assets);
  const catalogSha256 = await loadCatalogSha256(client, importId);
  if (options.rollback) {
    await rollbackExisting({
      client,
      storage,
      importId,
      row,
      assets,
      catalogSha256,
      state,
      options,
    });
    return;
  }
  if (state === "expected" && catalogSha256 !== EXPECTED_CATALOG_SHA256) {
    throw new Error(
      "Production catalog does not match the reviewed Video Zero replacement baseline.",
    );
  }

  if (state === "replacement") {
    await replayExisting({
      client,
      storage,
      importId,
      row,
      assets,
      catalogSha256,
      options,
    });
    return;
  }
  if (state !== "expected") {
    throw new Error(
      "Production welcome block is in a mixed or unknown video/caption state; refusing replacement.",
    );
  }
  await assertReplacementWasNotRolledBack(client, importId);

  await verifyStorageObject(
    storage,
    "prior welcome video",
    PRIOR_VIDEO,
    importId,
  );
  await verifyStorageObject(
    storage,
    "prior welcome caption",
    PRIOR_CAPTION,
    importId,
  );
  const replacementStorage = {
    video: await inspectReplacementStorageObject(
      storage,
      "replacement welcome video",
      manifestStorageIdentity(assets.video),
      importId,
    ),
    caption: await inspectReplacementStorageObject(
      storage,
      "replacement welcome caption",
      manifestStorageIdentity(assets.caption),
      importId,
    ),
  };
  const replacement = buildReplacement(row, assets);
  const replacements = [replacement];
  const clientPayloadSha256 = sha256(Buffer.from(JSON.stringify(replacements)));
  if (clientPayloadSha256 !== EXPECTED_CLIENT_PAYLOAD_SHA256) {
    throw new Error(
      "Video Zero replacement payload bytes do not match the reviewed operation.",
    );
  }
  const approvalEvidenceSha256 = sha256(evidenceBytes);
  if (approvalEvidenceSha256 !== APPROVAL_EVIDENCE_SHA256) {
    throw new Error(
      "Video Zero approval evidence bytes do not match the reviewed release evidence.",
    );
  }

  console.log(
    JSON.stringify(
      {
        phase: "released_welcome_video_replacement_plan",
        import_id: importId,
        replacement_count: 1,
        expected_catalog_sha256: catalogSha256,
        client_payload_sha256: clientPayloadSha256,
        approval_evidence_sha256: approvalEvidenceSha256,
        replacements,
        retained_rollback_paths: {
          video: PRIOR_VIDEO.path,
          caption: PRIOR_CAPTION.path,
        },
        replacement_storage: replacementStorage,
        execute: options.execute,
      },
      null,
      2,
    ),
  );
  if (!options.execute) return;
  assertExecutionConfirmation(options, importId);

  await runWelcomeVideoUploadAfterRollbackGuard({
    assertNotRolledBack: () =>
      assertReplacementWasNotRolledBack(client, importId),
    upload: () =>
      uploadApprovedAssets({
        endpoint: resumableEndpoint(url),
        serviceKey,
        importId,
        sourceRoot: process.cwd(),
        assets: [assets.video, assets.caption],
        bucket: storage,
        stateRoot: options.stateRoot,
      }),
  });
  await verifyStorageObject(
    storage,
    "prior welcome video",
    PRIOR_VIDEO,
    importId,
  );
  await verifyStorageObject(
    storage,
    "prior welcome caption",
    PRIOR_CAPTION,
    importId,
  );
  await verifyStorageObject(
    storage,
    "replacement welcome video",
    manifestStorageIdentity(assets.video),
    importId,
  );
  await verifyStorageObject(
    storage,
    "replacement welcome caption",
    manifestStorageIdentity(assets.caption),
    importId,
  );

  const result = await client.rpc(
    "fn_replace_released_imported_welcome_video",
    {
      p_import_id: importId,
      p_replacements: replacements,
      p_client_payload_sha256: clientPayloadSha256,
      p_approval_evidence_sha256: approvalEvidenceSha256,
      p_expected_catalog_sha256: catalogSha256,
    },
  );
  if (result.error) {
    throw new Error(
      `Released welcome video replacement failed: ${result.error.message}`,
    );
  }
  await verifyPersistedBlock(client, replacement);
  console.log(
    JSON.stringify(
      {
        phase: "released_welcome_video_replaced",
        result: result.data,
        retained_rollback_paths: {
          video: PRIOR_VIDEO.path,
          caption: PRIOR_CAPTION.path,
        },
      },
      null,
      2,
    ),
  );
}

function parseOptions(args: string[]): Options {
  const manifestPath = args[0];
  if (!manifestPath || manifestPath.startsWith("--")) {
    throw new Error(
      "Usage: npm run course:welcome-video:replace -- <manifest.json> [--rollback] [--execute --allow-production --confirm=bmh-employee-training-v1] [--evidence=<path>] [--state-root=<path>]",
    );
  }
  return {
    manifestPath,
    evidencePath: value(args, "--evidence=") ?? DEFAULT_EVIDENCE,
    execute: args.includes("--execute"),
    rollback: args.includes("--rollback"),
    allowProduction: args.includes("--allow-production"),
    confirm: value(args, "--confirm="),
    stateRoot: resolve(
      value(args, "--state-root=") ??
        join(process.cwd(), ".course-import-state"),
    ),
  };
}

async function loadReplacementAudit(client: SupabaseClient, importId: string) {
  const audit = await client
    .from("content_import_welcome_video_replacement_records")
    .select(
      "id,replacements,database_payload_sha256,client_payload_sha256,approval_evidence_sha256,prior_catalog_sha256,replacement_catalog_sha256",
    )
    .eq("import_id", importId)
    .eq("client_payload_sha256", EXPECTED_CLIENT_PAYLOAD_SHA256)
    .eq("approval_evidence_sha256", APPROVAL_EVIDENCE_SHA256)
    .limit(2);
  if (audit.error) {
    throw new Error(
      `Production welcome replacement audit could not be read: ${audit.error.message}.`,
    );
  }
  if (audit.data.length !== 1) {
    throw new Error(
      "Production welcome replacement audit is missing or duplicated.",
    );
  }
  const record = audit.data[0];
  if (
    !/^[0-9a-f]{64}$/.test(record.database_payload_sha256 ?? "") ||
    record.prior_catalog_sha256 !== EXPECTED_CATALOG_SHA256 ||
    !/^[0-9a-f]{64}$/.test(record.replacement_catalog_sha256 ?? "")
  ) {
    throw new Error("Production welcome replacement audit has drifted.");
  }
  return record;
}

async function assertReplacementWasNotRolledBack(
  client: SupabaseClient,
  importId: string,
) {
  const rollback = await client
    .from("content_import_welcome_video_rollback_records")
    .select("id")
    .eq("import_id", importId)
    .eq("client_payload_sha256", EXPECTED_CLIENT_PAYLOAD_SHA256)
    .eq("approval_evidence_sha256", APPROVAL_EVIDENCE_SHA256)
    .limit(1);
  if (rollback.error) {
    throw new Error(
      `Production welcome rollback audit could not be read: ${rollback.error.message}.`,
    );
  }
  assertWelcomeVideoReplacementNotRolledBack(rollback.data);
}

async function rollbackExisting(input: {
  client: SupabaseClient;
  storage: CourseImportUploadBucket;
  importId: string;
  row: VideoRow;
  assets: TargetAssets;
  catalogSha256: string;
  state: "expected" | "replacement" | "mixed";
  options: Options;
}) {
  if (input.state === "mixed") {
    throw new Error(
      "Production welcome block is in a mixed or unknown state; refusing rollback.",
    );
  }
  const audit = await loadReplacementAudit(input.client, input.importId);
  const replacements = audit.replacements as WelcomeReplacement[];
  if (
    replacements.length !== 1 ||
    replacements[0].block_id !== input.row.id ||
    !isDeepStrictEqual(replacements[0].expected_content, PRIOR_CONTENT) ||
    replacements[0].replacement_video_path !==
      input.assets.video.storage_path ||
    replacements[0].replacement_video_sha256 !==
      input.assets.video.checksum_sha256 ||
    replacements[0].replacement_caption_path !==
      input.assets.caption.storage_path ||
    replacements[0].replacement_caption_sha256 !==
      input.assets.caption.checksum_sha256 ||
    replacements[0].replacement_duration_seconds !== APPROVED_DURATION_SECONDS
  ) {
    throw new Error(
      "Production welcome rollback audit is not the reviewed operation.",
    );
  }
  if (
    (input.state === "replacement" &&
      input.catalogSha256 !== audit.replacement_catalog_sha256) ||
    (input.state === "expected" &&
      input.catalogSha256 !== EXPECTED_CATALOG_SHA256)
  ) {
    throw new Error("Production welcome rollback catalog has drifted.");
  }
  await Promise.all([
    verifyStorageObject(
      input.storage,
      "prior welcome video",
      PRIOR_VIDEO,
      input.importId,
    ),
    verifyStorageObject(
      input.storage,
      "prior welcome caption",
      PRIOR_CAPTION,
      input.importId,
    ),
    verifyStorageObject(
      input.storage,
      "replacement welcome video",
      manifestStorageIdentity(input.assets.video),
      input.importId,
    ),
    verifyStorageObject(
      input.storage,
      "replacement welcome caption",
      manifestStorageIdentity(input.assets.caption),
      input.importId,
    ),
  ]);
  console.log(
    JSON.stringify(
      {
        phase:
          input.state === "expected"
            ? "released_welcome_video_already_rolled_back"
            : "released_welcome_video_rollback_plan",
        import_id: input.importId,
        replacement_catalog_sha256: audit.replacement_catalog_sha256,
        restored_catalog_sha256: EXPECTED_CATALOG_SHA256,
        retained_replacement_paths: {
          video: input.assets.video.storage_path,
          caption: input.assets.caption.storage_path,
        },
        execute: input.options.execute,
      },
      null,
      2,
    ),
  );
  if (!input.options.execute) return;
  assertExecutionConfirmation(input.options, input.importId);
  const rollback = await input.client.rpc(
    "fn_rollback_released_imported_welcome_video",
    {
      p_import_id: input.importId,
      p_database_payload_sha256: audit.database_payload_sha256,
      p_client_payload_sha256: audit.client_payload_sha256,
      p_approval_evidence_sha256: audit.approval_evidence_sha256,
      p_expected_replacement_catalog_sha256: audit.replacement_catalog_sha256,
    },
  );
  if (rollback.error) {
    throw new Error(
      `Welcome replacement rollback failed: ${rollback.error.message}`,
    );
  }
  const result = rollback.data as JsonObject | null;
  const expectedStatus =
    input.state === "expected" ? "already_rolled_back" : "rolled_back";
  if (
    result?.status !== expectedStatus ||
    result.catalog_sha256 !== EXPECTED_CATALOG_SHA256
  ) {
    throw new Error(
      "Welcome replacement rollback returned an invalid receipt.",
    );
  }
  const persisted = await loadLiveWelcomeBlock(input.client, input.importId);
  const restoredCatalogSha256 = await loadCatalogSha256(
    input.client,
    input.importId,
  );
  if (
    !isDeepStrictEqual(persisted.content, PRIOR_CONTENT) ||
    restoredCatalogSha256 !== EXPECTED_CATALOG_SHA256
  ) {
    throw new Error(
      "Welcome replacement rollback did not restore the exact prior release.",
    );
  }
  const rollbackAudit = await input.client
    .from("content_import_welcome_video_rollback_records")
    .select(
      "replacement_record_id,import_id,replacement_catalog_sha256,restored_catalog_sha256,database_payload_sha256,client_payload_sha256,approval_evidence_sha256",
    )
    .eq("replacement_record_id", audit.id)
    .eq("database_payload_sha256", audit.database_payload_sha256)
    .limit(2);
  if (
    rollbackAudit.error ||
    rollbackAudit.data.length !== 1 ||
    rollbackAudit.data[0].import_id !== input.importId ||
    rollbackAudit.data[0].replacement_catalog_sha256 !==
      audit.replacement_catalog_sha256 ||
    rollbackAudit.data[0].restored_catalog_sha256 !== EXPECTED_CATALOG_SHA256
  ) {
    throw new Error(
      "Welcome replacement rollback receipt is missing or drifted.",
    );
  }
}

async function loadTargetAssets(options: Options) {
  const [manifestBytes, evidenceBytes] = await Promise.all([
    readFile(resolve(options.manifestPath)),
    readFile(resolve(options.evidencePath)),
  ]);
  const validated = validateCourseManifest(
    JSON.parse(manifestBytes.toString("utf8")) as unknown,
    { gate: "release" },
  );
  if (!validated.ok) {
    throw new Error(validated.errors.map((error) => `- ${error}`).join("\n"));
  }
  const plan = buildImportPlan(validated.value);
  if (plan.importId !== EXPECTED_IMPORT_ID) {
    throw new Error(
      `Welcome replacement is restricted to ${EXPECTED_IMPORT_ID}.`,
    );
  }
  const assets = {
    video: requireApprovedAsset(plan.assets, VIDEO_KEY, "video"),
    caption: requireApprovedAsset(plan.assets, CAPTION_KEY, "caption"),
  };
  assertApprovedIdentity(assets);
  assertEvidence(evidenceBytes.toString("utf8"), assets);
  return { importId: plan.importId, assets, evidenceBytes };
}

function requireApprovedAsset(
  assets: CourseImportAsset[],
  sourceKey: string,
  kind: CourseImportAsset["kind"],
) {
  const asset = assets.find((candidate) => candidate.source_key === sourceKey);
  if (!asset) throw new Error(`${sourceKey} is missing from the manifest.`);
  if (
    asset.kind !== kind ||
    asset.approval_status !== "approved" ||
    !asset.checksum_sha256 ||
    !Number.isSafeInteger(asset.size_bytes) ||
    asset.size_bytes === null ||
    asset.size_bytes < 1
  ) {
    throw new Error(`${sourceKey} is not an exact approved ${kind} asset.`);
  }
  return asset as CourseImportAsset & {
    checksum_sha256: string;
    size_bytes: number;
  };
}

function assertApprovedIdentity(assets: TargetAssets) {
  if (
    assets.video.checksum_sha256 !== APPROVED_VIDEO.sha256 ||
    assets.video.size_bytes !== APPROVED_VIDEO.size ||
    assets.video.mime_type !== "video/mp4" ||
    assets.caption.checksum_sha256 !== APPROVED_CAPTION.sha256 ||
    assets.caption.size_bytes !== APPROVED_CAPTION.size ||
    assets.caption.mime_type !== "text/vtt"
  ) {
    throw new Error(
      "Manifest does not identify the approved Video Zero master and caption.",
    );
  }
}

function assertEvidence(text: string, assets: TargetAssets) {
  for (const required of [
    "User approval: Jarrad Henry, 2026-07-30",
    assets.video.checksum_sha256,
    assets.caption.checksum_sha256,
  ]) {
    if (!text.includes(required)) {
      throw new Error(
        "Video Zero approval evidence does not match the approved assets.",
      );
    }
  }
}

async function loadLiveWelcomeBlock(client: SupabaseClient, importId: string) {
  const { data, error } = await client
    .from("content_blocks")
    .select("id,content,lesson_id,lessons(id,content_import_id)")
    .eq("id", EXPECTED_BLOCK_ID)
    .eq("block_type", "video")
    .single();
  if (error)
    throw new Error(`Production welcome preflight failed: ${error.message}`);
  const row = data as unknown as VideoRow;
  if (
    row.id !== EXPECTED_BLOCK_ID ||
    row.lessons?.content_import_id !== importId
  ) {
    throw new Error(
      "Exact released welcome video block ownership could not be proven.",
    );
  }
  return row;
}

function classifyState(content: JsonObject, assets: TargetAssets) {
  if (isDeepStrictEqual(content, PRIOR_CONTENT)) return "expected" as const;
  if (
    isDeepStrictEqual(content, {
      ...PRIOR_CONTENT,
      file_path: assets.video.storage_path,
      caption_path: assets.caption.storage_path,
      duration_seconds: APPROVED_DURATION_SECONDS,
    })
  ) {
    return "replacement" as const;
  }
  return "mixed" as const;
}

function buildReplacement(
  row: VideoRow,
  assets: TargetAssets,
): WelcomeReplacement {
  return {
    block_id: row.id,
    video_asset_key: VIDEO_KEY,
    caption_asset_key: CAPTION_KEY,
    expected_content: row.content,
    expected_video_path: PRIOR_VIDEO.path,
    expected_video_sha256: PRIOR_VIDEO.sha256,
    expected_video_size_bytes: PRIOR_VIDEO.size,
    expected_video_mime_type: PRIOR_VIDEO.mimeType,
    expected_caption_path: PRIOR_CAPTION.path,
    expected_caption_sha256: PRIOR_CAPTION.sha256,
    expected_caption_size_bytes: PRIOR_CAPTION.size,
    expected_caption_mime_type: PRIOR_CAPTION.mimeType,
    expected_duration_seconds: PRIOR_DURATION_SECONDS,
    replacement_video_path: assets.video.storage_path,
    replacement_video_sha256: assets.video.checksum_sha256,
    replacement_video_size_bytes: assets.video.size_bytes,
    replacement_video_mime_type: assets.video.mime_type,
    replacement_caption_path: assets.caption.storage_path,
    replacement_caption_sha256: assets.caption.checksum_sha256,
    replacement_caption_size_bytes: assets.caption.size_bytes,
    replacement_caption_mime_type: assets.caption.mime_type,
    replacement_duration_seconds: APPROVED_DURATION_SECONDS,
  };
}

async function replayExisting(input: {
  client: SupabaseClient;
  storage: CourseImportUploadBucket;
  importId: string;
  row: VideoRow;
  assets: TargetAssets;
  catalogSha256: string;
  options: Options;
}) {
  const audit = await input.client
    .from("content_import_welcome_video_replacement_records")
    .select(
      "replacements,client_payload_sha256,approval_evidence_sha256,replacement_catalog_sha256",
    )
    .eq("import_id", input.importId)
    .order("replaced_at", { ascending: false })
    .limit(1)
    .single();
  if (audit.error || !audit.data) {
    throw new Error(
      `Production welcome replacement audit could not be read: ${audit.error?.message ?? "missing record"}.`,
    );
  }
  const replacements = audit.data.replacements as WelcomeReplacement[];
  if (
    replacements.length !== 1 ||
    replacements[0].block_id !== input.row.id ||
    replacements[0].replacement_video_path !==
      input.assets.video.storage_path ||
    replacements[0].replacement_video_sha256 !==
      input.assets.video.checksum_sha256 ||
    replacements[0].replacement_caption_path !==
      input.assets.caption.storage_path ||
    replacements[0].replacement_caption_sha256 !==
      input.assets.caption.checksum_sha256 ||
    replacements[0].replacement_duration_seconds !==
      APPROVED_DURATION_SECONDS ||
    audit.data.replacement_catalog_sha256 !== input.catalogSha256 ||
    audit.data.client_payload_sha256 !== EXPECTED_CLIENT_PAYLOAD_SHA256 ||
    audit.data.approval_evidence_sha256 !== APPROVAL_EVIDENCE_SHA256
  ) {
    throw new Error("Production welcome replacement audit has drifted.");
  }
  await verifyStorageObject(
    input.storage,
    "prior welcome video",
    PRIOR_VIDEO,
    input.importId,
  );
  await verifyStorageObject(
    input.storage,
    "prior welcome caption",
    PRIOR_CAPTION,
    input.importId,
  );
  await verifyStorageObject(
    input.storage,
    "replacement welcome video",
    manifestStorageIdentity(input.assets.video),
    input.importId,
  );
  await verifyStorageObject(
    input.storage,
    "replacement welcome caption",
    manifestStorageIdentity(input.assets.caption),
    input.importId,
  );
  console.log(
    JSON.stringify(
      {
        phase: "released_welcome_video_already_replaced",
        import_id: input.importId,
        catalog_sha256: input.catalogSha256,
        execute: input.options.execute,
      },
      null,
      2,
    ),
  );
  if (!input.options.execute) return;
  assertExecutionConfirmation(input.options, input.importId);
  const replay = await input.client.rpc(
    "fn_replace_released_imported_welcome_video",
    {
      p_import_id: input.importId,
      p_replacements: replacements,
      p_client_payload_sha256: audit.data.client_payload_sha256,
      p_approval_evidence_sha256: audit.data.approval_evidence_sha256,
      p_expected_catalog_sha256: input.catalogSha256,
    },
  );
  if (replay.error) {
    throw new Error(
      `Welcome replacement replay failed: ${replay.error.message}`,
    );
  }
  const result = replay.data as JsonObject | null;
  if (result?.status !== "already_replaced") {
    throw new Error("Welcome replacement replay returned an invalid status.");
  }
}

async function verifyPersistedBlock(
  client: SupabaseClient,
  replacement: WelcomeReplacement,
) {
  const { data, error } = await client
    .from("content_blocks")
    .select("id,content")
    .eq("id", replacement.block_id)
    .single();
  if (error || !data) {
    throw new Error(
      `Welcome replacement persistence verification failed: ${error?.message ?? "missing row"}.`,
    );
  }
  const expected = {
    ...replacement.expected_content,
    file_path: replacement.replacement_video_path,
    caption_path: replacement.replacement_caption_path,
    duration_seconds: replacement.replacement_duration_seconds,
  };
  if (!isDeepStrictEqual(data.content, expected)) {
    throw new Error(
      "Welcome replacement changed fields beyond the exact video, caption, and duration fields.",
    );
  }
}

async function loadCatalogSha256(client: SupabaseClient, importId: string) {
  const catalog = await client.rpc("fn_course_import_catalog_sha256", {
    p_import_id: importId,
  });
  if (catalog.error) {
    throw new Error(
      `Production catalog preflight failed: ${catalog.error.message}.`,
    );
  }
  if (
    typeof catalog.data !== "string" ||
    !/^[0-9a-f]{64}$/.test(catalog.data)
  ) {
    throw new Error(
      "Production catalog preflight returned an invalid checksum.",
    );
  }
  return catalog.data;
}

function manifestStorageIdentity(
  asset: CourseImportAsset & { checksum_sha256: string; size_bytes: number },
) {
  return {
    path: asset.storage_path,
    sha256: asset.checksum_sha256,
    size: asset.size_bytes,
    mimeType: asset.mime_type,
  };
}

async function verifyStorageObject(
  storage: CourseImportUploadBucket,
  label: string,
  expected: { path: string; sha256: string; size: number; mimeType: string },
  importId: string,
) {
  const result = await storage.info(expected.path);
  if (result.error || !result.data) {
    throw new Error(
      `${label} object could not be verified: ${result.error?.message ?? "missing object"}.`,
    );
  }
  const info = result.data as StorageInfo;
  const metadata = Object.assign({}, info.metadata, info.user_metadata);
  const storedImportId =
    metadata.course_import_id ??
    metadata.courseImportId ??
    metadata["course-import-id"];
  const storedMime =
    metadata.mimetype ?? metadata.contentType ?? metadata.content_type;
  const mimeMatches =
    typeof storedMime === "string" && storedMime.startsWith(expected.mimeType);
  if (
    info.size !== expected.size ||
    metadata.sha256 !== expected.sha256 ||
    storedImportId !== importId ||
    !mimeMatches
  ) {
    throw new Error(`${label} object metadata does not match exactly.`);
  }
  const problems = await findRemoteAssetProblems(storage, [
    {
      source_key: label,
      kind: expected.mimeType === "video/mp4" ? "video" : "caption",
      local_path: expected.path,
      storage_path: expected.path,
      mime_type: expected.mimeType,
      size_bytes: expected.size,
      checksum_sha256: expected.sha256,
      approval_status: "approved",
    },
  ]);
  if (problems.length > 0) {
    throw new Error(
      `${label} object bytes do not match exactly: ${problems
        .map((problem) => problem.problem)
        .join(", ")}.`,
    );
  }
}

async function inspectReplacementStorageObject(
  storage: CourseImportUploadBucket,
  label: string,
  expected: { path: string; sha256: string; size: number; mimeType: string },
  importId: string,
) {
  const result = await storage.info(expected.path);
  if (result.data) {
    await verifyStorageObject(storage, label, expected, importId);
    return "verified_existing" as const;
  }
  if (isExplicitNotFound(result.error)) return "pending_upload" as const;
  throw new Error(
    `${label} absence could not be proven: ${result.error?.message ?? "empty response"}.`,
  );
}

function isExplicitNotFound(error: RemoteStorageError | null) {
  if (!error) return false;
  const status = error.statusCode ?? error.status;
  return status === 404 || status === "404";
}

function assertExecutionConfirmation(options: Options, importId: string) {
  if (
    !options.execute ||
    !options.allowProduction ||
    options.confirm !== importId
  ) {
    throw new Error(
      `Execution requires --execute --allow-production --confirm=${importId}.`,
    );
  }
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function value(args: string[], prefix: string) {
  return args
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
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
