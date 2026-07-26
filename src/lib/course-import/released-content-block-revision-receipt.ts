import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CourseImportAsset } from "./manifest";
import {
  RELEASED_CONTENT_BLOCK_REVISION,
  selectReleasedContentBlockRevisionGuideAssets,
  type ReleasedContentBlockMutation,
} from "./released-content-block-revision";
import type { CourseImportEnvironment } from "./upload-receipt";

const RECEIPT_TYPE =
  "released_content_block_revision_assets_v1" as const;

export type ReleasedContentBlockRevisionAssetReceiptExpectation = {
  import_id: string;
  operation: "released_content_blocks_v1";
  environment: CourseImportEnvironment;
  environment_url: string;
  target_manifest_sha256: string;
  client_payload_sha256: string;
  approved_assets_sha256: string;
  approved_asset_count: 19;
};

type ReleasedContentBlockRevisionAssetReceiptPayload =
  ReleasedContentBlockRevisionAssetReceiptExpectation & {
    schema_version: 1;
    receipt_type: typeof RECEIPT_TYPE;
    status: "complete";
    verified_at: string;
  };

export type CompletedReleasedContentBlockRevisionAssetReceipt =
  ReleasedContentBlockRevisionAssetReceiptPayload & {
    receipt_sha256: string;
  };

export function buildReleasedContentBlockRevisionAssetReceiptExpectation(
  options: {
    targetManifest: Buffer;
    importId: string;
    clientPayloadSha256: string;
    environment: CourseImportEnvironment;
    environmentUrl: string;
    guideAssets: CourseImportAsset[];
    mutations: ReleasedContentBlockMutation[];
  },
): ReleasedContentBlockRevisionAssetReceiptExpectation {
  const targetManifestSha256 = sha256(options.targetManifest);
  if (
    options.importId !== RELEASED_CONTENT_BLOCK_REVISION.importId ||
    targetManifestSha256 !==
      RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256 ||
    options.clientPayloadSha256 !==
      RELEASED_CONTENT_BLOCK_REVISION.expectedClientPayloadSha256
  ) {
    throw new Error(
      "Released content revision asset receipt identity or checksum pin mismatch.",
    );
  }
  const exactGuideAssets = selectReleasedContentBlockRevisionGuideAssets(
    options.guideAssets,
    options.mutations,
  );
  if (options.guideAssets.length !== exactGuideAssets.length) {
    throw new Error(
      "Released content revision asset receipt accepts only the exact 19 guides.",
    );
  }
  const approvedAssets = exactGuideAssets
    .map((asset) => {
      if (
        asset.approval_status !== "approved" ||
        asset.kind !== "pdf" ||
        asset.mime_type !== "application/pdf" ||
        asset.size_bytes === null ||
        !Number.isSafeInteger(asset.size_bytes) ||
        asset.size_bytes < 1 ||
        !asset.checksum_sha256 ||
        !/^[0-9a-f]{64}$/.test(asset.checksum_sha256) ||
        !asset.storage_path.includes(asset.checksum_sha256)
      ) {
        throw new Error(
          `Released content revision asset receipt rejected ${asset.source_key}.`,
        );
      }
      return {
        source_key: asset.source_key,
        storage_path: asset.storage_path,
        size_bytes: asset.size_bytes,
        checksum_sha256: asset.checksum_sha256,
        mime_type: asset.mime_type,
      };
    })
    .sort((left, right) => left.source_key.localeCompare(right.source_key));

  return {
    import_id: options.importId,
    operation: "released_content_blocks_v1",
    environment: options.environment,
    environment_url: new URL(options.environmentUrl).origin,
    target_manifest_sha256: targetManifestSha256,
    client_payload_sha256: options.clientPayloadSha256,
    approved_assets_sha256: sha256(stableJson(approvedAssets)),
    approved_asset_count: 19,
  };
}

export function releasedContentBlockRevisionAssetReceiptPath(
  stateRoot: string,
  expectation: Pick<
    ReleasedContentBlockRevisionAssetReceiptExpectation,
    | "import_id"
    | "target_manifest_sha256"
    | "client_payload_sha256"
    | "environment"
  >,
) {
  return resolve(
    stateRoot,
    "released-content-block-revision-receipts",
    [
      expectation.import_id,
      expectation.target_manifest_sha256,
      expectation.client_payload_sha256,
      "guides-v1",
      expectation.environment,
      "json",
    ].join("."),
  );
}

