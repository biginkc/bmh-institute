import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { Upload as TusUpload } from "tus-js-client";

import {
  findRemoteAssetProblems,
  type RemoteAssetBucket,
  type RemoteStorageError,
} from "./asset-transfer";
import { createVerifiedFileSnapshot } from "./asset-staging";
import type { CourseImportAsset } from "./manifest";
import {
  assertSafeTusUrl,
  normalizeTusEndpoint,
  supabaseResumableEndpoint,
} from "../storage/tus-safety";

export const COURSE_IMPORT_BUCKET = "content";
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const UPLOAD_OWNER_METADATA_KEY = "course_import_upload_id";

export type CourseImportUploadBucket = RemoteAssetBucket & {
  remove(paths: string[]): Promise<{
    data?: unknown;
    error: RemoteStorageError | null;
  }>;
};

export type PinnedFileSource = {
  size: number;
  slice(start: number, end: number): Promise<{
    value: Buffer & { size: number };
    done: boolean;
  }>;
  close(): void;
};

export type PinnedVerifiedFile = {
  source: PinnedFileSource;
  close(): Promise<void>;
};

export type TusUploadRequest = {
  endpoint: string;
  serviceKey: string;
  file: PinnedVerifiedFile;
  size: number;
  storagePath: string;
  contentType: string;
  checksum: string | null;
  filename: string;
  ownershipToken: string;
  statePath: string;
};

export async function uploadApprovedAssets(options: {
  endpoint: string;
  serviceKey: string;
  sourceRoot: string;
  assets: CourseImportAsset[];
  bucket: CourseImportUploadBucket;
  stateRoot?: string;
  startTusUpload?: (request: TusUploadRequest) => Promise<string>;
  log?: (message: string) => void;
}) {
  const startTusUpload = options.startTusUpload ?? uploadTus;
  const log = options.log ?? console.log;
  const stateRoot = resolve(options.stateRoot ?? join(process.cwd(), ".course-import-state"));

  for (const asset of options.assets.filter(
    (candidate) => candidate.approval_status === "approved",
  )) {
    const existing = await options.bucket.info(asset.storage_path);
    if (existing.data) {
      const problems = await findRemoteAssetProblems(options.bucket, [asset]);
      if (problems.length === 0) {
        log(`Already uploaded ${asset.source_key} -> ${asset.storage_path}`);
        continue;
      }
      throw new Error(
        `${asset.source_key} upload refused because an existing object failed exact verification: ${problems.map((problem) => problem.problem).join(", ")}`,
      );
    }
    if (!isExplicitNotFound(existing.error)) {
      throw new Error(
        `${asset.source_key} upload refused because storage absence could not be proven: ${existing.error?.message ?? "empty response"}`,
      );
    }

    const localPath = await resolveSourcePath(options.sourceRoot, asset.local_path);
    const snapshotParent = resolve(stateRoot, "upload-snapshots");
    await mkdir(snapshotParent, { recursive: true });
    const snapshotDirectory = await mkdtemp(join(snapshotParent, "asset-"));
    const ownershipToken = randomUUID();
    try {
      const snapshot = await createVerifiedFileSnapshot({
        source: localPath,
        destination: join(snapshotDirectory, basename(localPath)),
        expectedSize: asset.size_bytes,
        expectedChecksum: asset.checksum_sha256,
      });
      const pinned = await openPinnedVerifiedFile(snapshot);
      let completedOwnershipToken: string = ownershipToken;
      try {
        completedOwnershipToken = await startTusUpload({
          endpoint: normalizeTusEndpoint(options.endpoint),
          serviceKey: options.serviceKey,
          file: pinned,
          size: snapshot.size,
          storagePath: asset.storage_path,
          contentType: asset.mime_type,
          checksum: snapshot.checksum_sha256,
          filename: basename(localPath),
          ownershipToken,
          statePath: resolve(stateRoot, "tus-uploads.json"),
        });
      } finally {
        await pinned.close();
      }

      const uploadedProblems = await findRemoteAssetProblems(options.bucket, [
        {
          ...asset,
          size_bytes: snapshot.size,
          checksum_sha256: snapshot.checksum_sha256,
        },
      ]);
      if (uploadedProblems.length > 0) {
        const cleanup = await removeNewOwnedUpload({
          bucket: options.bucket,
          storagePath: asset.storage_path,
          ownershipToken: completedOwnershipToken,
        });
        throw new Error(
          `${asset.source_key} upload failed exact remote verification: ${uploadedProblems.map((problem) => problem.problem).join(", ")}. ${cleanup}`,
        );
      }
      log(`Uploaded ${asset.source_key} -> ${asset.storage_path}`);
    } finally {
      await rm(snapshotDirectory, { recursive: true, force: true });
    }
  }
}

