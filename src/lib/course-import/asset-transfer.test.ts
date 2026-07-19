import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { CourseImportAsset } from "./manifest";
import { findRemoteAssetProblems, findUnexpectedRemoteAssetPaths } from "./asset-transfer";

describe("course import remote asset verification", () => {
  it("makes no storage calls for assets that are not approved", async () => {
    let calls = 0;
    const bucket = {
      async info() {
        calls += 1;
        throw new Error("unapproved assets must not reach storage");
      },
      download() {
        calls += 1;
        throw new Error("unapproved assets must not reach storage");
      },
    };
    const approved = approvedAsset(Buffer.from("approved"));

    await expect(
      findRemoteAssetProblems(bucket, [
        { ...approved, source_key: "held", approval_status: "hold" },
        { ...approved, source_key: "missing", approval_status: "missing" },
      ]),
    ).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it("rejects matching metadata when the exact remote bytes differ", async () => {
    const expected = Buffer.from("approved");
    const remote = Buffer.from("tampered");
    const asset = approvedAsset(expected);
    const bucket = fakeBucket({
      bytes: remote,
      size: remote.length,
      metadataSha256: asset.checksum_sha256!,
    });

    const problems = await findRemoteAssetProblems(bucket, [asset]);

    expect(problems).toContainEqual({
      path: asset.storage_path,
      problem: "remote bytes SHA-256 does not match",
    });
  });

  it("fails closed when exact remote byte verification is unavailable", async () => {
    const expected = Buffer.from("approved");
    const asset = approvedAsset(expected);
    const bucket = fakeBucket({
      bytes: null,
      size: expected.length,
      metadataSha256: asset.checksum_sha256!,
      downloadError: "download denied",
    });

    const problems = await findRemoteAssetProblems(bucket, [asset]);

    expect(problems).toContainEqual({
      path: asset.storage_path,
      problem: "remote byte verification failed: download denied",
    });
  });

  it("accepts an object only when size, metadata, and exact bytes agree", async () => {
    const expected = Buffer.from("approved");
    const asset = approvedAsset(expected);
    const bucket = fakeBucket({
      bytes: expected,
      size: expected.length,
      metadataSha256: asset.checksum_sha256!,
    });

    await expect(findRemoteAssetProblems(bucket, [asset])).resolves.toEqual([]);
  });

  it("uses an exact streaming download when the storage client exposes one", async () => {
    const expected = Buffer.from("approved");
    const asset = approvedAsset(expected);
    let blobFallbackAwaited = false;
    const bucket = {
      async info() {
        return {
          data: { size: expected.length, metadata: { sha256: asset.checksum_sha256! } },
          error: null,
        };
      },
      download() {
        return {
          then() {
            blobFallbackAwaited = true;
            throw new Error("blob fallback should not be awaited");
          },
          asStream: async () => ({
            data: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(Uint8Array.from(expected));
                controller.close();
              },
            }),
            error: null,
          }),
        };
      },
    };

    await expect(findRemoteAssetProblems(bucket, [asset])).resolves.toEqual([]);
    expect(blobFallbackAwaited).toBe(false);
  });
});

it("reports unexpected objects anywhere below the immutable import prefix", async () => {
  const listings = new Map([
    ["courses/import/v1", [{ name: "videos", id: null }, { name: "stale.bin", id: "extra" }]],
    ["courses/import/v1/videos", [{ name: "approved.bin", id: "expected" }]],
  ]);
  const bucket = {
    async info() { return { data: null, error: { status: 404, message: "missing" } }; },
    download() { return Promise.resolve({ data: null, error: { message: "unused" } }); },
    async list(path: string) { return { data: listings.get(path) ?? [], error: null }; },
  };
  await expect(findUnexpectedRemoteAssetPaths(
    bucket,
    "import-v1",
    "courses/import/v1/",
    [{
      source_key: "approved",
      kind: "video",
      local_path: "approved.bin",
      storage_path: "courses/import/v1/videos/approved.bin",
      mime_type: "application/octet-stream",
      checksum_sha256: "a".repeat(64),
      size_bytes: 1,
      approval_status: "approved",
    }],
  )).resolves.toEqual(["courses/import/v1/stale.bin"]);
});

it("rejects empty, malformed, mismatched, and asset-escaping storage prefixes", async () => {
  const bucket = {
    async info() { return { data: null, error: { status: 404, message: "missing" } }; },
    download() { return Promise.resolve({ data: null, error: { message: "unused" } }); },
    async list() { return { data: [], error: null }; },
  };
  const asset = approvedAsset(Buffer.from("approved"));
  for (const prefix of ["", "courses/", "/courses/test/v1/", "courses/test/../v1/"]) {
    await expect(findUnexpectedRemoteAssetPaths(bucket, "test-v1", prefix, [asset])).rejects.toThrow(/prefix/);
  }
  await expect(findUnexpectedRemoteAssetPaths(bucket, "test-v1", "courses/other/v1/", [asset])).rejects.toThrow(/exact managed prefix/);
  await expect(findUnexpectedRemoteAssetPaths(bucket, "test-v1", "courses/test/v1/", [{ ...asset, storage_path: "courses/elsewhere/file.bin" }])).rejects.toThrow(/escapes/);
});

function approvedAsset(bytes: Buffer): CourseImportAsset {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return {
    source_key: "asset",
    kind: "download",
    local_path: "assets/file.bin",
    storage_path: `courses/test/v1/${checksum}.bin`,
    mime_type: "application/octet-stream",
    checksum_sha256: checksum,
    size_bytes: bytes.length,
    approval_status: "approved",
  };
}

function fakeBucket(options: {
  bytes: Buffer | null;
  size: number;
  metadataSha256: string;
  downloadError?: string;
}) {
  return {
    async info() {
      return {
        data: { size: options.size, metadata: { sha256: options.metadataSha256 } },
        error: null,
      };
    },
    async download() {
      return options.downloadError
        ? { data: null, error: { message: options.downloadError } }
        : { data: new Blob([Uint8Array.from(options.bytes!).buffer]), error: null };
    },
  };
}
