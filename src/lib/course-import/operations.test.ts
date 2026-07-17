import { describe, expect, it } from "vitest";

import { buildImportPlan, deterministicImportId } from "./operations";
import { validCourseManifest } from "./test-fixtures";

describe("buildImportPlan", () => {
  it("produces stable dependency-ordered operations", () => {
    const first = buildImportPlan(validCourseManifest());
    const second = buildImportPlan(validCourseManifest());

    expect(first).toEqual(second);
    expect(first.operations[0]).toMatchObject({ table: "role_groups", action: "upsert" });
    expect(first.operations.at(-1)).toMatchObject({ table: "program_access", action: "upsert" });
    expect(first.summary).toMatchObject({ programs: 1, courses: 1, modules: 1, lessons: 3 });
    expect(first.operations.find((operation) => operation.table === "programs")?.row.content_import_id).toBe(
      "training-v1",
    );
    expect(first.operations.find((operation) => operation.table === "courses")?.row.content_import_id).toBe(
      "training-v1",
    );
    expect(first.operations.find((operation) => operation.table === "lessons")?.row.content_import_id).toBe(
      "training-v1",
    );
    expect(first.operations.find((operation) => operation.table === "assignments")?.row.rubric).toEqual([
      { criterion: "Complete", description: "Answers every prompt." },
    ]);
  });

  it("creates UUID-shaped deterministic identifiers", () => {
    const one = deterministicImportId("training-v1", "lesson-1");
    const again = deterministicImportId("training-v1", "lesson-1");
    const other = deterministicImportId("training-v1", "lesson-2");

    expect(one).toBe(again);
    expect(one).not.toBe(other);
    expect(one).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("never persists an unproven direct storage path", () => {
    const manifest = validCourseManifest();
    manifest.program.courses[0].modules[0].lessons[0].blocks?.push({
      source_key: "raw-held-guide",
      type: "download",
      sort_order: 2,
      required: false,
      content: { file_path: "courses/other/v1/guides/held.pdf" },
    });
    expect(() => buildImportPlan(manifest)).toThrow(
      "raw-held-guide.file_path must exactly match one approved immutable asset in this import",
    );
  });

  it("rejects a direct path even when it matches a held asset key", () => {
    const manifest = validCourseManifest();
    const video = manifest.assets.find((asset) => asset.source_key === "video-1");
    const block = manifest.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!video || !block) throw new Error("Fixture video is missing.");
    video.approval_status = "hold";
    block.content.file_path = video.storage_path;
    expect(() => buildImportPlan(manifest)).toThrow(
      "block-video.file_path must exactly match one approved immutable asset in this import",
    );
  });

  it("persists exact entity-bound provenance only for approved immutable artwork", () => {
    const manifest = validCourseManifest();
    const checksum = "a".repeat(64);
    const thumbnail = manifest.assets.find((asset) => asset.source_key === "thumb-1");
    if (!thumbnail) throw new Error("Fixture thumbnail is missing.");
    thumbnail.checksum_sha256 = checksum;
    thumbnail.storage_path = `courses/training/v1/thumbnails/thumb-${checksum}.webp`;
    const plan = buildImportPlan(manifest);
    for (const table of ["programs", "courses", "lessons"] as const) {
      const rows = plan.operations.filter((operation) => operation.table === table);
      for (const operation of rows.filter((row) => row.row.thumbnail_path)) {
        expect(operation.row).toMatchObject({
          thumbnail_asset_key: "thumb-1",
          thumbnail_approved_path: thumbnail.storage_path,
          thumbnail_approved_sha256: checksum,
          thumbnail_path: thumbnail.storage_path,
        });
      }
    }
  });
});
