import { describe, expect, it } from "vitest";

import {
  artworkMimeMatchesPath,
  isAuthorizedArtworkPath,
  manualArtworkNamespace,
  parseArtworkPath,
  validateArtworkChange,
} from "./paths";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";

describe("artwork path authorization", () => {
  it("accepts image artwork in import and record-owned namespaces", () => {
    expect(parseArtworkPath("courses/training/v1/thumbnails/cover.webp")?.namespace).toBe(
      "courses/training/v1/thumbnails/",
    );
    const manual = `${manualArtworkNamespace("course", COURSE_ID)}cover.jpg`;
    expect(
      isAuthorizedArtworkPath({ entityType: "course", entityId: COURSE_ID, contentImportId: null, path: manual }),
    ).toBe(true);
    expect(artworkMimeMatchesPath(manual, "image/jpeg")).toBe(true);
  });

  it.each([
    "courses/other/v2/videos/held-private-cut.mp4",
    "courses/other/v2/thumbnails/cover.svg",
    "../thumbnails/cover.webp",
    "https://example.test/cover.webp",
  ])("rejects non-artwork path %s", (path) => {
    expect(parseArtworkPath(path)).toBeNull();
  });

  it("rejects mismatched MIME and cross-record manual paths", () => {
    const other = `${manualArtworkNamespace("course", "22222222-2222-4222-8222-222222222222")}cover.webp`;
    expect(artworkMimeMatchesPath(other, "video/mp4")).toBe(false);
    expect(
      isAuthorizedArtworkPath({ entityType: "course", entityId: COURSE_ID, contentImportId: null, path: other }),
    ).toBe(false);
  });

  it("does not let an imported record switch to another import namespace", () => {
    expect(
      validateArtworkChange({
        entityType: "course",
        entityId: COURSE_ID,
        contentImportId: "training-v1",
        currentPath: "courses/training/v1/thumbnails/cover.webp",
        nextPath: "courses/other/v1/thumbnails/cover.webp",
      }),
    ).toContain("authorized import namespace");
  });

  it("fails closed when database artwork provenance disagrees with the path", () => {
    expect(
      isAuthorizedArtworkPath({
        entityType: "course",
        entityId: COURSE_ID,
        contentImportId: "training-v1",
        path: "courses/other/v1/thumbnails/cover.webp",
      }),
    ).toBe(false);
  });
});
