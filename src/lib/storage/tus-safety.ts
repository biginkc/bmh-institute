import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

const SUPABASE_TUS_ROUTE = "/storage/v1/upload/resumable";
const HASH_CHUNK_BYTES = 6 * 1024 * 1024;

export type TusPreviousUpload = {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
};

export type TusUrlStorage = {
  findAllUploads(): Promise<TusPreviousUpload[]>;
  findUploadsByFingerprint(fingerprint: string): Promise<TusPreviousUpload[]>;
  removeUpload(urlStorageKey: string): Promise<void>;
  addUpload(fingerprint: string, upload: TusPreviousUpload): Promise<string>;
};

export function supabaseResumableEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  const projectId = url.hostname.endsWith(".supabase.co")
    ? url.hostname.slice(0, -".supabase.co".length)
    : null;
  return normalizeTusEndpoint(
    projectId
      ? `${url.protocol}//${projectId}.storage.supabase.co${SUPABASE_TUS_ROUTE}`
      : `${url.origin}${SUPABASE_TUS_ROUTE}`,
  );
}

export function normalizeTusEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  if (url.username || url.password) {
    throw new Error("TUS endpoint must not contain URL credentials.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.pathname !== SUPABASE_TUS_ROUTE) {
    throw new Error(`TUS endpoint must use the resumable route ${SUPABASE_TUS_ROUTE}.`);
  }
  return url.toString().replace(/\/$/, "");
}

export function assertSafeTusUrl(candidate: string, endpoint: string) {
  const normalizedEndpoint = new URL(normalizeTusEndpoint(endpoint));
  const url = new URL(candidate);
  const routePrefix = `${normalizedEndpoint.pathname}/`;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error(`Refusing malformed TUS upload URL: ${candidate}`);
  }
  if (
    url.username ||
    url.password ||
    url.origin !== normalizedEndpoint.origin ||
    (url.pathname !== normalizedEndpoint.pathname && !url.pathname.startsWith(routePrefix)) ||
    (decodedPath !== normalizedEndpoint.pathname && !decodedPath.startsWith(routePrefix))
  ) {
    throw new Error(`Refusing unsafe TUS upload URL: ${candidate}`);
  }
}

export async function sha256Blob(blob: Blob, chunkBytes = HASH_CHUNK_BYTES) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("SHA-256 chunk size must be a positive safe integer.");
  }
  const hash = sha256.create();
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    const bytes = new Uint8Array(
      await blob.slice(offset, Math.min(offset + chunkBytes, blob.size)).arrayBuffer(),
    );
    hash.update(bytes);
  }
  return bytesToHex(hash.digest());
}

export function createScopedTusFingerprint(options: {
  endpoint: string;
  bucket: string;
  path: string;
  checksum: string;
}) {
  const scope = JSON.stringify({
    endpoint: normalizeTusEndpoint(options.endpoint),
    bucket: options.bucket,
    path: options.path,
    checksum: options.checksum,
  });
  return `bmh-tus-v2:${bytesToHex(sha256(utf8ToBytes(scope)))}`;
}

export class ValidatingTusUrlStorage implements TusUrlStorage {
  private readonly endpoint: string;

  constructor(
    private readonly delegate: TusUrlStorage,
    endpoint: string,
  ) {
    this.endpoint = normalizeTusEndpoint(endpoint);
  }

  async findAllUploads() {
    return this.filter(await this.delegate.findAllUploads());
  }

  async findUploadsByFingerprint(fingerprint: string) {
    return this.filter(await this.delegate.findUploadsByFingerprint(fingerprint));
  }

  removeUpload(urlStorageKey: string) {
    return this.delegate.removeUpload(urlStorageKey);
  }

  addUpload(fingerprint: string, upload: TusPreviousUpload) {
    this.assertSafe(upload);
    return this.delegate.addUpload(fingerprint, upload);
  }

  private async filter(uploads: TusPreviousUpload[]) {
    const safe: TusPreviousUpload[] = [];
    for (const upload of uploads) {
      try {
        this.assertSafe(upload);
        safe.push(upload);
      } catch {
        await this.delegate.removeUpload(upload.urlStorageKey);
      }
    }
    return safe;
  }

  private assertSafe(upload: TusPreviousUpload) {
    const urls = [
      ...(upload.uploadUrl ? [upload.uploadUrl] : []),
      ...(upload.parallelUploadUrls ?? []),
    ];
    if (urls.length === 0) throw new Error("Refusing TUS resume state without an upload URL.");
    urls.forEach((url) => assertSafeTusUrl(url, this.endpoint));
  }
}
