import { describe, expect, it } from "vitest";

import type { CourseImportManifest } from "./manifest";
import { validCourseManifest } from "./test-fixtures";
import {
  assertReleasedContentBlockRevisionV2InitialOrRevisedState,
  assertReleasedContentBlockRevisionV2RevisedState,
  buildReleasedContentBlockRevisionV2,
  matchesReleasedContentBlockRevisionV2Mutation,
  releasedContentBlockRevisionV2ClientPayloadSha256,
  releasedContentBlockRevisionV2Confirmation,
  releasedContentBlockRevisionV2RollbackConfirmation,
} from "./released-content-block-revision-v2";

function buffer(manifest: CourseImportManifest) {
  return Buffer.from(JSON.stringify(manifest), "utf8");
}

/**
 * The shared `validCourseManifest()` fixture is only shaped for the default
 * "draft" gate. This module's builder validates the target manifest at the
 * stricter "release" gate (mirroring the one-shot revision's own target-
 * manifest check), so trim the fixture to a single content lesson with a
 * single non-video block -- avoiding the release-only asset-checksum,
 * video-poster/caption, and 15-question-quiz requirements that have nothing
 * to do with what this file actually tests (content-block diffing).
 */
function releaseReadyManifest(): CourseImportManifest {
  const manifest = validCourseManifest();
  for (const asset of manifest.assets) {
    const sha = "0".repeat(64);
    asset.checksum_sha256 = sha;
    asset.storage_path = asset.storage_path.replace(/(\.[a-z0-9]+)$/, `.${sha}$1`);
  }
  const lesson = manifest.program.courses[0].modules[0].lessons[0];
  lesson.blocks = [
    {
      source_key: "block-cards",
      type: "flashcard",
      sort_order: 0,
      required: false,
      content: { cards: [{ front: "BMH", back: "Better Made Homes" }] },
    },
  ];
  manifest.program.courses[0].modules[0].lessons = [lesson];
  return manifest;
}

/** Returns the sole content lesson's blocks array, which is where every test
 * in this file makes its edits. */
function blocksOf(manifest: CourseImportManifest) {
  return manifest.program.courses[0].modules[0].lessons[0].blocks!;
}

