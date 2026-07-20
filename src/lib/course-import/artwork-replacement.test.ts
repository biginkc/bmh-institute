import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildImportedLessonArtworkReplacements } from "./artwork-replacement";
import { validateCourseManifest } from "./manifest";
import { buildImportPlan, type ImportPlan } from "./operations";

const oldSha = "a".repeat(64);
const newSha = "b".repeat(64);

function plan(): ImportPlan {
  return {
    importId: "example-canary-v1",
    assets: [{
      source_key: "thumbnail-slot-03",
      kind: "image",
      local_path: "course-assets/thumbnails/slot-03.webp",
      storage_path: `courses/example-canary/v1/thumbnails/slot-03-${newSha}.webp`,
      mime_type: "image/webp",
      checksum_sha256: newSha,
      size_bytes: 10,
      approval_status: "approved",
    }],
    operations: [{
      table: "lessons",
      action: "upsert",
      sourceKey: "lesson-content-slot-03",
      id: "11111111-1111-5111-a111-111111111111",
      row: {
        thumbnail_asset_key: "thumbnail-slot-03",
        thumbnail_approved_path: `courses/example-canary/v1/thumbnails/slot-03-${newSha}.webp`,
        thumbnail_approved_sha256: newSha,
        thumbnail_path: `courses/example-canary/v1/thumbnails/slot-03-${newSha}.webp`,
      },
    }],
    summary: {
      programs: 1,
      courses: 1,
      modules: 1,
      lessons: 1,
      blocks: 0,
      quizzes: 0,
      questions: 0,
      assignments: 0,
      assets: 1,
    },
  };
}

describe("imported lesson artwork replacement payload", () => {
  it("binds the exact redesign rollback point to the target manifest", () => {
    const replacements = buildImportedLessonArtworkReplacements(plan(), {
      assets: [{
        asset_key: "thumbnail-slot-03",
        current_replacement_provenance: { schema_version: "v1" },
        history: [{
          checksum_sha256: oldSha,
          archived_path: `course-assets/thumbnails/redesign-history/thumbnail-slot-03-${oldSha}.webp`,
        }],
      }],
    });

    expect(replacements).toEqual([expect.objectContaining({
      expected_thumbnail_approved_sha256: oldSha,
      expected_thumbnail_approved_path: `courses/example-canary/v1/thumbnails/slot-03-${oldSha}.webp`,
      expected_thumbnail_path: `courses/example-canary/v1/thumbnails/slot-03-${oldSha}.webp`,
      replacement_thumbnail_approved_sha256: newSha,
      replacement_thumbnail_path: `courses/example-canary/v1/thumbnails/slot-03-${newSha}.webp`,
    })]);
  });

  it("refuses a replacement without an exact rollback archive", () => {
    expect(() => buildImportedLessonArtworkReplacements(plan(), {
      assets: [{
        asset_key: "thumbnail-slot-03",
        current_replacement_provenance: {},
        history: [],
      }],
    })).toThrow(/no exact redesign rollback checksum/i);
  });

  it("builds the real canary replacement through the migration path contract", () => {
    const manifestInput = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "content/course-manifests/bmh-employee-training-canary.v1.json",
    ), "utf8")) as unknown;
    const validated = validateCourseManifest(manifestInput, { gate: "canary" });
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const ledger = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "docs/course-production/thumbnail-pilots/production-ledger.json",
    ), "utf8")) as unknown;
    const replacements = buildImportedLessonArtworkReplacements(
      buildImportPlan(validated.value),
      ledger,
    );
    const storagePath = /^courses\/[a-z0-9-]+\/v[0-9]+\/thumbnails\/[a-z0-9-]+-[0-9a-f]{64}\.webp$/;

    expect(replacements).toHaveLength(1);
    for (const replacement of replacements) {
      expect(replacement.expected_thumbnail_approved_path).toBe(replacement.expected_thumbnail_path);
      expect(replacement.replacement_thumbnail_approved_path).toBe(replacement.replacement_thumbnail_path);
      expect(replacement.expected_thumbnail_path).toMatch(storagePath);
      expect(replacement.replacement_thumbnail_path).toMatch(storagePath);
    }
  });
});
