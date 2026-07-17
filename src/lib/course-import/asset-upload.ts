import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, mkdtemp, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { Upload as TusUpload } from "tus-js-client";
import { lock as acquireFileLock } from "proper-lockfile";

import {
  findRemoteAssetProblems,
  type RemoteAssetBucket,
  type RemoteStorageError,
} from "./asset-transfer";
import { createVerifiedFileSnapshot } from "./asset-staging";
import type { CourseImportAsset } from "./manifest";
import {
  assertSafeTusResumeUrl,
  assertSafeTusUrl,
  normalizeTusEndpoint,
  parseCustomTusMetadata,
  supabaseResumableEndpoint,
} from "../storage/tus-safety";

export const COURSE_IMPORT_BUCKET = "content";
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const UPLOAD_OWNER_METADATA_KEY = "course_import_upload_id";

export type CourseImportUploadBucket = RemoteAssetBucket & {
  remove?(paths: string[]): Promise<{ data?: unknown; error: RemoteStorageError | null }>;
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
  importId: string;
  statePath: string;
};

export async function uploadApprovedAssets(options: {
  endpoint: string;
  serviceKey: string;
  importId: string;
  sourceRoot: string;
  assets: CourseImportAsset[];
  bucket: CourseImportUploadBucket;
  stateRoot: string;
  startTusUpload?: (request: TusUploadRequest) => Promise<string>;
  log?: (message: string) => void;
}) {
  const startTusUpload = options.startTusUpload ?? uploadTus;
  const log = options.log ?? console.log;
  const stateRoot = resolve(options.stateRoot);

  assertApprovedUploadIntegrity(options.assets);
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
          importId: options.importId,
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
        throw new Error(
          `${asset.source_key} upload failed exact remote verification: ${uploadedProblems.map((problem) => problem.problem).join(", ")}. The object was preserved because storage does not offer a conditional delete that can close the ownership race. Ownership token: ${completedOwnershipToken}.`,
        );
      }
      log(`Uploaded ${asset.source_key} -> ${asset.storage_path}`);
    } finally {
      await rm(snapshotDirectory, { recursive: true, force: true });
    }
  }
}

