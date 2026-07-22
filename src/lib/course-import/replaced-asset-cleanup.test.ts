import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { removeExactReplacedAssets, type ReplacedAssetCleanupBucket } from "./replaced-asset-cleanup";
import type { CourseImportAsset } from "./manifest";

const bytes = Buffer.from("superseded poster");
const checksum = createHash("sha256").update(bytes).digest("hex");
const storagePath = `courses/training/v1/posters/old-${checksum}.webp`;

describe("replaced asset cleanup", () => {
  it("re-verifies exact ownership, bytes, and references before deleting", async () => {
    const remote = bucket();
    let unreferencedChecks = 0;
    const result = await removeExactReplacedAssets({
      importId: "training-v1",
      assets: [asset()],
      bucket: remote,
      async assertUnreferenced(path) {
        expect(path).toBe(storagePath);
        unreferencedChecks += 1;
      },
    });

    expect(unreferencedChecks).toBe(1);
    expect(result).toEqual({ removed: [storagePath], alreadyAbsent: [] });
  });

  it("is idempotent only when absence is explicit", async () => {
    const remote = bucket();
    await remote.remove([storagePath]);
    await expect(removeExactReplacedAssets({
      importId: "training-v1",
      assets: [asset()],
      bucket: remote,
      async assertUnreferenced() { throw new Error("must not run"); },
    })).resolves.toEqual({ removed: [], alreadyAbsent: [storagePath] });
  });

  it("refuses changed ownership before reference checks or deletion", async () => {
    const remote = bucket({ courseImportId: "other-v1" });
    let checked = false;
    await expect(removeExactReplacedAssets({
      importId: "training-v1",
      assets: [asset()],
      bucket: remote,
      async assertUnreferenced() { checked = true; },
    })).rejects.toThrow(/ownership or metadata changed/i);
    expect(checked).toBe(false);
    expect(remote.removes).toBe(0);
  });
});

function asset(): CourseImportAsset {
  return {
    source_key: "old-poster",
    kind: "image",
    local_path: "old.webp",
    storage_path: storagePath,
    mime_type: "image/webp",
    checksum_sha256: checksum,
    size_bytes: bytes.length,
    approval_status: "approved",
  };
}

function bucket(overrides: Record<string, unknown> = {}) {
  let present = true;
  const result: ReplacedAssetCleanupBucket & { removes: number } = {
    removes: 0,
    async info() {
      return present
        ? {
            data: {
              size: bytes.length,
              metadata: {
                sha256: checksum,
                courseImportId: "training-v1",
                courseImportUploadId: "00000000-0000-4000-8000-000000000000",
                ...overrides,
              },
            },
            error: null,
          }
        : { data: null, error: { message: "not found", statusCode: 404 } };
    },
    async download() {
      return present
        ? { data: new Blob([bytes]), error: null }
        : { data: null, error: { message: "not found", statusCode: 404 } };
    },
    async remove() {
      result.removes += 1;
      present = false;
      return { error: null };
    },
  };
  return result;
}
