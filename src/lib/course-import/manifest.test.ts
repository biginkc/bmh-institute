import { describe, expect, it } from "vitest";

import { validateCanaryScope, validateCourseManifest } from "./manifest";
import { validCourseManifest } from "./test-fixtures";

describe("validateCourseManifest", () => {
  it("accepts a complete unpublished draft manifest", () => {
    const result = validateCourseManifest(validCourseManifest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.program.courses[0].modules[0].lessons).toHaveLength(3);
  });

  it("rejects publication, duplicate keys, and unresolved asset references", () => {
    const input = validCourseManifest();
    (input.program as { is_published: boolean }).is_published = true;
    input.assets[1].source_key = input.assets[0].source_key;
    const lesson = input.program.courses[0].modules[0].lessons[0];
    lesson.thumbnail_asset_key = "missing-thumbnail";

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("program.is_published must be false"),
        expect.stringContaining("Duplicate source_key"),
        expect.stringContaining("missing-thumbnail"),
      ]),
    );
  });

  it("rejects invalid lesson payloads and unapproved required media", () => {
    const input = validCourseManifest();
    input.assets[0].approval_status = "hold";
    input.program.courses[0].modules[0].lessons[0].quiz =
      input.program.courses[0].modules[0].lessons[1].quiz;

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("required asset video-1 is not approved"),
        expect.stringContaining("content lesson"),
      ]),
    );
  });

  it("requires release assets to use immutable import-owned storage paths", () => {
    const input = validCourseManifest();
    input.assets[0].checksum_sha256 = "a".repeat(64);
    input.assets[0].storage_path = "courses/another-import/video.mp4";

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must be owned by courses/training/v1/"),
        expect.stringContaining("must include its SHA-256 checksum"),
      ]),
    );
  });

  it("requires a poster asset reference on every release video", () => {
    const input = validCourseManifest();
    const video = input.program.courses[0].modules[0].lessons[0].blocks?.[0];
    if (!video) throw new Error("Fixture video block is missing.");
    delete video.content.poster_asset_key;

    const result = validateCourseManifest(input, { gate: "release" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "program.courses[0].modules[0].lessons[0].blocks[0].content.poster_asset_key is required for release.",
    );
  });

  it("rejects using the full manifest as a canary", () => {
    const input = validCourseManifest();
    expect(validateCanaryScope(input)).toEqual(
      expect.arrayContaining([
        "Canary import_id must include canary.",
        "Canary manifest must contain exactly one Tech Stack content lesson.",
      ]),
    );
  });
});