export async function openPinnedVerifiedFile(snapshot: {
  path: string;
  size: number;
  device: string;
  inode: string;
}): Promise<PinnedVerifiedFile> {
  const handle = await open(
    snapshot.path,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  let closed = false;
  try {
    const current = await handle.stat();
    if (
      !current.isFile() ||
      current.size !== snapshot.size ||
      String(current.dev) !== snapshot.device ||
      String(current.ino) !== snapshot.inode
    ) {
      throw new Error("Verified upload snapshot identity changed before it could be pinned.");
    }

    // TUS may ask for the same range again after a retry. Keep one seekable
    // descriptor and unlink its pathname so later path replacement cannot
    // change the bytes served by another chunk.
    await rm(snapshot.path, { force: false });
    const source: PinnedFileSource = {
      size: snapshot.size,
      async slice(start, end) {
        if (start < 0 || end < start || end > snapshot.size) {
          throw new Error(`Invalid pinned upload range ${start}-${end}.`);
        }
        const value = Buffer.allocUnsafe(end - start) as Buffer & { size: number };
        let offset = 0;
        while (offset < value.length) {
          const { bytesRead } = await handle.read(
            value,
            offset,
            value.length - offset,
            start + offset,
          );
          if (bytesRead === 0) {
            throw new Error("Pinned upload snapshot ended before its verified size.");
          }
          offset += bytesRead;
        }
        Object.defineProperty(value, "size", {
          value: value.length,
          enumerable: false,
        });
        return { value, done: end >= snapshot.size };
      },
      close() {
        // The outer owner awaits the shared descriptor close after TUS settles.
      },
    };
    return {
      source,
      async close() {
        if (closed) return;
        closed = true;
        await handle.close();
      },
    };
  } catch (error) {
    if (!closed) {
      closed = true;
      await handle.close();
    }
    throw error;
  }
}

function uploadTus(request: TusUploadRequest) {
  const endpoint = normalizeTusEndpoint(request.endpoint);
  const fingerprint = createTusResumeFingerprint({
    endpoint,
    bucket: COURSE_IMPORT_BUCKET,
    checksum: request.checksum,
    storagePath: request.storagePath,
  });
  const urlStorage = new JsonTusUrlStorage(request.statePath, endpoint);

  return new Promise<string>((resolveUpload, reject) => {
    let effectiveOwnershipToken = request.ownershipToken;
    const upload = new TusUpload(Buffer.alloc(0), {
      endpoint,
      uploadSize: request.size,
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: { authorization: `Bearer ${request.serviceKey}`, "x-upsert": "false" },
      metadata: {
        bucketName: COURSE_IMPORT_BUCKET,
        objectName: request.storagePath,
        contentType: request.contentType,
        cacheControl: "3600",
        filename: request.filename,
        metadata: JSON.stringify({
          sha256: request.checksum,
          [UPLOAD_OWNER_METADATA_KEY]: request.ownershipToken,
        }),
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      fingerprint: async () => fingerprint,
      urlStorage,
      fileReader: {
        async openFile() {
          return request.file.source;
        },
      },
      onBeforeRequest: (httpRequest) => {
        assertSafeTusRequestUrl(httpRequest.getURL(), endpoint);
      },
      onError: reject,
      onProgress: (sent, total) =>
        process.stdout.write(
          `\r${request.storagePath}: ${Math.round((sent / total) * 100)}%`,
        ),
      onSuccess: () => {
        process.stdout.write("\n");
        resolveUpload(effectiveOwnershipToken);
      },
    });
    void upload.findPreviousUploads().then(
      (previous) => {
        if (previous[0]) {
          effectiveOwnershipToken = ownershipTokenFromMetadata(previous[0].metadata)!;
          upload.resumeFromPreviousUpload(previous[0]);
        }
        upload.start();
      },
      reject,
    );
  });
}

export function resumableEndpoint(supabaseUrl: string) {
  return supabaseResumableEndpoint(supabaseUrl);
}

export function createTusResumeFingerprint(options: {
  endpoint: string;
  bucket: string;
  checksum: string | null;
  storagePath: string;
}) {
  const partition = JSON.stringify({
    endpoint: normalizeTusEndpoint(options.endpoint),
    bucket: options.bucket,
    checksum: options.checksum,
    storagePath: options.storagePath,
  });
  return `bmh-course-import-v2:${createHash("sha256").update(partition).digest("hex")}`;
}

export function assertSafeTusRequestUrl(candidate: string, endpoint: string) {
  assertSafeTusUrl(candidate, endpoint);
}

type StoredTusUpload = {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
  fingerprint: string;
};

export class JsonTusUrlStorage {
  private readonly endpoint: string;

  constructor(
    private readonly filePath: string,
    endpoint: string,
  ) {
    this.endpoint = normalizeTusEndpoint(endpoint);
  }

  async findAllUploads() {
    const entries = await this.read();
    let changed = false;
    for (const [key, upload] of Object.entries(entries)) {
      if (!this.isSafe(upload)) {
        delete entries[key];
        changed = true;
      }
    }
    if (changed) await this.write(entries);
    return Object.values(entries);
  }

  async findUploadsByFingerprint(fingerprint: string) {
    return (await this.findAllUploads()).filter((upload) => upload.fingerprint === fingerprint);
  }

  async addUpload(fingerprint: string, upload: Omit<StoredTusUpload, "fingerprint">) {
    const stored = { ...upload, fingerprint };
    if (!this.isSafe(stored)) {
      throw new Error("Refusing to persist an unsafe TUS upload URL.");
    }
    const entries = await this.read();
    const key = `${fingerprint}:${upload.creationTime}`;
    entries[key] = { ...stored, urlStorageKey: key };
    await this.write(entries);
    return key;
  }

  async removeUpload(key: string) {
    const entries = await this.read();
    delete entries[key];
    await this.write(entries);
  }

  private isSafe(upload: StoredTusUpload) {
    const urls = [
      ...(upload.uploadUrl ? [upload.uploadUrl] : []),
      ...(upload.parallelUploadUrls ?? []),
    ];
    if (urls.length === 0 || !ownershipTokenFromMetadata(upload.metadata)) return false;
    try {
      urls.forEach((url) => assertSafeTusRequestUrl(url, this.endpoint));
      return true;
    } catch {
      return false;
    }
  }

  private async read(): Promise<Record<string, StoredTusUpload>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed as Record<string, StoredTusUpload>;
    } catch {
      return {};
    }
  }

  private async write(entries: Record<string, StoredTusUpload>) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }
}

