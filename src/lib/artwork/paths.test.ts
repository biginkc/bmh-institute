import { describe, expect, it } from "vitest";

import {
  artworkMimeMatchesPath,
  isAuthorizedArtworkPath,
  manualArtworkNamespace,
  parseArtworkPath,
  validateArtworkChange,
} from "./paths";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const SHA = "a".repeat(64);
const APPROVED_PATH = `courses/training/v1/thumbnails/course-${SHA}.webp`;
const manualProvenance = {
  contentImportId: null,
  thumbnailAssetKey: null,
  thumbnailApprovedPath: null,
  thumbnailApprovedSha256: null,
} as const;
const importedProvenance = {
  contentImportId: "training-v1",
  thumbnailAssetKey: "thumbnail-course",
  thumbnailApprovedPath: APPROVED_PATH,
  thumbnailApprovedSha256: SHA,
} as const;

describe("artwork path authorization", () => {
  it("accepts image artwork in import and record-owned namespaces", () => {
    expect(parseArtworkPath("courses/training/v1/thumbnails/cover.webp")?.namespace).toBe(
      "courses/training/v1/thumbnails/",
    );
    const manual = `${manualArtworkNamespace("course", COURSE_ID)}cover.jpg`;
    expect(
      isAuthorizedArtworkPath({ entityType: "course", entityId: COURSE_ID, ...manualProvenance, path: manual }),
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
      isAuthorizedArtworkPath({ entityType: "course", entityId: COURSE_ID, ...manualProvenance, path: other }),
    ).toBe(false);
  });

  it("does not let an imported record switch to another import namespace", () => {
    expect(
      validateArtworkChange({
        entityType: "course",
        entityId: COURSE_ID,
        ...importedProvenance,
        currentPath: APPROVED_PATH,
        nextPath: "courses/other/v1/thumbnails/cover.webp",
      }),
    ).toContain("authorized import namespace");
  });

  it("fails closed when database artwork provenance disagrees with the path", () => {
    expect(
      isAuthorizedArtworkPath({
        entityType: "course",
        entityId: COURSE_ID,
        ...importedProvenance,
        path: "courses/other/v1/thumbnails/cover.webp",
      }),
    ).toBe(false);
  });

  it("binds imported artwork to the exact approved path for this entity", () => {
    expect(
      isAuthorizedArtworkPath({
        entityType: "course",
        entityId: COURSE_ID,
        ...importedProvenance,
        path: APPROVED_PATH,
      }),
    ).toBe(true);
    expect(
      isAuthorizedArtworkPath({
        entityType: "course",
        entityId: COURSE_ID,
        ...importedProvenance,
        path: `courses/training/v1/thumbnails/another-entity-${SHA}.webp`,
      }),
    ).toBe(false);
  });

  it("revalidates an unchanged current path instead of preserving tampering", () => {
    const forged = "courses/other/v1/thumbnails/forged.webp";
    expect(
      validateArtworkChange({
        entityType: "course",
        entityId: COURSE_ID,
        ...importedProvenance,
        currentPath: forged,
        nextPath: forged,
      }),
    ).toContain("authorized import namespace");
  });
});
