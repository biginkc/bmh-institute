import type { CourseImportAsset } from "./manifest";
import {
  findRemoteAssetProblems,
  type RemoteAssetBucket,
  type RemoteStorageError,
} from "./asset-transfer";

const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReplacedAssetCleanupBucket = RemoteAssetBucket & {
  remove(paths: string[]): Promise<{ data?: unknown; error: RemoteStorageError | null }>;
};

export async function removeExactReplacedAssets(options: {
  importId: string;
  assets: CourseImportAsset[];
  bucket: ReplacedAssetCleanupBucket;
  assertUnreferenced: (storagePath: string) => Promise<void>;
}) {
  const removed: string[] = [];
  const alreadyAbsent: string[] = [];

  for (const asset of options.assets) {
    if (
      asset.approval_status !== "approved"
      || asset.checksum_sha256 === null
      || asset.size_bytes === null
    ) {
      throw new Error(`Replacement cleanup requires exact approved evidence for ${asset.source_key}.`);
    }
    const current = await options.bucket.info(asset.storage_path);
    if (!current.data) {
      if (isExplicitNotFound(current.error)) {
        alreadyAbsent.push(asset.storage_path);
        continue;
      }
      throw new Error(`Replacement cleanup could not prove the state of ${asset.storage_path}: ${current.error?.message ?? "empty response"}.`);
    }

    const metadata = current.data.metadata ?? {};
    const ownershipToken = metadataValue(metadata, "courseImportUploadId", "course_import_upload_id");
    const exactOwnership =
      metadataValue(metadata, "courseImportId", "course_import_id") === options.importId
      && typeof ownershipToken === "string"
      && UPLOAD_ID_PATTERN.test(ownershipToken)
      && current.data.size === asset.size_bytes
      && metadata.sha256 === asset.checksum_sha256;
    if (!exactOwnership) {
      throw new Error(`Replacement cleanup refused because ownership or metadata changed for ${asset.storage_path}.`);
    }
    const problems = await findRemoteAssetProblems(options.bucket, [asset]);
    if (problems.length > 0) {
      throw new Error(`Replacement cleanup refused because exact bytes changed for ${asset.storage_path}: ${problems.map((problem) => problem.problem).join(", ")}.`);
    }

    await options.assertUnreferenced(asset.storage_path);
    const deletion = await options.bucket.remove([asset.storage_path]);
    if (deletion.error) {
      throw new Error(`Replacement cleanup failed for ${asset.storage_path}: ${deletion.error.message}.`);
    }
    const after = await options.bucket.info(asset.storage_path);
    if (after.data || !isExplicitNotFound(after.error)) {
      throw new Error(`Replacement cleanup could not prove deletion of ${asset.storage_path}.`);
    }
    removed.push(asset.storage_path);
  }

  return { removed, alreadyAbsent };
}

function metadataValue(
  metadata: Record<string, unknown>,
  providerKey: string,
  compatibilityKey: string,
) {
  return metadata[providerKey] ?? metadata[compatibilityKey];
}

function isExplicitNotFound(error: RemoteStorageError | null) {
  if (!error) return false;
  const status = error.statusCode ?? error.status;
  return status === 404 || status === "404";
}