function ownershipTokenFromMetadata(metadata: Record<string, string>) {
  try {
    const custom = JSON.parse(metadata.metadata) as unknown;
    if (!custom || typeof custom !== "object" || Array.isArray(custom)) return null;
    const token = (custom as Record<string, unknown>)[UPLOAD_OWNER_METADATA_KEY];
    return typeof token === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
      ? token
      : null;
  } catch {
    return null;
  }
}

async function removeNewOwnedUpload(options: {
  bucket: CourseImportUploadBucket;
  storagePath: string;
  ownershipToken: string;
}) {
  const current = await options.bucket.info(options.storagePath);
  if (
    !current.data ||
    current.data.metadata?.[UPLOAD_OWNER_METADATA_KEY] !== options.ownershipToken
  ) {
    return "The object was preserved because this import could not prove ownership.";
  }
  const removed = await options.bucket.remove([options.storagePath]);
  if (removed.error) {
    return `The owned new object could not be removed: ${removed.error.message}`;
  }
  return "The owned new object was removed so the upload can be retried.";
}

function isExplicitNotFound(error: RemoteStorageError | null) {
  if (!error) return false;
  const status = error.statusCode ?? error.status;
  return status === 404 || status === "404";
}

async function resolveSourcePath(sourceRoot: string, localPath: string) {
  const root = await realpath(sourceRoot);
  const candidate = await realpath(resolve(root, localPath));
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.startsWith("..") || resolve(root, pathFromRoot) !== candidate) {
    throw new Error(`Asset path escapes --source-root: ${localPath}`);
  }
  return candidate;
}
