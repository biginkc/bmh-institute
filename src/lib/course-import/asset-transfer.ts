import { createHash } from "node:crypto";

import type { CourseImportAsset } from "./manifest";
import { importStoragePrefix } from "../artwork/paths";

export type RemoteAssetProblem = { path: string; problem: string };
export type RemoteStorageError = {
  message: string;
  statusCode?: string | number;
  status?: string | number;
};

type RemoteDownloadResult<T> = {
  data: T | null;
  error: RemoteStorageError | null;
};

type RemoteDownloadRequest = PromiseLike<RemoteDownloadResult<Blob>> & {
  asStream?: () => PromiseLike<RemoteDownloadResult<ReadableStream<Uint8Array>>>;
};

export type RemoteAssetBucket = {
  info(path: string): Promise<{
    data: { size?: number; metadata?: Record<string, unknown> | null } | null;
    error: RemoteStorageError | null;
  }>;
  download(path: string): RemoteDownloadRequest;
};

export type RemoteAssetListingBucket = RemoteAssetBucket & {
  list(path: string, options: { limit: number; offset: number; sortBy: { column: "name"; order: "asc" } }): Promise<{
    data: Array<{ name: string; id?: string | null; metadata?: Record<string, unknown> | null }> | null;
    error: RemoteStorageError | null;
  }>;
};

export async function findRemoteAssetProblems(
  bucket: RemoteAssetBucket,
  assets: CourseImportAsset[],
) {
  const problems: RemoteAssetProblem[] = [];
  for (const asset of assets) {
    if (asset.approval_status !== "approved") continue;
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

export async function findOptionalRemoteAssetProblems(
  bucket: RemoteAssetBucket,
  assets: CourseImportAsset[],
) {
  return (await inspectOptionalRemoteAssets(bucket, assets)).problems;
}

export async function inspectOptionalRemoteAssets(
  bucket: RemoteAssetBucket,
  assets: CourseImportAsset[],
) {
  const problems: RemoteAssetProblem[] = [];
  const present: string[] = [];
  const absent: string[] = [];
  for (const asset of assets) {
    if (asset.approval_status !== "approved") continue;
    const current = await bucket.info(asset.storage_path);
    if (!current.data) {
      if (isExplicitNotFound(current.error)) {
        absent.push(asset.storage_path);
        continue;
      }
      problems.push({
        path: asset.storage_path,
        problem: `optional retained object state is uncertain: ${current.error?.message ?? "empty response"}`,
      });
      continue;
    }
    present.push(asset.storage_path);
    problems.push(...await findRemoteAssetProblems(bucket, [asset]));
  }
  return { problems, present: present.sort(), absent: absent.sort() };
}

export async function listRemoteAssetPaths(
  bucket: RemoteAssetListingBucket,
  prefix: string,
  maximumEntries = 10_000,
) {
  if (
    !/^courses\/[a-z0-9][a-z0-9._-]*(?:\/v[0-9]+)?\/$/.test(prefix) ||
    prefix.includes("..") || prefix.includes("//") || prefix.includes("\\")
  ) {
    throw new Error("Storage inventory requires an exact canonical import prefix.");
  }
  const normalized = prefix.slice(0, -1);
  const pending = [normalized];
  const files: string[] = [];
  let inspected = 0;
  while (pending.length > 0) {
    const directory = pending.shift()!;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(directory, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error || !data) throw new Error(`Storage inventory failed at ${directory}: ${error?.message ?? "empty response"}`);
      for (const entry of data) {
        inspected += 1;
        if (inspected > maximumEntries) throw new Error(`Storage inventory exceeded ${maximumEntries} entries.`);
        if (!entry.name || entry.name.includes("/") || entry.name === "." || entry.name === "..") {
          throw new Error(`Storage inventory returned an unsafe object name at ${directory}.`);
        }
        const itemPath = `${directory}/${entry.name}`;
        if (entry.id === null || entry.id === undefined) pending.push(itemPath);
        else files.push(itemPath);
      }
      if (data.length < 100) break;
    }
  }
  return files.sort();
}

export async function findUnexpectedRemoteAssetPaths(
  bucket: RemoteAssetListingBucket,
  importId: string,
  prefix: string,
  assets: CourseImportAsset[],
) {
  const expectedPrefix = importStoragePrefix(importId);
  if (!expectedPrefix || prefix !== expectedPrefix) {
    throw new Error("Storage inventory prefix does not match the import's exact managed prefix.");
  }
  for (const asset of assets) {
    if (!asset.storage_path.startsWith(expectedPrefix)) {
      throw new Error(`${asset.source_key} escapes the import's exact managed storage prefix.`);
    }
  }
  const expected = new Set(
    assets.filter((asset) => asset.approval_status === "approved").map((asset) => asset.storage_path),
  );
  const actual = await listRemoteAssetPaths(bucket, prefix);
  return actual.filter((item) => !expected.has(item));
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

function isExplicitNotFound(error: RemoteStorageError | null) {
  if (!error) return false;
  const status = error.statusCode ?? error.status;
  return status === 404 || status === "404";
}
