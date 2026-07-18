type BrowserUploadError = unknown;

export type BrowserUploadBucket = {
  upload(
    path: string,
    file: Blob,
    options: {
      contentType: string;
      metadata: { sha256: string };
      upsert: false;
    },
  ): Promise<{ error: BrowserUploadError | null }>;
  info(path: string): Promise<{
    data: {
      size?: number;
      metadata?: Record<string, unknown> | null;
    } | null;
    error: BrowserUploadError | null;
  }>;
};

export function remoteObjectMatchesUpload(
  remote: { size?: number; metadata?: Record<string, unknown> | null } | null,
  expected: { size: number; checksum: string },
) {
  return (
    remote?.size === expected.size &&
    remote.metadata?.sha256 === expected.checksum
  );
}

/**
 * Uploads a small browser object without overwriting an existing path. If the
 * request fails after storage may have committed the object, an authoritative
 * info lookup accepts only the exact size and SHA-256 written by this request.
 */
export async function uploadSmallBrowserObject(options: {
  bucket: BrowserUploadBucket;
  path: string;
  file: Blob;
  contentType: string;
  checksum: string;
}) {
  let uploadError: BrowserUploadError;
  try {
    const result = await options.bucket.upload(options.path, options.file, {
      contentType: options.contentType,
      metadata: { sha256: options.checksum },
      upsert: false,
    });
    if (!result.error) return;
    uploadError = result.error;
  } catch (error) {
    uploadError = error;
  }

  let remote: Awaited<ReturnType<BrowserUploadBucket["info"]>>;
  try {
    remote = await options.bucket.info(options.path);
  } catch {
    throw uploadError;
  }
  if (
    remote.error ||
    !remoteObjectMatchesUpload(remote.data, {
      size: options.file.size,
      checksum: options.checksum,
    })
  ) {
    throw uploadError;
  }
}
