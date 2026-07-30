import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import {
  assertWelcomeVideoReplacementNotRolledBack,
  runWelcomeVideoUploadAfterRollbackGuard,
} from "./welcome-video-replacement-policy";

const source = readFileSync(
  resolve(
    process.cwd(),
    "scripts/course-content/replace-released-welcome-video.ts",
  ),
  "utf8",
);
const approvalEvidence = readFileSync(
  resolve(
    process.cwd(),
    "docs/course-production/video-zero-release-2026-07-30/README.md",
  ),
  "utf8",
);

describe("released welcome video replacement CLI policy", () => {
  it("is dry-run by default and requires the complete production confirmation", () => {
    expect(source).toMatch(/execute: args\.includes\("--execute"\)/);
    expect(source).toMatch(/if \(!options\.execute\) return/);
    expect(source).toMatch(
      /!options\.execute[\s\S]*!options\.allowProduction[\s\S]*options\.confirm !== importId/,
    );
    expect(source).toMatch(
      /Execution requires --execute --allow-production --confirm=\$\{importId\}/,
    );
  });

  it("pins the exact approved master, caption, prior objects, and single source keys", () => {
    expect(source).toContain(
      "06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b",
    );
    expect(source).toContain("74_404_741");
    expect(source).toContain(
      "bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939",
    );
    expect(source).toContain("7_629");
    expect(source).toContain(
      "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72",
    );
    expect(source).toContain(
      "54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11",
    );
    expect(source).toMatch(/const VIDEO_KEY = "video-slot-01-welcome"/);
    expect(source).toMatch(
      /const CAPTION_KEY = "caption-video-slot-01-welcome"/,
    );
  });

  it("preflights catalog and storage, audits the call, and verifies paths plus duration", () => {
    expect(source).toMatch(/fn_course_import_catalog_sha256/);
    expect(source).toMatch(/verifyStorageObject/);
    expect(source).toMatch(/uploadApprovedAssets/);
    expect(source).toMatch(/fn_replace_released_imported_welcome_video/);
    expect(source).toMatch(/content_import_welcome_video_replacement_records/);
    expect(source).toMatch(/isDeepStrictEqual\(data\.content, expected\)/);
    expect(source).toMatch(/file_path: replacement\.replacement_video_path/);
    expect(source).toMatch(
      /caption_path: replacement\.replacement_caption_path/,
    );
    expect(source).toMatch(
      /duration_seconds: replacement\.replacement_duration_seconds/,
    );
    expect(source).toContain("PRIOR_DURATION_SECONDS = 246.186");
    expect(source).toContain("APPROVED_DURATION_SECONDS = 318.351");
    expect(source).toMatch(/retained_rollback_paths/);
  });

  it("ships a dry-run-first exact rollback command with audited idempotent replay", () => {
    expect(source).toMatch(/rollback: args\.includes\("--rollback"\)/);
    expect(source).toMatch(/if \(options\.rollback\)/);
    expect(source).toMatch(/fn_rollback_released_imported_welcome_video/);
    expect(source).toMatch(/content_import_welcome_video_rollback_records/);
    expect(source).toMatch(/status !== expectedStatus/);
    expect(source).toMatch(/"already_rolled_back" : "rolled_back"/);
    expect(source).toMatch(
      /!isDeepStrictEqual\(persisted\.content, PRIOR_CONTENT\)/,
    );
    expect(source).toMatch(/restoredCatalogSha256 !== EXPECTED_CATALOG_SHA256/);
    expect(source).toMatch(
      /Production welcome block is in a mixed or unknown state; refusing rollback/,
    );
  });

  it("refuses a previously rolled-back replacement before any new upload", () => {
    expect(source).toMatch(
      /await assertReplacementWasNotRolledBack\(client, importId\)[\s\S]*await verifyStorageObject/,
    );
    expect(source).toMatch(
      /runWelcomeVideoUploadAfterRollbackGuard\([\s\S]*assertReplacementWasNotRolledBack\(client, importId\)[\s\S]*uploadApprovedAssets/,
    );
    expect(source).toMatch(
      /from\("content_import_welcome_video_rollback_records"\)[\s\S]*client_payload_sha256[\s\S]*approval_evidence_sha256/,
    );
    expect(source).toMatch(
      /assertWelcomeVideoReplacementNotRolledBack\(rollback\.data\)/,
    );
  });

  it("leaves the uploader untouched when rollback evidence blocks the operation", async () => {
    let uploadCalls = 0;
    await expect(
      runWelcomeVideoUploadAfterRollbackGuard({
        assertNotRolledBack: async () => {
          throw new Error("terminal rollback evidence");
        },
        upload: async () => {
          uploadCalls += 1;
        },
      }),
    ).rejects.toThrow("terminal rollback evidence");
    expect(uploadCalls).toBe(0);
  });

  it("makes rollback terminal as a directly tested runtime policy", () => {
    expect(() => assertWelcomeVideoReplacementNotRolledBack([])).not.toThrow();
    expect(() =>
      assertWelcomeVideoReplacementNotRolledBack([{ id: "rollback-1" }]),
    ).toThrow(
      "Production welcome replacement was previously rolled back and is terminal; refusing retry before upload.",
    );
  });

  it("ships approval evidence that satisfies the runtime identity gate", () => {
    expect(approvalEvidence).toContain(
      "User approval: Jarrad Henry, 2026-07-30",
    );
    expect(approvalEvidence).toContain(
      "06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b",
    );
    expect(approvalEvidence).toContain(
      "bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939",
    );
  });
});
