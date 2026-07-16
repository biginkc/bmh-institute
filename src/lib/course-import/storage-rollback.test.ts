import { describe, expect, it } from "vitest";

import { inspectStorageRollbackAssets } from "./storage-rollback";
import type { CourseImportAsset } from "./manifest";

describe("storage rollback preservation", () => {
  it("never calls a non-conditional delete even when import ownership is present", async () => {
    let removes = 0;
    const report = await inspectStorageRollbackAssets({
      importId: "training-v1",
      assets: [asset("approved")],
      bucket: {
        async info() {
          return {
            data: {
              size: 8,
              metadata: {
                sha256: "a".repeat(64),
                course_import_id: "training-v1",
                course_import_upload_id: "00000000-0000-4000-8000-000000000000",
              },
            },
            error: null,
          };
        },
        async remove() {
          removes += 1;
          return { error: null };
        },
      },
    });

    expect(removes).toBe(0);
    expect(report.manual_cleanup_candidates).toEqual([expect.objectContaining({ source_key: "asset" })]);
    expect(report.automatic_deletes).toEqual([]);
  });

  it("makes no storage calls for held or missing assets", async () => {
    let calls = 0;
    const report = await inspectStorageRollbackAssets({
      importId: "training-v1",
      assets: [asset("hold"), asset("missing")],
      bucket: {
        async info() { calls += 1; throw new Error("must not inspect"); },
        async remove() { calls += 1; return { error: null }; },
      },
    });
    expect(calls).toBe(0);
    expect(report.preserved).toHaveLength(2);
  });

  it("preserves an approved object when import ownership or integrity changed", async () => {
    let removes = 0;
    const report = await inspectStorageRollbackAssets({
      importId: "training-v1",
      assets: [asset("approved")],
      bucket: {
        async info() {
          return {
            data: {
              size: 8,
              metadata: {
                sha256: "b".repeat(64),
                course_import_id: "another-import",
                course_import_upload_id: "00000000-0000-4000-8000-000000000000",
              },
            },
            error: null,
          };
        },
        async remove() {
          removes += 1;
          return { error: null };
        },
      },
    });

    expect(removes).toBe(0);
    expect(report.manual_cleanup_candidates).toEqual([]);
    expect(report.preserved).toEqual([
      expect.objectContaining({ reason: "import_ownership_or_integrity_unproven" }),
    ]);
  });
});

function asset(approval_status: CourseImportAsset["approval_status"]): CourseImportAsset {
  return {
    source_key: "asset",
    kind: "video",
    local_path: "asset.mp4",
    storage_path: "courses/training/v1/asset.hash.mp4",
    mime_type: "video/mp4",
    checksum_sha256: "a".repeat(64),
    size_bytes: 8,
    approval_status,
  };
}
