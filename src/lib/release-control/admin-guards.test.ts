import { describe, expect, it } from "vitest";

import {
  IMPORT_RELEASE_REQUIRED_ERROR,
  IMPORT_ROLLBACK_REQUIRED_ERROR,
  importedDeletionError,
  importedPublicationError,
  normalizeReleaseControlError,
} from "./admin-guards";

describe("imported catalog release controls", () => {
  it("blocks a generic draft-to-published transition for imported content", () => {
    expect(
      importedPublicationError({
        contentImportId: "bmh-institute-v1",
        currentlyPublished: false,
        requestedPublished: true,
      }),
    ).toBe(IMPORT_RELEASE_REQUIRED_ERROR);
  });

  it("preserves reusable non-imported and non-publishing workflows", () => {
    expect(
      importedPublicationError({
        contentImportId: null,
        currentlyPublished: false,
        requestedPublished: true,
      }),
    ).toBeNull();
    expect(
      importedPublicationError({
        contentImportId: "bmh-institute-v1",
        currentlyPublished: false,
        requestedPublished: false,
      }),
    ).toBeNull();
    expect(
      importedPublicationError({
        contentImportId: "bmh-institute-v1",
        currentlyPublished: true,
        requestedPublished: false,
      }),
    ).toBeNull();
  });

  it("turns database release-control failures into an actionable admin message", () => {
    expect(
      normalizeReleaseControlError(
        "Imported catalog release requires the evidence-bound release operation.",
      ),
    ).toBe(IMPORT_RELEASE_REQUIRED_ERROR);
    expect(normalizeReleaseControlError("Network unavailable")).toBe(
      "Network unavailable",
    );
  });

  it("routes imported catalog deletion through exact rollback", () => {
    expect(importedDeletionError("bmh-institute-v1")).toBe(
      IMPORT_ROLLBACK_REQUIRED_ERROR,
    );
    expect(importedDeletionError(null)).toBeNull();
    expect(
      normalizeReleaseControlError(
        "Imported catalog graph deletion requires the exact course-import rollback operation.",
      ),
    ).toBe(IMPORT_ROLLBACK_REQUIRED_ERROR);
  });
});
