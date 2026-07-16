import { createHash } from "node:crypto";

import type { CourseImportAsset } from "./manifest";

export type RemoteAssetProblem = { path: string; problem: string };

type RemoteDownloadResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type RemoteDownloadRequest = PromiseLike<RemoteDownloadResult<Blob>> & {
  asStream?: () => PromiseLike<RemoteDownloadResult<ReadableStream<Uint8Array>>>;
};

export type RemoteAssetBucket = {
  info(path: string): Promise<{
    data: { size?: number; metadata?: Record<string, unknown> | null } | null;
    error: { message: string } | null;
  }>;
  download(path: string): RemoteDownloadRequest;
};

export async function findRemoteAssetProblems(
  bucket: RemoteAssetBucket,
  assets: CourseImportAsset[],
) {
  const problems: RemoteAssetProblem[] = [];
  for (const asset of assets) {
    if (asset.approval_status === "missing") continue;
    const { data, error } = await bucket.info(asset.storage_path);
    if (error || !data) {
      problems.push({ path: asset.storage_path, problem: "missing" });
      continue;
    }

    if (asset.size_bytes !== null && data.size !== asset.size_bytes) {
      problems.push({
        path: asset.storage_path,
        problem: `size ${String(data.size)} does not match ${asset.size_bytes}`,
      });
      continue;
    }
    if (!asset.checksum_sha256) continue;

    if (data.metadata?.sha256 !== asset.checksum_sha256) {
      problems.push({
        path: asset.storage_path,
        problem: "stored SHA-256 metadata does not match",
      });
    }

    let downloaded: RemoteDownloadResult<Blob | ReadableStream<Uint8Array>>;
    try {
      const download = bucket.download(asset.storage_path);
      downloaded = download.asStream ? await download.asStream() : await download;
    } catch (downloadError) {
      problems.push({
        path: asset.storage_path,
        problem: `remote byte verification failed: ${errorMessage(downloadError)}`,
      });
      continue;
    }
    if (downloaded.error || !downloaded.data) {
      problems.push({
        path: asset.storage_path,
        problem: `remote byte verification failed: ${downloaded.error?.message ?? "empty response"}`,
      });
      continue;
    }
    if ((await sha256RemoteBytes(downloaded.data)) !== asset.checksum_sha256) {
      problems.push({
        path: asset.storage_path,
        problem: "remote bytes SHA-256 does not match",
      });
    }
  }
  return problems;
}

async function sha256RemoteBytes(data: Blob | ReadableStream<Uint8Array>) {
  const hash = createHash("sha256");
  const reader = (data instanceof Blob ? data.stream() : data).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
