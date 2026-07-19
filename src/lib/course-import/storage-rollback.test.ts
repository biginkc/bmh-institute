import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import {
  assertStorageRollbackInspectionClean,
  inspectStorageRollbackAssets,
} from "./storage-rollback";
import type { CourseImportAsset } from "./manifest";

const TEST_ASSET_BYTES = "contents";
const TEST_ASSET_SHA256 = "d1b2a59fbea7e20077af9f91b27e95e865061b270be03ff539ab3b73587882e8";

function exactDownload() {
  return Promise.resolve({ data: new Blob([TEST_ASSET_BYTES]), error: null });
}

describe("storage rollback preservation", () => {
  it("never calls a non-conditional delete even when import ownership is present", async () => {
    let removes = 0;
    const report = await inspectStorageRollbackAssets({
      importId: "training-v1",
      assets: [asset("approved")],
      bucket: {
        async list() { return { data: [{ name: "asset.hash.mp4", id: "asset-id" }], error: null }; },
        download: exactDownload,
        async info() {
          return {
            data: {
              size: 8,
              metadata: {
                sha256: TEST_ASSET_SHA256,
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
    expect(report.evidence_semantics).toBe("advisory_non_deletion_authorization");
    expect(report.manual_review_candidates).toEqual([expect.objectContaining({ source_key: "asset" })]);
    expect(report.automatic_deletes).toEqual([]);
  });

  it("recognizes the camel-cased custom metadata returned by Supabase info()", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const requestUrl = String(input);
      if (requestUrl.includes("/object/list/")) {
        return new Response(JSON.stringify([{ name: "asset.hash.mp4", id: "object-id" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (!requestUrl.includes("/object/info/")) {
        return new Response(TEST_ASSET_BYTES, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response(JSON.stringify({
        id: "object-id",
        version: "version-id",
        name: "asset.hash.mp4",
        bucket_id: "content",
        created_at: "2026-07-16T00:00:00.000Z",
        size: 8,
        metadata: {
          sha256: TEST_ASSET_SHA256,
          course_import_id: "training-v1",
          course_import_upload_id: "00000000-0000-4000-8000-000000000000",
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const supabase = createClient("https://provider-shape.supabase.co", "test-key", {
      global: { fetch: fetchMock },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const report = await inspectStorageRollbackAssets({
      importId: "training-v1",
      assets: [asset("approved")],
      bucket: supabase.storage.from("content"),
    });

    expect(report.manual_review_candidates).toEqual([
      expect.objectContaining({ source_key: "asset" }),
    ]);
  });

  it("makes no object-info or download calls for held or missing assets", async () => {
    let calls = 0;
    const report = await inspectStorageRollbackAssets({
      importId: "training-v1",
      assets: [asset("hold"), asset("missing")],
      bucket: {
        async list() { return { data: [], error: null }; },
        download() { calls += 1; throw new Error("must not download"); },
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
        async list() { return { data: [{ name: "asset.hash.mp4", id: "asset-id" }], error: null }; },
        download: exactDownload,
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
    expect(report.manual_review_candidates).toEqual([]);
    expect(report.preserved).toEqual([
      expect.objectContaining({ reason: "import_ownership_or_integrity_unproven" }),
    ]);
    expect(report.closure_status).toBe("blocked");
    expect(report.unresolved_integrity_problems).not.toEqual([]);
    expect(() => assertStorageRollbackInspectionClean(report)).toThrow(/could not prove exact prefix closure/);
  });

  it("inventories the exact prefix and blocks clean rollback evidence for unexpected objects", async () => {
    const report = await inspectStorageRollbackAssets({
      importId: "training-v1",
      assets: [asset("approved")],
      bucket: {
        async list() {
          return {
            data: [
              { name: "asset.hash.mp4", id: "asset-id" },
              { name: "rogue.bin", id: "rogue-id" },
            ],
            error: null,
          };
        },
        download: exactDownload,
        async info() {
          return {
            data: {
              size: 8,
              metadata: {
                sha256: TEST_ASSET_SHA256,
                course_import_id: "training-v1",
                course_import_upload_id: "00000000-0000-4000-8000-000000000000",
              },
            },
            error: null,
          };
        },
      },
    });

    expect(report).toMatchObject({
      storage_prefix: "courses/training/v1/",
      unexpected_storage: ["courses/training/v1/rogue.bin"],
      closure_status: "blocked",
    });
    expect(() => assertStorageRollbackInspectionClean(report)).toThrow(/could not prove exact prefix closure/);
  });
});

function asset(approval_status: CourseImportAsset["approval_status"]): CourseImportAsset {
  return {
    source_key: "asset",
    kind: "video",
    local_path: "asset.mp4",
    storage_path: "courses/training/v1/asset.hash.mp4",
    mime_type: "video/mp4",
    checksum_sha256: TEST_ASSET_SHA256,
    size_bytes: 8,
    approval_status,
  };
}
