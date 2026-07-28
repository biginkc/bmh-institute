import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELEASED_CONTENT_BLOCK_REVISION,
  buildReleasedContentBlockRevision,
} from "./released-content-block-revision";
import { buildReleasedContentBlockRevisionAssetReceiptExpectation } from "./released-content-block-revision-receipt";
import type { CourseImportAsset } from "./manifest";

// Round-3 Codex review of PR #130 caught this class of drift for real: a
// prior session regenerated the whole-file manifest hash this command is
// pinned to and quietly pointed it at whatever the LIVE, still-evolving
// manifest currently hashes to, instead of leaving it pointed at the
// archived, immutable target this specific historical
// fn_revise_released_content_blocks_v1 operation was actually built and
// applied against. That would have made a real apply, retry, or receipt
// verification through this path fail closed with a checksum-pin mismatch,
// and disagree with production evidence already tied to the historical
// value. This test locks the TypeScript pin, the SQL function's hardcoded
// literal, and the archived manifest snapshot together so any future drift
// between them fails CI immediately, whatever the live manifest does.

const SQL_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260726170000_revise_released_content_blocks.sql",
);
const ARCHIVED_TARGET_MANIFEST_PATH = resolve(
  process.cwd(),
  "content/course-manifests/archive/bmh-employee-training.released-content-block-revision-target-20260726.v1.json",
);
const LEGACY_MANIFEST_PATH = resolve(
  process.cwd(),
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
);
const LIVE_MANIFEST_PATH = resolve(
  process.cwd(),
  "content/course-manifests/bmh-employee-training.v1.json",
);

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("released content block revision checksum pin", () => {
  it("matches the SQL function's hardcoded v_target_manifest_sha256 literal", () => {
    const sql = readFileSync(SQL_PATH, "utf8");
    const match = /v_target_manifest_sha256 constant text :=\s*\n?\s*'([0-9a-f]{64})'/.exec(
      sql,
    );
    if (!match) {
      throw new Error(
        "Could not locate v_target_manifest_sha256 in the SQL migration -- update this test's extraction regex.",
      );
    }
    expect(RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256).toBe(
      match[1],
    );
  });

  it("matches the immutable archived target manifest's real SHA-256 bytes", () => {
    const archived = readFileSync(ARCHIVED_TARGET_MANIFEST_PATH);
    expect(sha256(archived)).toBe(
      RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    );
  });

  it("is NOT equal to the live, still-evolving manifest's current hash", () => {
    // This is the actual regression this test class exists to catch: the
    // live manifest keeps changing for reasons unrelated to this historical
    // operation (e.g. gaining the Andrea Oral Check pilot's 3 new
    // role_play blocks), so it must never coincidentally re-equal the pin
    // by construction. If this assertion ever legitimately fails because
    // someone reverted the live manifest back to this exact byte content,
    // that's fine -- but it must never be "fixed" by regenerating the pin
    // to chase the live manifest again.
    const live = readFileSync(LIVE_MANIFEST_PATH);
    expect(sha256(live)).not.toBe(
      RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    );
  });

  it("builds the receipt contract's target_manifest_sha256 from the pinned archive, not the live manifest", () => {
    const legacyManifest = readFileSync(LEGACY_MANIFEST_PATH);
    const targetManifest = readFileSync(ARCHIVED_TARGET_MANIFEST_PATH);
    const revision = buildReleasedContentBlockRevision({
      legacyManifest,
      targetManifest,
    });

    const guideAssets: CourseImportAsset[] = revision.mutations
      .filter((mutation) => mutation.block_type === "download")
      .map((mutation) => ({
        source_key: mutation.source_key,
        kind: "pdf" as const,
        approval_status: "approved" as const,
        local_path: String(mutation.replacement_content.file_path),
        storage_path: String(mutation.replacement_content.file_path),
        mime_type: "application/pdf",
        size_bytes: mutation.replacement_size_bytes,
        checksum_sha256: mutation.replacement_sha256,
      }));

    const receiptExpectation =
      buildReleasedContentBlockRevisionAssetReceiptExpectation({
        targetManifest,
        importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
        clientPayloadSha256:
          RELEASED_CONTENT_BLOCK_REVISION.expectedClientPayloadSha256,
        environment: "production",
        environmentUrl: "https://example.supabase.co",
        guideAssets,
        mutations: revision.mutations,
      });

    expect(receiptExpectation.target_manifest_sha256).toBe(
      RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    );

    // And using the live manifest bytes in the same receipt-building path
    // must be refused, not silently accepted -- proving the receipt
    // contract itself would fail closed on this class of drift, not just
    // this test.
    const liveManifest = readFileSync(LIVE_MANIFEST_PATH);
    expect(() =>
      buildReleasedContentBlockRevisionAssetReceiptExpectation({
        targetManifest: liveManifest,
        importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
        clientPayloadSha256:
          RELEASED_CONTENT_BLOCK_REVISION.expectedClientPayloadSha256,
        environment: "production",
        environmentUrl: "https://example.supabase.co",
        guideAssets,
        mutations: revision.mutations,
      })
    ).toThrow(/checksum pin mismatch/i);
  });
});