describe("released content block revision v2 (versioned, variable-count builder)", () => {
  it("derives one update and one insert mutation from an arbitrary manifest diff", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    blocksOf(target)[0] = {
      ...blocksOf(target)[0],
      content: { cards: [{ front: "BMH", back: "Better Made Homes, revised" }] },
    };
    blocksOf(target).push({
      source_key: "block-oral-check-pilot-1",
      type: "role_play",
      sort_order: 1,
      required: false,
      content: {
        mode: "oral_check",
        scenario_id: "pending:oral-check-pilot-1",
        title: "Talk with Andrea: Pilot One",
        height_px: 760,
      },
    });

    const revision = buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    });

    expect(revision.summary).toEqual({ mutation_count: 2, update_count: 1, insert_count: 1 });
    expect(new Set(revision.mutations.map((mutation) => mutation.block_id)).size).toBe(2);

    const update = revision.mutations.find((mutation) => mutation.action === "update")!;
    expect(update.source_key).toBe("block-cards");
    expect(update.block_type).toBe("flashcard");
    expect(update.expected_content).not.toEqual(update.replacement_content);
    expect(update.replacement_content).toEqual({
      cards: [{ front: "BMH", back: "Better Made Homes, revised" }],
    });

    const insert = revision.mutations.find((mutation) => mutation.action === "insert")!;
    expect(insert.source_key).toBe("block-oral-check-pilot-1");
    expect(insert.block_type).toBe("role_play");
    expect(insert.expected_content).toBeNull();
    expect(insert.is_required_for_completion).toBe(false);
    expect(insert.replacement_content).toMatchObject({
      mode: "oral_check",
      scenario_id: "pending:oral-check-pilot-1",
    });
  });

  it("supports a completely different mutation count than any prior publish (not hardcoded to 44, or any other fixed number)", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    for (let index = 0; index < 7; index += 1) {
      blocksOf(target).push({
        source_key: `block-oral-check-many-${index}`,
        type: "role_play",
        sort_order: 1 + index,
        required: false,
        content: { mode: "oral_check", scenario_id: `pending:oral-check-many-${index}` },
      });
    }

    const revision = buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    });

    expect(revision.summary).toEqual({ mutation_count: 7, update_count: 0, insert_count: 7 });
  });

  it("refuses a no-op diff instead of returning an empty mutation set", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();

    expect(() => buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    })).toThrow(/no drift was found/i);
  });

  it("refuses to remove a previously-released block", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    blocksOf(target).splice(0, 1);
    // A manifest with zero blocks on a content lesson is itself invalid, so
    // give the target lesson one harmless, unrelated block to isolate the
    // removal-refusal behavior from that separate structural rule.
    blocksOf(target).push({
      source_key: "block-unrelated",
      type: "text",
      sort_order: 0,
      required: false,
      content: { html: "<p>Unrelated.</p>" },
    });

    expect(() => buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    })).toThrow(/does not support removing/i);
  });

  it("refuses reparenting or retyping a released block instead of misreading it as a fresh insert", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    blocksOf(target)[0] = { ...blocksOf(target)[0], type: "text", content: { html: "<p>Retyped</p>" } };

    expect(() => buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    })).toThrow(/retyping/i);
  });

  it("refuses a mismatched import_id between the two manifests", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    target.import_id = "a-different-import-v1";
    blocksOf(target)[0] = { ...blocksOf(target)[0], content: { cards: [{ front: "X", back: "Y" }] } };

    expect(() => buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    })).toThrow(/import_id/i);
  });

  it("binds a download update to its immutable, content-addressed asset path", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    const legacySha = "0".repeat(64);
    const sha = "1".repeat(64);
    const legacyPath = `courses/training/v1/guides/guide.${legacySha}.pdf`;
    const targetPath = `courses/training/v1/guides/guide.${sha}.pdf`;
    legacy.assets.push({
      source_key: "guide-pdf", kind: "pdf", local_path: "assets/guide.pdf",
      storage_path: legacyPath, mime_type: "application/pdf",
      checksum_sha256: legacySha, size_bytes: 10, approval_status: "approved",
    });
    target.assets.push({
      source_key: "guide-pdf", kind: "pdf", local_path: "assets/guide.pdf",
      storage_path: targetPath, mime_type: "application/pdf",
      checksum_sha256: sha, size_bytes: 20, approval_status: "approved",
    });
    blocksOf(legacy).push({
      source_key: "block-download",
      type: "download",
      sort_order: 1,
      required: false,
      content: { asset_key: "guide-pdf", file_path: legacyPath, size_bytes: 10 },
    });
    blocksOf(target).push({
      source_key: "block-download",
      type: "download",
      sort_order: 1,
      required: false,
      content: { asset_key: "guide-pdf", file_path: targetPath, size_bytes: 20 },
    });

    const revision = buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    });
    const update = revision.mutations.find((mutation) => mutation.source_key === "block-download")!;
    expect(update.replacement_sha256).toBe(sha);
    expect(update.replacement_size_bytes).toBe(20);
  });

  it("produces stable payload checksums and explicit, non-hardcoded operator confirmations", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    blocksOf(target)[0] = { ...blocksOf(target)[0], content: { cards: [{ front: "X", back: "Y" }] } };

    const revision = buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    });
    const clientPayloadSha256 = releasedContentBlockRevisionV2ClientPayloadSha256(revision.mutations);
    expect(clientPayloadSha256).toMatch(/^[0-9a-f]{64}$/);

    const confirmation = releasedContentBlockRevisionV2Confirmation({
      importId: legacy.import_id,
      expectedPriorManifestSha256: "1".repeat(64),
      manifestSha256: "2".repeat(64),
      expectedPriorCatalogSha256: "3".repeat(64),
      clientPayloadSha256,
      mutationCount: revision.summary.mutation_count,
    });
    expect(confirmation).toBe(
      `REVISE-RELEASED-CONTENT-BLOCKS-V2:${legacy.import_id}:${"1".repeat(64)}:${"2".repeat(64)}:${"3".repeat(64)}:${clientPayloadSha256}:1`,
    );

    const rollbackConfirmation = releasedContentBlockRevisionV2RollbackConfirmation({
      importId: legacy.import_id,
      expectedRevision: 3,
      manifestSha256: "2".repeat(64),
      priorManifestSha256: "1".repeat(64),
      rollbackSha256: "4".repeat(64),
    });
    expect(rollbackConfirmation).toBe(
      `ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:${legacy.import_id}:3:${"2".repeat(64)}:${"1".repeat(64)}:${"4".repeat(64)}`,
    );
  });

  it("compares live JSONB content without depending on object key order", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    blocksOf(target)[0] = { ...blocksOf(target)[0], content: { cards: [{ front: "X", back: "Y" }] } };
    const revision = buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    });
    const mutation = revision.mutations[0];
    const reversed = Object.fromEntries(Object.entries(mutation.expected_content ?? {}).reverse());
    const row = {
      id: mutation.block_id,
      lesson_id: mutation.lesson_id,
      block_type: mutation.block_type,
      content: reversed,
      sort_order: mutation.sort_order,
      is_required_for_completion: mutation.is_required_for_completion,
    };

    expect(matchesReleasedContentBlockRevisionV2Mutation(row, mutation, "expected")).toBe(true);
    row.content = { ...reversed, forged: true };
    expect(matchesReleasedContentBlockRevisionV2Mutation(row, mutation, "expected")).toBe(false);
  });

  it("accepts only the exact all-prior or all-revised row state for an arbitrary N-row payload", () => {
    const legacy = releaseReadyManifest();
    const target = releaseReadyManifest();
    blocksOf(target)[0] = { ...blocksOf(target)[0], content: { cards: [{ front: "X", back: "Y" }] } };
    blocksOf(target).push({
      source_key: "block-oral-check-pilot-1",
      type: "role_play",
      sort_order: 1,
      required: false,
      content: { mode: "oral_check", scenario_id: "pending:oral-check-pilot-1" },
    });
    const revision = buildReleasedContentBlockRevisionV2({
      importId: legacy.import_id,
      legacyManifest: buffer(legacy),
      targetManifest: buffer(target),
    });

    const rows = (state: "expected" | "replacement") =>
      revision.mutations
        .filter((mutation) => state === "replacement" || mutation.action === "update")
        .map((mutation) => ({
          id: mutation.block_id,
          lesson_id: mutation.lesson_id,
          block_type: mutation.block_type,
          content: state === "expected" ? mutation.expected_content! : mutation.replacement_content,
          sort_order: mutation.sort_order,
          is_required_for_completion: mutation.is_required_for_completion,
        }));

    expect(assertReleasedContentBlockRevisionV2InitialOrRevisedState(rows("expected"), revision.mutations))
      .toBe("initial");
    expect(assertReleasedContentBlockRevisionV2InitialOrRevisedState(rows("replacement"), revision.mutations))
      .toBe("already_revised");
    expect(() => assertReleasedContentBlockRevisionV2RevisedState(
      rows("replacement").slice(0, -1),
      revision.mutations,
    )).toThrow(/expected 2 target rows/i);

    const partial = rows("expected");
    const inserted = revision.mutations.find((mutation) => mutation.action === "insert")!;
    partial.push({
      id: inserted.block_id,
      lesson_id: inserted.lesson_id,
      block_type: inserted.block_type,
      content: inserted.replacement_content,
      sort_order: inserted.sort_order,
      is_required_for_completion: inserted.is_required_for_completion,
    });
    expect(() => assertReleasedContentBlockRevisionV2InitialOrRevisedState(partial, revision.mutations))
      .toThrow(/partially inserted target/i);
  });
});
