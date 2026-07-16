import type { CourseImportAsset } from "./manifest";
import type { RemoteStorageError } from "./asset-transfer";

const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageRollbackBucket = {
  info(path: string): Promise<{
    data: { size?: number; metadata?: Record<string, unknown> | null } | null;
    error: RemoteStorageError | null;
  }>;
  remove?(paths: string[]): Promise<{ data?: unknown; error: RemoteStorageError | null }>;
};

export async function inspectStorageRollbackAssets(options: {
  importId: string;
  assets: CourseImportAsset[];
  bucket: StorageRollbackBucket;
}) {
  const manual_cleanup_candidates: Array<{
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
    const ownershipToken = metadata.course_import_upload_id;
    const owned =
      metadata.course_import_id === options.importId &&
      typeof ownershipToken === "string" &&
      UPLOAD_ID_PATTERN.test(ownershipToken) &&
      current.data.size === asset.size_bytes &&
      metadata.sha256 === asset.checksum_sha256;

    if (owned) {
      manual_cleanup_candidates.push({
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

  return {
    schema_version: 1 as const,
    import_id: options.importId,
    automatic_deletes: [] as string[],
    manual_cleanup_candidates,
    preserved,
    absent,
    message:
      "Storage objects were preserved because the Storage API has no conditional delete. Only proven approved objects are listed for separate manual cleanup.",
  };
}

function isExplicitNotFound(error: RemoteStorageError | null) {
  if (!error) return false;
  const status = error.statusCode ?? error.status;
  return status === 404 || status === "404";
}
