import { describe, expect, it } from "vitest";

import {
  ValidatingTusUrlStorage,
  assertSafeTusUrl,
  createScopedTusFingerprint,
  sha256Blob,
  supabaseResumableEndpoint,
  type TusPreviousUpload,
  type TusUrlStorage,
} from "./tus-safety";

const ENDPOINT = "https://project.storage.supabase.co/storage/v1/upload/resumable";

describe("shared TUS safety", () => {
  it("hashes a blob incrementally across chunk boundaries", async () => {
    await expect(sha256Blob(new Blob(["abcdef"]), 2)).resolves.toBe(
      "bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721",
    );
  });

  it("partitions fingerprints by endpoint, bucket, path, and checksum", () => {
    const base = {
      endpoint: ENDPOINT,
      bucket: "content",
      path: "user/file.mp4",
      checksum: "a".repeat(64),
    };
    const values = [
      createScopedTusFingerprint(base),
      createScopedTusFingerprint({
        ...base,
        endpoint: "https://other.storage.supabase.co/storage/v1/upload/resumable",
      }),
      createScopedTusFingerprint({ ...base, bucket: "submissions" }),
      createScopedTusFingerprint({ ...base, path: "user/other.mp4" }),
      createScopedTusFingerprint({ ...base, checksum: "b".repeat(64) }),
    ];
    expect(new Set(values).size).toBe(values.length);
    expect(supabaseResumableEndpoint("https://project.supabase.co/")).toBe(ENDPOINT);
  });

  it("removes stored URLs from an old project before they can be resumed", async () => {
    const safe = upload(`${ENDPOINT}/safe`, "safe");
    const old = upload(
      "https://old-project.storage.supabase.co/storage/v1/upload/resumable/stale",
      "old",
    );
    const removed: string[] = [];
    const delegate: TusUrlStorage = {
      async findAllUploads() {
        return [safe, old];
      },
      async findUploadsByFingerprint() {
        return [old, safe];
      },
      async removeUpload(key) {
        removed.push(key);
      },
      async addUpload(_fingerprint, entry) {
        return entry.urlStorageKey;
      },
    };
    const storage = new ValidatingTusUrlStorage(delegate, ENDPOINT);

    await expect(storage.findUploadsByFingerprint("fingerprint")).resolves.toEqual([safe]);
    expect(removed).toEqual(["old"]);
  });

  it("rejects a request outside the exact endpoint origin and route", () => {
    expect(() => assertSafeTusUrl(`${ENDPOINT}/upload-id`, ENDPOINT)).not.toThrow();
    expect(() =>
      assertSafeTusUrl(
        "https://old-project.storage.supabase.co/storage/v1/upload/resumable/stale",
        ENDPOINT,
      ),
    ).toThrow(/unsafe TUS upload URL/i);
    expect(() =>
      assertSafeTusUrl(
        "https://project.storage.supabase.co/storage/v1/upload/resumable-evil/stale",
        ENDPOINT,
      ),
    ).toThrow(/unsafe TUS upload URL/i);
  });
});

function upload(uploadUrl: string, key: string): TusPreviousUpload {
  return {
    size: 1,
    metadata: {},
    creationTime: key,
    urlStorageKey: key,
    uploadUrl,
    parallelUploadUrls: null,
  };
}
