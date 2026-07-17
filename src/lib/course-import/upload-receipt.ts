import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CourseImportAsset } from "./manifest";

export type CourseImportScope = "canary" | "full";
export type CourseImportEnvironment = "test" | "production";

export type UploadReceiptExpectation = {
  import_id: string;
  scope: CourseImportScope;
  environment: CourseImportEnvironment;
  environment_url: string;
  manifest_sha256: string;
  approved_assets_sha256: string;
  approved_asset_count: number;
};

type UploadReceiptPayload = UploadReceiptExpectation & {
  schema_version: 1;
  status: "complete";
  verified_at: string;
};

export type CompletedUploadReceipt = UploadReceiptPayload & {
  receipt_sha256: string;
};

export function buildUploadReceiptExpectation(options: {
  manifestBytes: string | Buffer;
  importId: string;
  scope: CourseImportScope;
  environment: CourseImportEnvironment;
  environmentUrl: string;
  assets: CourseImportAsset[];
}): UploadReceiptExpectation {
  const approvedAssets = options.assets
    .filter((asset) => asset.approval_status === "approved")
    .map((asset) => ({
      source_key: asset.source_key,
      storage_path: asset.storage_path,
      size_bytes: asset.size_bytes,
      checksum_sha256: asset.checksum_sha256,
      mime_type: asset.mime_type,
    }))
    .sort((left, right) => left.source_key.localeCompare(right.source_key));

  return {
    import_id: options.importId,
    scope: options.scope,
    environment: options.environment,
    environment_url: new URL(options.environmentUrl).origin,
    manifest_sha256: sha256(options.manifestBytes),
    approved_assets_sha256: sha256(stableJson(approvedAssets)),
    approved_asset_count: approvedAssets.length,
  };
}

export function uploadReceiptPath(
  stateRoot: string,
  expectation: Pick<
    UploadReceiptExpectation,
    "import_id" | "scope" | "environment"
  >,
) {
  return resolve(
    stateRoot,
    "upload-receipts",
    `${expectation.import_id}.${expectation.scope}.${expectation.environment}.json`,
  );
}

export async function writeCompletedUploadReceipt(
  path: string,
  expectation: UploadReceiptExpectation,
  verifiedAt = new Date().toISOString(),
): Promise<CompletedUploadReceipt> {
  const payload: UploadReceiptPayload = {
    schema_version: 1,
    status: "complete",
    ...expectation,
    verified_at: verifiedAt,
  };
  const receipt: CompletedUploadReceipt = {
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

export async function invalidateUploadReceipt(path: string): Promise<void> {
  await rm(path, { force: true });
}

export async function assertCompletedUploadReceipt(
  path: string,
  expectation: UploadReceiptExpectation,
): Promise<CompletedUploadReceipt> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Apply refused: no readable completed upload receipt exists for this exact manifest, scope, and environment (${detail}). Run upload --execute first with the same manifest, scope, environment, and --state-root.`,
    );
  }
  if (!isRecord(parsed)) {
    throw new Error("Apply refused: upload receipt is not an object.");
  }

  const payload: UploadReceiptPayload = {
    schema_version: parsed.schema_version as 1,
    status: parsed.status as "complete",
    import_id: parsed.import_id as string,
    scope: parsed.scope as CourseImportScope,
    environment: parsed.environment as CourseImportEnvironment,
    environment_url: parsed.environment_url as string,
    manifest_sha256: parsed.manifest_sha256 as string,
    approved_assets_sha256: parsed.approved_assets_sha256 as string,
    approved_asset_count: parsed.approved_asset_count as number,
    verified_at: parsed.verified_at as string,
  };
  if (payload.schema_version !== 1 || payload.status !== "complete") {
    throw new Error(
      "Apply refused: upload receipt is incomplete or uses an unsupported schema.",
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.verified_at)
  ) {
    throw new Error(
      "Apply refused: upload receipt has an invalid completion timestamp.",
    );
  }
  if (
    typeof parsed.receipt_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(parsed.receipt_sha256) ||
    parsed.receipt_sha256 !== sha256(stableJson(payload))
  ) {
    throw new Error(
      "Apply refused: upload receipt checksum verification failed.",
    );
  }

  for (const key of Object.keys(expectation) as Array<
    keyof UploadReceiptExpectation
  >) {
    if (payload[key] !== expectation[key]) {
      throw new Error(
        `Apply refused: upload receipt ${key} does not match this exact manifest, scope, and environment. Run upload --execute again with the same inputs.`,
      );
    }
  }
  return parsed as CompletedUploadReceipt;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
