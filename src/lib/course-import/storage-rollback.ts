import type { CourseImportAsset } from "./manifest";
import {
  findRemoteAssetProblems,
  findOptionalRemoteAssetProblems,
  findUnexpectedRemoteAssetPaths,
  type RemoteAssetListingBucket,
  type RemoteStorageError,
} from "./asset-transfer";
import { importStoragePrefix } from "../artwork/paths";

const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageRollbackBucket = RemoteAssetListingBucket & {
  remove?(paths: string[]): Promise<{ data?: unknown; error: RemoteStorageError | null }>;
};

export async function inspectStorageRollbackAssets(options: {
  importId: string;
  assets: CourseImportAsset[];
  optionalRetainedAssets?: CourseImportAsset[];
  bucket: StorageRollbackBucket;
}) {
  const storagePrefix = importStoragePrefix(options.importId);
  if (!storagePrefix) throw new Error("Rollback storage inspection has no canonical import prefix.");
  const optionalRetainedAssets = options.optionalRetainedAssets ?? [];
  const [requiredProblems, optionalProblems, unexpected_storage] = await Promise.all([
    findRemoteAssetProblems(options.bucket, options.assets),
    findOptionalRemoteAssetProblems(options.bucket, optionalRetainedAssets),
    findUnexpectedRemoteAssetPaths(
      options.bucket,
      options.importId,
      storagePrefix,
      [...options.assets, ...optionalRetainedAssets],
    ),
  ]);
  const integrity_problems = [...requiredProblems, ...optionalProblems];
  const pathsWithIntegrityProblems = new Set(integrity_problems.map((problem) => problem.path));
  const manual_review_candidates: Array<{
    source_key: string;
    storage_path: string;
    ownership_token: string;
  }> = [];
  const preserved: Array<{
    source_key: string;
    storage_path: string;
    reason: string;
  }> = [];
  const absent: Array<{ source_key: string; storage_path: string }> = [];

  for (const asset of options.assets) {
    if (asset.approval_status !== "approved") {
      preserved.push({
        source_key: asset.source_key,
        storage_path: asset.storage_path,
        reason: `approval_status_${asset.approval_status}`,
      });
      continue;
    }

    const current = await options.bucket.info(asset.storage_path);
    if (!current.data) {
      if (isExplicitNotFound(current.error)) {
        absent.push({ source_key: asset.source_key, storage_path: asset.storage_path });
      } else {
        preserved.push({
          source_key: asset.source_key,
          storage_path: asset.storage_path,
          reason: `storage_state_uncertain:${current.error?.message ?? "empty response"}`,
        });
      }
      continue;
    }

    const metadata = current.data.metadata ?? {};
    const ownershipToken = metadataValue(
      metadata,
      "courseImportUploadId",
      "course_import_upload_id",
    );
    const owned =
      metadataValue(metadata, "courseImportId", "course_import_id") === options.importId &&
      typeof ownershipToken === "string" &&
      UPLOAD_ID_PATTERN.test(ownershipToken) &&
      current.data.size === asset.size_bytes &&
      metadata.sha256 === asset.checksum_sha256 &&
      !pathsWithIntegrityProblems.has(asset.storage_path);

    if (owned) {
      manual_review_candidates.push({
        source_key: asset.source_key,
        storage_path: asset.storage_path,
        ownership_token: ownershipToken,
      });
    } else {
      preserved.push({
        source_key: asset.source_key,
        storage_path: asset.storage_path,
        reason: "import_ownership_or_integrity_unproven",
      });
    }
  }

  const absentPaths = new Set(absent.map((asset) => asset.storage_path));
  const unresolved_integrity_problems = integrity_problems.filter(
    (problem) => !absentPaths.has(problem.path),
  );
  const closureIsExact =
    unexpected_storage.length === 0 && unresolved_integrity_problems.length === 0;

  return {
    schema_version: 1 as const,
    import_id: options.importId,
    automatic_deletes: [] as string[],
    evidence_semantics: "advisory_non_deletion_authorization" as const,
    manual_review_candidates,
    preserved,
    absent,
    storage_prefix: storagePrefix,
    integrity_problems,
    unresolved_integrity_problems,
    unexpected_storage,
    closure_status: closureIsExact ? "exact" as const : "blocked" as const,
    message:
      "Storage objects were preserved because the Storage API has no conditional delete. Review candidates are advisory only and never authorize deletion; re-verify exact bytes and ownership immediately before any separately approved cleanup.",
  };
}

export function assertStorageRollbackInspectionClean(
  report: Awaited<ReturnType<typeof inspectStorageRollbackAssets>>,
) {
  if (report.unexpected_storage.length > 0 || report.unresolved_integrity_problems.length > 0) {
    throw new Error(
      "Storage rollback inspection could not prove exact prefix closure. " +
      `Unexpected objects: ${report.unexpected_storage.join(", ") || "none"}. ` +
      `Unresolved integrity problems: ${report.unresolved_integrity_problems.map((problem) => `${problem.path} (${problem.problem})`).join(", ") || "none"}.`,
    );
  }
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