export function assertApprovedUploadIntegrity(assets: CourseImportAsset[]) {
  for (const asset of assets) {
    if (asset.approval_status !== "approved") continue;
    if (
      !Number.isSafeInteger(asset.size_bytes) ||
      asset.size_bytes === null ||
      asset.size_bytes < 0 ||
      !asset.checksum_sha256 ||
      !/^[0-9a-f]{64}$/.test(asset.checksum_sha256) ||
      !asset.storage_path.includes(asset.checksum_sha256)
    ) {
      throw new Error(
        `Approved asset ${asset.source_key} requires size_bytes, checksum_sha256, and an immutable checksum-addressed storage_path before upload.`,
      );
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
  const urlStorage = new JsonTusUrlStorage(request.statePath, {
    endpoint,
    fingerprint,
    size: request.size,
    bucket: COURSE_IMPORT_BUCKET,
    storagePath: request.storagePath,
    checksum: request.checksum!,
    contentType: request.contentType,
    importId: request.importId,
  });

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
          course_import_id: request.importId,
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
    private readonly scope: {
      endpoint: string;
      fingerprint: string;
      size: number;
      bucket: string;
      storagePath: string;
      checksum: string;
      contentType: string;
      importId: string;
    },
  ) {
    this.endpoint = normalizeTusEndpoint(scope.endpoint);
    const expected = createTusResumeFingerprint({
      endpoint: this.endpoint,
      bucket: scope.bucket,
      checksum: scope.checksum,
      storagePath: scope.storagePath,
    });
    if (scope.fingerprint !== expected) {
      throw new Error("TUS resume scope fingerprint does not match its declared asset.");
    }
  }

  async findAllUploads() {
    return this.withStateLock(async () => {
      const entries = await this.read();
      let changed = false;
      for (const [key, upload] of Object.entries(entries)) {
        if (upload.fingerprint !== this.scope.fingerprint) continue;
        if (!this.hasSafeUrlAndOwner(upload) || !this.matchesScope(upload)) {
          delete entries[key];
          changed = true;
        }
      }
      if (changed) await this.write(entries);
      return Object.values(entries).filter((upload) => this.matchesScope(upload));
    });
  }

  async findUploadsByFingerprint(fingerprint: string) {
    return (await this.findAllUploads()).filter((upload) => upload.fingerprint === fingerprint);
  }

  async addUpload(fingerprint: string, upload: Omit<StoredTusUpload, "fingerprint">) {
    const stored = { ...upload, fingerprint };
    if (
      fingerprint !== this.scope.fingerprint ||
      !this.hasSafeUrlAndOwner(stored) ||
      !this.matchesScope(stored)
    ) {
      throw new Error("Refusing to persist an unsafe TUS upload URL.");
    }
    return this.withStateLock(async () => {
      const entries = await this.read();
      const key = `${fingerprint}:${upload.creationTime}:${randomUUID()}`;
      entries[key] = { ...stored, urlStorageKey: key };
      await this.write(entries);
      return key;
    });
  }

  async removeUpload(key: string) {
    await this.withStateLock(async () => {
      const entries = await this.read();
      delete entries[key];
      await this.write(entries);
    });
  }

  private hasSafeUrlAndOwner(upload: StoredTusUpload) {
    const urls = [
      ...(upload.uploadUrl ? [upload.uploadUrl] : []),
      ...(upload.parallelUploadUrls ?? []),
    ];
    if (urls.length === 0 || !ownershipTokenFromMetadata(upload.metadata)) return false;
    try {
      urls.forEach((url) => assertSafeTusResumeUrl(url, this.endpoint));
      return true;
    } catch {
      return false;
    }
  }

  private matchesScope(upload: StoredTusUpload) {
    const custom = parseCustomTusMetadata(upload.metadata);
    return (
      upload.fingerprint === this.scope.fingerprint &&
      upload.size === this.scope.size &&
      upload.metadata.bucketName === this.scope.bucket &&
      upload.metadata.objectName === this.scope.storagePath &&
      upload.metadata.contentType === this.scope.contentType &&
      custom?.sha256 === this.scope.checksum &&
      custom.course_import_id === this.scope.importId
    );
  }

  private async read(): Promise<Record<string, StoredTusUpload>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("TUS resume state must be a JSON object.");
      }
      return parsed as Record<string, StoredTusUpload>;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return {};
      throw new Error(`TUS resume state is unreadable or malformed: ${this.filePath}`, {
        cause: error,
      });
    }
  }

  private async write(entries: Record<string, StoredTusUpload>) {
    const parent = dirname(this.filePath);
    await mkdir(parent, { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${randomUUID()}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(entries, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.filePath);
      await syncDirectory(parent);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async withStateLock<T>(work: () => Promise<T>) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const release = await acquireFileLock(this.filePath, {
      realpath: false,
      stale: 30_000,
      update: 10_000,
      retries: { retries: 200, minTimeout: 5, maxTimeout: 50, factor: 1.2 },
    });
    try {
      return await work();
    } finally {
      await release();
    }
  }
}

async function syncDirectory(path: string) {
  const directory = await open(path, fsConstants.O_RDONLY);
  try {
    await directory.sync();
  } catch (error) {
    if (!isNodeError(error) || !["EINVAL", "ENOTSUP", "EPERM"].includes(error.code ?? "")) {
      throw error;
    }
  } finally {
    await directory.close();
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function ownershipTokenFromMetadata(metadata: Record<string, string>) {
  try {
    const custom = parseCustomTusMetadata(metadata);
    if (!custom) return null;
    const token = custom[UPLOAD_OWNER_METADATA_KEY];
    return typeof token === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
      ? token
      : null;
  } catch {
    return null;
  }
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
