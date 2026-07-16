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

export type TusResumeScope = {
  endpoint: string;
  fingerprint: string;
  size: number;
  bucket: string;
  path: string;
  checksum: string;
  contentType: string;
  importId?: string;
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
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new Error("TUS endpoints must use HTTPS except on an explicit loopback development host.");
  }
  return url.toString().replace(/\/$/, "");
}

export function assertSafeTusUrl(candidate: string, endpoint: string) {
  const normalizedEndpoint = new URL(normalizeTusEndpoint(endpoint));
  const url = new URL(candidate);
  const routePrefix = `${normalizedEndpoint.pathname}/`;
  // URL parsing removes dot segments before pathname can be inspected. Check
  // the supplied URL too, otherwise /upload-id/%2e%2e/other canonicalizes to
  // an apparently safe sibling upload resource.
  const encodedPathControl = /%(?:25|2e|2f|5c)/i.test(candidate);
  const rawDotSegment = /(?:\/|^)(?:\.|\.\.)(?:\/|[?#]|$)/.test(candidate);
  const rawBackslash = candidate.includes("\\");
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error(`Refusing malformed TUS upload URL: ${candidate}`);
  }
  const suffix = decodedPath === normalizedEndpoint.pathname
    ? ""
    : decodedPath.slice(routePrefix.length);
  const unsafeSegment = suffix !== "" && suffix
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.origin !== normalizedEndpoint.origin ||
    encodedPathControl ||
    rawDotSegment ||
    rawBackslash ||
    decodedPath.includes("\\") ||
    unsafeSegment ||
    (url.pathname !== normalizedEndpoint.pathname && !url.pathname.startsWith(routePrefix)) ||
    (decodedPath !== normalizedEndpoint.pathname && !decodedPath.startsWith(routePrefix))
  ) {
    throw new Error(`Refusing unsafe TUS upload URL: ${candidate}`);
  }
}

export function assertSafeTusResumeUrl(candidate: string, endpoint: string) {
  assertSafeTusUrl(candidate, endpoint);
  const normalizedEndpoint = new URL(normalizeTusEndpoint(endpoint));
  const url = new URL(candidate);
  const routePrefix = `${normalizedEndpoint.pathname}/`;
  const resourceSuffix = url.pathname.startsWith(routePrefix)
    ? url.pathname.slice(routePrefix.length)
    : "";
  if (!resourceSuffix || resourceSuffix.includes("/")) {
    throw new Error(`Refusing non-canonical TUS resume URL: ${candidate}`);
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
    private readonly scope: TusResumeScope,
  ) {
    this.endpoint = normalizeTusEndpoint(scope.endpoint);
    const expected = createScopedTusFingerprint({
      endpoint: this.endpoint,
      bucket: scope.bucket,
      path: scope.path,
      checksum: scope.checksum,
    });
    if (scope.fingerprint !== expected) {
      throw new Error("TUS resume scope fingerprint does not match its declared asset.");
    }
  }

  async findAllUploads() {
    return this.filter(await this.delegate.findAllUploads(), false);
  }

  async findUploadsByFingerprint(fingerprint: string) {
    if (fingerprint !== this.scope.fingerprint) return [];
    return this.filter(await this.delegate.findUploadsByFingerprint(fingerprint), true);
  }

  removeUpload(urlStorageKey: string) {
    return this.delegate.removeUpload(urlStorageKey);
  }

  addUpload(fingerprint: string, upload: TusPreviousUpload) {
    if (fingerprint !== this.scope.fingerprint || !this.matchesScope(upload)) {
      throw new Error("Refusing to persist TUS state outside the current asset scope.");
    }
    this.assertSafeUrl(upload);
    return this.delegate.addUpload(fingerprint, upload);
  }

  private async filter(uploads: TusPreviousUpload[], removeScopeMismatch: boolean) {
    const safe: TusPreviousUpload[] = [];
    for (const upload of uploads) {
      try {
        this.assertSafeUrl(upload);
        if (this.matchesScope(upload)) safe.push(upload);
        else if (removeScopeMismatch) await this.delegate.removeUpload(upload.urlStorageKey);
      } catch {
        await this.delegate.removeUpload(upload.urlStorageKey);
      }
    }
    return safe;
  }

  private assertSafeUrl(upload: TusPreviousUpload) {
    const urls = [
      ...(upload.uploadUrl ? [upload.uploadUrl] : []),
      ...(upload.parallelUploadUrls ?? []),
    ];
    if (urls.length === 0) throw new Error("Refusing TUS resume state without an upload URL.");
    urls.forEach((url) => assertSafeTusResumeUrl(url, this.endpoint));
  }

  private matchesScope(upload: TusPreviousUpload) {
    const custom = parseCustomTusMetadata(upload.metadata);
    return (
      upload.size === this.scope.size &&
      upload.metadata.bucketName === this.scope.bucket &&
      upload.metadata.objectName === this.scope.path &&
      upload.metadata.contentType === this.scope.contentType &&
      custom?.sha256 === this.scope.checksum &&
      (this.scope.importId === undefined || custom.course_import_id === this.scope.importId)
    );
  }
}

export function parseCustomTusMetadata(metadata: Record<string, string>) {
  try {
    const parsed = JSON.parse(metadata.metadata) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    octets[0] === 127
  );
}