export async function writeCompletedReleasedContentBlockRevisionAssetReceipt(
  path: string,
  expectation: ReleasedContentBlockRevisionAssetReceiptExpectation,
  verifiedAt = new Date().toISOString(),
) {
  const payload: ReleasedContentBlockRevisionAssetReceiptPayload = {
    schema_version: 1,
    receipt_type: RECEIPT_TYPE,
    status: "complete",
    ...expectation,
    verified_at: verifiedAt,
  };
  const receipt: CompletedReleasedContentBlockRevisionAssetReceipt = {
    ...payload,
    receipt_sha256: sha256(stableJson(payload)),
  };
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
  return receipt;
}

export async function invalidateReleasedContentBlockRevisionAssetReceipt(
  path: string,
) {
  await rm(path, { force: true });
}

export async function assertCompletedReleasedContentBlockRevisionAssetReceipt(
  path: string,
  expectation: ReleasedContentBlockRevisionAssetReceiptExpectation,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Released content revision apply refused: no readable exact 19-guide preparation receipt exists (${errorMessage(error)}). Run the revision prepare-assets command first with the same manifest, environment, and --state-root.`,
    );
  }
  if (!isRecord(parsed)) {
    throw new Error(
      "Released content revision apply refused: asset receipt is not an object.",
    );
  }
  const receiptKeys = [
    "approved_asset_count",
    "approved_assets_sha256",
    "client_payload_sha256",
    "environment",
    "environment_url",
    "import_id",
    "operation",
    "receipt_sha256",
    "receipt_type",
    "schema_version",
    "status",
    "target_manifest_sha256",
    "verified_at",
  ];
  if (
    Object.keys(parsed).length !== receiptKeys.length ||
    !receiptKeys.every((key) => Object.hasOwn(parsed, key))
  ) {
    throw new Error(
      "Released content revision apply refused: asset receipt fields are not exact.",
    );
  }
  if (parsed.receipt_type !== RECEIPT_TYPE) {
    throw new Error(
      "Released content revision apply refused: asset receipt has the wrong receipt_type.",
    );
  }
  const payload: ReleasedContentBlockRevisionAssetReceiptPayload = {
    schema_version: parsed.schema_version as 1,
    receipt_type: parsed.receipt_type,
    status: parsed.status as "complete",
    import_id: parsed.import_id as string,
    operation: parsed.operation as "released_content_blocks_v1",
    environment: parsed.environment as CourseImportEnvironment,
    environment_url: parsed.environment_url as string,
    target_manifest_sha256: parsed.target_manifest_sha256 as string,
    client_payload_sha256: parsed.client_payload_sha256 as string,
    approved_assets_sha256: parsed.approved_assets_sha256 as string,
    approved_asset_count: parsed.approved_asset_count as 19,
    verified_at: parsed.verified_at as string,
  };
  if (payload.schema_version !== 1 || payload.status !== "complete") {
    throw new Error(
      "Released content revision apply refused: asset receipt is incomplete or uses an unsupported schema.",
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      payload.verified_at,
    )
  ) {
    throw new Error(
      "Released content revision apply refused: asset receipt has an invalid completion timestamp.",
    );
  }
  if (
    typeof parsed.receipt_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(parsed.receipt_sha256) ||
    parsed.receipt_sha256 !== sha256(stableJson(payload))
  ) {
    throw new Error(
      "Released content revision apply refused: asset receipt checksum verification failed.",
    );
  }
  for (
    const key of Object.keys(expectation) as Array<
      keyof ReleasedContentBlockRevisionAssetReceiptExpectation
    >
  ) {
    if (payload[key] !== expectation[key]) {
      throw new Error(
        `Released content revision apply refused: asset receipt ${key} does not match this exact operation.`,
      );
    }
  }
  return parsed as CompletedReleasedContentBlockRevisionAssetReceipt;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    const fields = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
