import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  COURSE_IMPORT_BUCKET,
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "../../src/lib/course-import/asset-upload";
import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import {
  validateCourseManifest,
  type CourseImportAsset,
} from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";

const EXPECTED_IMPORT_ID = "bmh-employee-training-v1";
const TARGET_VIDEO_KEYS = [
  "video-slot-04-humanizing-b",
  "video-slot-10-objection-scripts",
  "video-slot-14-flow",
] as const;
const DEFAULT_LEDGER = "docs/course-production/caption-approvals.json";

type JsonObject = Record<string, unknown>;

type VideoRow = {
  id: string;
  content: JsonObject;
  lesson_id: string;
  lessons: { title: string; content_import_id: string | null } | null;
};

type StorageInfo = {
  size?: number;
  metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type CaptionReplacement = {
  block_id: string;
  caption_asset_key: string;
  expected_content: JsonObject;
  expected_caption_path: string;
  expected_caption_sha256: string;
  expected_size_bytes: number;
  replacement_caption_path: string;
  replacement_caption_sha256: string;
  replacement_size_bytes: number;
};

type CaptionLedger = {
  schema_version?: number;
  status?: string;
  records?: JsonObject[];
};

type CaptionTarget = {
  videoSourceKey: string;
  videoAsset: CourseImportAsset;
  captionAssetKey: string;
  captionAsset: CourseImportAsset;
};

type LiveCaptionTarget = {
  target: CaptionTarget;
  row: VideoRow;
  expectedCaptionPath: string;
  expectedCaptionSha256: string;
};

type CommandOptions = {
  manifestPath: string;
  ledgerPath: string;
  execute: boolean;
  allowProduction: boolean;
  confirm: string | undefined;
  stateRoot: string;
};

async function main() {
  const options = parseCommandOptions(process.argv.slice(2));
  const { plan, targets, ledgerBytes } = await loadApprovedTargets(options);

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertCourseImportEnvironment(url, true);
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const liveTargets = await loadLiveTargets(client, plan.importId, targets);
  const alreadyReplaced = assertUnmixedReplacementState(liveTargets);

  const catalogSha256 = await loadCatalogSha256(client, plan.importId);

  if (alreadyReplaced) {
    await replayExistingReplacement({
      client,
      importId: plan.importId,
      liveTargets,
      catalogSha256,
      options,
    });
    return;
  }

  const storage = client.storage.from(COURSE_IMPORT_BUCKET);
  const replacements = await buildReplacements(
    storage,
    liveTargets,
    plan.importId,
  );
  const clientPayloadSha256 = sha256(Buffer.from(JSON.stringify(replacements)));
  const approvalEvidenceSha256 = sha256(ledgerBytes);
  console.log(
    JSON.stringify(
      {
        phase: "released_video_caption_replacement_plan",
        import_id: plan.importId,
        replacement_count: replacements.length,
        expected_catalog_sha256: catalogSha256,
        client_payload_sha256: clientPayloadSha256,
        approval_evidence_sha256: approvalEvidenceSha256,
        replacements,
        execute: options.execute,
      },
      null,
      2,
    ),
  );
  if (!options.execute) return;
  assertExecutionConfirmation({
    allowProduction: options.allowProduction,
    confirm: options.confirm,
    importId: plan.importId,
  });

  await executeReplacement({
    client,
    storage,
    url,
    serviceKey,
    importId: plan.importId,
    targets,
    replacements,
    clientPayloadSha256,
    approvalEvidenceSha256,
    catalogSha256,
    stateRoot: options.stateRoot,
  });
}

function assertUnmixedReplacementState(liveTargets: LiveCaptionTarget[]) {
  const replacedCount = liveTargets.filter(
    ({ target, expectedCaptionSha256 }) =>
      expectedCaptionSha256 === target.captionAsset.checksum_sha256,
  ).length;
  if (replacedCount === 0) return false;
  if (replacedCount === liveTargets.length) return true;
  throw new Error(
    `Production caption state is partially replaced (${replacedCount}/${liveTargets.length}); refusing a mixed retry.`,
  );
}

async function executeReplacement(input: {
  client: SupabaseClient;
  storage: ReturnType<SupabaseClient["storage"]["from"]>;
  url: string;
  serviceKey: string;
  importId: string;
  targets: CaptionTarget[];
  replacements: CaptionReplacement[];
  clientPayloadSha256: string;
  approvalEvidenceSha256: string;
  catalogSha256: string;
  stateRoot: string;
}) {
  await uploadApprovedAssets({
    endpoint: resumableEndpoint(input.url),
    serviceKey: input.serviceKey,
    importId: input.importId,
    sourceRoot: process.cwd(),
    assets: input.targets.map((target) => target.captionAsset),
    bucket: input.storage as unknown as CourseImportUploadBucket,
    stateRoot: input.stateRoot,
  });
  const replaced = await input.client.rpc(
    "fn_replace_released_imported_video_captions",
    {
      p_import_id: input.importId,
      p_replacements: input.replacements,
      p_client_payload_sha256: input.clientPayloadSha256,
      p_approval_evidence_sha256: input.approvalEvidenceSha256,
      p_expected_catalog_sha256: input.catalogSha256,
    },
  );
  if (replaced.error) {
    throw new Error(
      `Released caption replacement failed: ${replaced.error.message}`,
    );
  }
  await verifyReplacementRows(input.client, input.replacements);
  console.log(
    JSON.stringify(
      {
        phase: "released_video_captions_replaced",
        result: replaced.data,
        retained_rollback_paths: input.replacements.map(
          (replacement) => replacement.expected_caption_path,
        ),
      },
      null,
      2,
    ),
  );
}

async function verifyReplacementRows(
  client: SupabaseClient,
  replacements: CaptionReplacement[],
) {
  const { data, error } = await client
    .from("content_blocks")
    .select("id,content")
    .in(
      "id",
      replacements.map((replacement) => replacement.block_id),
    );
  if (error) {
    throw new Error(
      `Caption replacement verification failed: ${error.message}`,
    );
  }
  const rows = data as { id: string; content: JsonObject }[];
  for (const replacement of replacements) {
    const row = rows.find((candidate) => candidate.id === replacement.block_id);
    if (row?.content.caption_path !== replacement.replacement_caption_path) {
      throw new Error(
        `${replacement.caption_asset_key} did not persist its exact replacement path.`,
      );
    }
  }
}

function parseCommandOptions(args: string[]): CommandOptions {
  const manifestPath = args[0];
  if (!manifestPath) {
    throw new Error(
      "Usage: npm run course:captions:replace -- <manifest.json> [--execute --allow-production --confirm=bmh-employee-training-v1] [--ledger=<path>] [--state-root=<path>]",
    );
  }
  return {
    manifestPath,
    ledgerPath: value(args, "--ledger=") ?? DEFAULT_LEDGER,
    execute: args.includes("--execute"),
    allowProduction: args.includes("--allow-production"),
    confirm: value(args, "--confirm="),
    stateRoot: resolve(
      value(args, "--state-root=") ??
        join(process.cwd(), ".course-import-state"),
    ),
  };
}

async function loadApprovedTargets(options: CommandOptions) {
  const [manifestBytes, ledgerBytes] = await Promise.all([
    readFile(resolve(options.manifestPath)),
    readFile(resolve(options.ledgerPath)),
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
      `Caption replacement is restricted to ${EXPECTED_IMPORT_ID}.`,
    );
  }
  const ledger = JSON.parse(ledgerBytes.toString("utf8")) as CaptionLedger;
  assertCaptionLedger(ledger);
  return {
    plan,
    targets: TARGET_VIDEO_KEYS.map((key) =>
      buildCaptionTarget(plan.assets, ledger, key),
    ),
    ledgerBytes,
  };
}

function assertCaptionLedger(
  ledger: CaptionLedger,
): asserts ledger is CaptionLedger & { records: JsonObject[] } {
  if (
    ledger.schema_version !== 1 ||
    ledger.status !== "active" ||
    !Array.isArray(ledger.records)
  ) {
    throw new Error("Caption approval ledger is missing or invalid.");
  }
}

function buildCaptionTarget(
  assets: CourseImportAsset[],
  ledger: CaptionLedger & { records: JsonObject[] },
  videoSourceKey: string,
): CaptionTarget {
  const videoAsset = requireAsset(assets, videoSourceKey);
  const captionAssetKey = `caption-${videoSourceKey}`;
  const captionAsset = requireAsset(assets, captionAssetKey);
  assertApprovedVideo(videoAsset, videoSourceKey);
  assertApprovedCaption(captionAsset, captionAssetKey);
  assertCaptionIntegrity(captionAsset, captionAssetKey);
  const approvalMatches = ledger.records.filter(
    (record) =>
      record.status === "approved" &&
      record.video_source_key === videoSourceKey &&
      record.video_sha256 === videoAsset.checksum_sha256 &&
      record.caption_sha256 === captionAsset.checksum_sha256,
  );
  if (approvalMatches.length !== 1) {
    throw new Error(
      `${captionAssetKey} does not have exactly one matching approval record.`,
    );
  }
  return { videoSourceKey, videoAsset, captionAssetKey, captionAsset };
}

function requireAsset(assets: CourseImportAsset[], sourceKey: string) {
  const asset = assets.find((candidate) => candidate.source_key === sourceKey);
  if (!asset) throw new Error(`${sourceKey} is missing from the manifest.`);
  return asset;
}

function assertApprovedVideo(
  asset: CourseImportAsset,
  sourceKey: string,
): asserts asset is CourseImportAsset {
  if (asset.kind !== "video") {
    throw new Error(`${sourceKey} is not a manifest video.`);
  }
  if (asset.approval_status !== "approved") {
    throw new Error(`${sourceKey} is not an approved manifest video.`);
  }
}

function assertApprovedCaption(asset: CourseImportAsset, sourceKey: string) {
  if (asset.kind !== "caption") {
    throw new Error(`${sourceKey} is not a manifest caption.`);
  }
  if (asset.mime_type !== "text/vtt") {
    throw new Error(`${sourceKey} is not a VTT caption.`);
  }
  if (asset.approval_status !== "approved") {
    throw new Error(`${sourceKey} is not an approved caption.`);
  }
}

function assertCaptionIntegrity(
  asset: CourseImportAsset,
  sourceKey: string,
): asserts asset is CourseImportAsset & {
  checksum_sha256: string;
  size_bytes: number;
} {
  if (!asset.checksum_sha256) throw new Error(`${sourceKey} has no checksum.`);
  if (asset.size_bytes === null)
    throw new Error(`${sourceKey} has no verified size.`);
}

async function loadLiveTargets(
  client: SupabaseClient,
  importId: string,
  targets: CaptionTarget[],
): Promise<LiveCaptionTarget[]> {
  const { data: rows, error } = await client
    .from("content_blocks")
    .select("id,content,lesson_id,lessons(id,title,content_import_id)")
    .eq("block_type", "video")
    .limit(1000);
  if (error) {
    throw new Error(`Production caption preflight failed: ${error.message}`);
  }
  return targets.map((target) => {
    const matches = (rows as unknown as VideoRow[]).filter(
      (row) =>
        row.lessons?.content_import_id === importId &&
        row.content.file_path === target.videoAsset.storage_path,
    );
    if (matches.length !== 1) {
      throw new Error(
        `${target.videoSourceKey} expected one exact released video block, found ${matches.length}.`,
      );
    }
    const row = matches[0];
    const expectedCaptionPath = row.content.caption_path;
    if (typeof expectedCaptionPath !== "string") {
      throw new Error(
        `${target.videoSourceKey} has no current production caption_path.`,
      );
    }
    return {
      target,
      row,
      expectedCaptionPath,
      expectedCaptionSha256: captionShaFromPath(expectedCaptionPath),
    };
  });
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
  if (typeof catalog.data !== "string") {
    throw new Error("Production catalog preflight returned no checksum.");
  }
  if (!/^[0-9a-f]{64}$/.test(catalog.data)) {
    throw new Error(
      "Production catalog preflight returned an invalid checksum.",
    );
  }
  return catalog.data;
}

async function replayExistingReplacement(input: {
  client: SupabaseClient;
  importId: string;
  liveTargets: LiveCaptionTarget[];
  catalogSha256: string;
  options: CommandOptions;
}) {
  const audit = await loadLatestAuditRecord(input.client, input.importId);
  const replacements = audit.data.replacements as CaptionReplacement[];
  assertAuditMatchesLiveTargets({
    replacements,
    replacementCatalogSha256: audit.data.replacement_catalog_sha256,
    liveTargets: input.liveTargets,
    catalogSha256: input.catalogSha256,
  });
  console.log(
    JSON.stringify(
      {
        phase: "released_video_captions_already_replaced",
        import_id: input.importId,
        replacement_count: replacements.length,
        catalog_sha256: input.catalogSha256,
        execute: input.options.execute,
      },
      null,
      2,
    ),
  );
  if (!input.options.execute) return;
  assertExecutionConfirmation({
    allowProduction: input.options.allowProduction,
    confirm: input.options.confirm,
    importId: input.importId,
  });
  await executeReplay({
    client: input.client,
    importId: input.importId,
    replacements,
    clientPayloadSha256: audit.data.client_payload_sha256,
    approvalEvidenceSha256: audit.data.approval_evidence_sha256,
    catalogSha256: input.catalogSha256,
  });
}

async function loadLatestAuditRecord(client: SupabaseClient, importId: string) {
  const audit = await client
    .from("content_import_video_caption_replacement_records")
    .select(
      "replacements,client_payload_sha256,approval_evidence_sha256,replacement_catalog_sha256",
    )
    .eq("import_id", importId)
    .order("replaced_at", { ascending: false })
    .limit(1)
    .single();
  if (audit.error) {
    throw new Error(
      `Production replacement audit could not be read: ${audit.error.message}.`,
    );
  }
  if (!audit.data) {
    throw new Error("Production replacement audit record is missing.");
  }
  return audit;
}

async function executeReplay(input: {
  client: SupabaseClient;
  importId: string;
  replacements: CaptionReplacement[];
  clientPayloadSha256: unknown;
  approvalEvidenceSha256: unknown;
  catalogSha256: string;
}) {
  const replay = await input.client.rpc(
    "fn_replace_released_imported_video_captions",
    {
      p_import_id: input.importId,
      p_replacements: input.replacements,
      p_client_payload_sha256: input.clientPayloadSha256,
      p_approval_evidence_sha256: input.approvalEvidenceSha256,
      p_expected_catalog_sha256: input.catalogSha256,
    },
  );
  if (replay.error) {
    throw new Error(
      `Caption replacement replay failed: ${replay.error.message}.`,
    );
  }
  const result = replay.data as JsonObject | null;
  if (!result)
    throw new Error("Caption replacement replay returned no result.");
  if (result.status !== "already_replaced") {
    throw new Error("Caption replacement replay returned an invalid status.");
  }
  console.log(
    JSON.stringify(
      {
        phase: "released_video_caption_replacement_replayed",
        result: replay.data,
      },
      null,
      2,
    ),
  );
}

function assertAuditMatchesLiveTargets(input: {
  replacements: CaptionReplacement[];
  replacementCatalogSha256: unknown;
  liveTargets: LiveCaptionTarget[];
  catalogSha256: string;
}) {
  assertAuditShape(input);
  for (const liveTarget of input.liveTargets) {
    const replacement = requireReplacementForLiveTarget(
      input.replacements,
      liveTarget,
    );
    assertReplacementMatchesLiveTarget(replacement, liveTarget);
  }
}

function assertAuditShape(input: {
  replacements: CaptionReplacement[];
  replacementCatalogSha256: unknown;
  liveTargets: LiveCaptionTarget[];
  catalogSha256: string;
}) {
  if (!Array.isArray(input.replacements)) {
    throw new Error("Production replacement audit payload is not an array.");
  }
  if (input.replacements.length !== input.liveTargets.length) {
    throw new Error("Production replacement audit count is incorrect.");
  }
  if (input.replacementCatalogSha256 !== input.catalogSha256) {
    throw new Error("Production replacement audit catalog has drifted.");
  }
}

function requireReplacementForLiveTarget(
  replacements: CaptionReplacement[],
  liveTarget: LiveCaptionTarget,
) {
  const replacement = replacements.find(
    (candidate) => candidate.block_id === liveTarget.row.id,
  );
  if (!replacement) {
    throw new Error("Production replacement audit is missing a target block.");
  }
  return replacement;
}

function assertReplacementMatchesLiveTarget(
  replacement: CaptionReplacement,
  liveTarget: LiveCaptionTarget,
) {
  if (replacement.caption_asset_key !== liveTarget.target.captionAssetKey) {
    throw new Error("Production replacement audit caption key has drifted.");
  }
  if (
    replacement.replacement_caption_path !==
    liveTarget.target.captionAsset.storage_path
  ) {
    throw new Error("Production replacement audit caption path has drifted.");
  }
  if (
    replacement.replacement_caption_sha256 !==
    liveTarget.target.captionAsset.checksum_sha256
  ) {
    throw new Error(
      "Production replacement audit caption checksum has drifted.",
    );
  }
}

async function buildReplacements(
  storage: CourseImportUploadBucket,
  liveTargets: LiveCaptionTarget[],
  importId: string,
) {
  const replacements: CaptionReplacement[] = [];
  for (const liveTarget of liveTargets) {
    replacements.push(await buildReplacement(storage, liveTarget, importId));
  }
  return replacements.sort((left, right) =>
    left.caption_asset_key.localeCompare(right.caption_asset_key),
  );
}

async function buildReplacement(
  storage: CourseImportUploadBucket,
  liveTarget: LiveCaptionTarget,
  importId: string,
): Promise<CaptionReplacement> {
  const { target, row, expectedCaptionPath, expectedCaptionSha256 } =
    liveTarget;
  const currentSize = await loadVerifiedCurrentCaptionSize(
    storage,
    liveTarget,
    importId,
  );
  return {
    block_id: row.id,
    caption_asset_key: target.captionAssetKey,
    expected_content: row.content,
    expected_caption_path: expectedCaptionPath,
    expected_caption_sha256: expectedCaptionSha256,
    expected_size_bytes: currentSize,
    replacement_caption_path: target.captionAsset.storage_path,
    replacement_caption_sha256: target.captionAsset.checksum_sha256 as string,
    replacement_size_bytes: target.captionAsset.size_bytes as number,
  };
}

async function loadVerifiedCurrentCaptionSize(
  storage: CourseImportUploadBucket,
  liveTarget: LiveCaptionTarget,
  importId: string,
) {
  const current = await requireStorageInfo(storage, liveTarget);
  assertStorageIdentity({
    label: `${liveTarget.target.videoSourceKey} current caption`,
    info: current,
    expectedSha256: liveTarget.expectedCaptionSha256,
    expectedImportId: importId,
  });
  assertPositiveStorageSize(current, liveTarget.target.videoSourceKey);
  return current.size as number;
}

async function requireStorageInfo(
  storage: CourseImportUploadBucket,
  liveTarget: LiveCaptionTarget,
) {
  const currentInfo = await storage.info(liveTarget.expectedCaptionPath);
  if (currentInfo.error) {
    throw new Error(
      `${liveTarget.target.videoSourceKey} current caption object could not be verified: ${currentInfo.error.message}.`,
    );
  }
  if (!currentInfo.data) {
    throw new Error(
      `${liveTarget.target.videoSourceKey} current caption object is missing.`,
    );
  }
  return currentInfo.data as StorageInfo;
}

function assertPositiveStorageSize(
  info: StorageInfo,
  sourceKey: string,
): asserts info is StorageInfo & { size: number } {
  if (!Number.isSafeInteger(info.size)) {
    throw new Error(`${sourceKey} current caption size is invalid.`);
  }
  if ((info.size as number) < 1) {
    throw new Error(`${sourceKey} current caption is empty.`);
  }
}

function captionShaFromPath(path: string) {
  const match = path.match(/\.([0-9a-f]{64})\.vtt$/);
  if (!match)
    throw new Error(`Caption path is not checksum-addressed: ${path}`);
  return match[1];
}

function assertStorageIdentity(input: {
  label: string;
  info: StorageInfo;
  expectedSha256: string;
  expectedImportId: string;
}) {
  const metadata = Object.assign(
    {},
    input.info.metadata,
    input.info.user_metadata,
  );
  const sha256Value = metadata.sha256;
  const importId = storageImportId(metadata);
  if (sha256Value !== input.expectedSha256) {
    throw new Error(`${input.label} storage checksum does not match its path.`);
  }
  if (importId !== input.expectedImportId) {
    throw new Error(
      `${input.label} storage metadata does not match its import.`,
    );
  }
}

function storageImportId(metadata: Record<string, unknown>) {
  if (metadata.course_import_id !== undefined) return metadata.course_import_id;
  if (metadata.courseImportId !== undefined) return metadata.courseImportId;
  return metadata["course-import-id"];
}

function assertExecutionConfirmation(input: {
  allowProduction: boolean;
  confirm: string | undefined;
  importId: string;
}) {
  if (!input.allowProduction || input.confirm !== input.importId) {
    throw new Error(
      `Execution requires --allow-production --confirm=${input.importId}.`,
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
