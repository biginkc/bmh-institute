import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELEASED_CONTENT_BLOCK_REVISION,
  assertReleasedContentBlockInitialOrRevisedState,
  assertReleasedContentBlockRevisedState,
  buildReleasedContentBlockRevision,
  matchesReleasedContentBlockMutation,
  releasedContentBlockRevisionConfirmation,
  releasedContentBlockRevisionPayloadSha256,
} from "./released-content-block-revision";

const legacyManifest = readFileSync(resolve(
  process.cwd(),
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
));
const targetManifest = readFileSync(resolve(
  process.cwd(),
  "content/course-manifests/bmh-employee-training.v1.json",
));

describe("released content block revision", () => {
  it("builds the exact 44-block production delta", () => {
    const revision = buildReleasedContentBlockRevision({
      legacyManifest,
      targetManifest,
    });

    expect(revision.mutations).toHaveLength(44);
    expect(revision.summary).toEqual({
      guide_updates: 19,
      flashcard_updates: 19,
      role_play_inserts: 6,
    });
    expect(new Set(revision.mutations.map((mutation) => mutation.block_id))).toHaveLength(44);
    expect(revision.mutations.filter((mutation) =>
      mutation.action === "update" && mutation.block_type === "download"
    )).toHaveLength(19);
    expect(revision.mutations.filter((mutation) =>
      mutation.action === "update" && mutation.block_type === "flashcard"
    )).toHaveLength(19);
    expect(revision.mutations.filter((mutation) =>
      mutation.action === "insert" && mutation.block_type === "role_play"
    )).toHaveLength(6);
  });

  it("binds each guide update to an immutable checksum-addressed PDF", () => {
    const revision = buildReleasedContentBlockRevision({
      legacyManifest,
      targetManifest,
    });
    const guides = revision.mutations.filter((mutation) =>
      mutation.action === "update" && mutation.block_type === "download"
    );

    for (const guide of guides) {
      const replacement = guide.replacement_content as Record<string, unknown>;
      expect(replacement.file_path).toMatch(
        /^courses\/bmh-employee-training\/v1\/guides\/guide-slot-\d{2}\.[0-9a-f]{64}\.pdf$/,
      );
      expect(replacement.filename).toMatch(/^slot-\d{2}-learner-guide\.pdf$/);
      expect(replacement.size_bytes).toBeGreaterThan(0);
      expect(guide.expected_content).not.toEqual(guide.replacement_content);
    }
  });

  it("is byte-pinned to the immutable release archive and current target manifest", () => {
    const changedTarget = Buffer.from(targetManifest);
    changedTarget[changedTarget.length - 2] = changedTarget[changedTarget.length - 2] === 10 ? 32 : 10;

    expect(() => buildReleasedContentBlockRevision({
      legacyManifest,
      targetManifest: changedTarget,
    })).toThrow(/target manifest checksum/i);

    const changedLegacy = Buffer.from(legacyManifest);
    changedLegacy[changedLegacy.length - 2] = changedLegacy[changedLegacy.length - 2] === 10 ? 32 : 10;
    expect(() => buildReleasedContentBlockRevision({
      legacyManifest: changedLegacy,
      targetManifest,
    })).toThrow(/legacy manifest checksum/i);
  });

  it("produces a stable payload checksum and explicit operator confirmation", () => {
    const revision = buildReleasedContentBlockRevision({
      legacyManifest,
      targetManifest,
    });
    const payloadSha256 = releasedContentBlockRevisionPayloadSha256(revision.mutations);

    expect(payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(releasedContentBlockRevisionConfirmation({
      expectedCatalogSha256: RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
      payloadSha256,
    })).toBe([
      "REVISE-RELEASED-CONTENT-BLOCKS",
      "bmh-employee-training-v1",
      RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256,
      RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
      RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
      payloadSha256,
      "19",
      "19",
      "6",
    ].join(":"));
  });

  it("compares live JSONB content without depending on object key order", () => {
    const revision = buildReleasedContentBlockRevision({
      legacyManifest,
      targetManifest,
    });
    const mutation = revision.mutations[0];
    const content = Object.fromEntries(
      Object.entries(mutation.expected_content ?? {}).reverse(),
    );
    const row = {
      id: mutation.block_id,
      lesson_id: mutation.lesson_id,
      block_type: mutation.block_type,
      content,
      sort_order: mutation.sort_order,
      is_required_for_completion: mutation.is_required_for_completion,
    };

    expect(matchesReleasedContentBlockMutation(row, mutation, "expected")).toBe(true);
    row.content = { ...content, forged: true };
    expect(matchesReleasedContentBlockMutation(row, mutation, "expected")).toBe(false);
  });

  it("accepts only the exact all-prior or all-revised 44-row state", () => {
    const revision = buildReleasedContentBlockRevision({
      legacyManifest,
      targetManifest,
    });
    const rows = (state: "expected" | "replacement") =>
      revision.mutations
        .filter((mutation) => state === "replacement" || mutation.action === "update")
        .map((mutation) => ({
          id: mutation.block_id,
          lesson_id: mutation.lesson_id,
          block_type: mutation.block_type,
          content: state === "expected"
            ? mutation.expected_content!
            : mutation.replacement_content,
          sort_order: mutation.sort_order,
          is_required_for_completion: mutation.is_required_for_completion,
        }));

    expect(assertReleasedContentBlockInitialOrRevisedState(
      rows("expected"),
      revision.mutations,
    )).toBe("initial");
    expect(assertReleasedContentBlockInitialOrRevisedState(
      rows("replacement"),
      revision.mutations,
    )).toBe("already_revised");
    expect(() => assertReleasedContentBlockRevisedState(
      rows("replacement").slice(0, -1),
      revision.mutations,
    )).toThrow(/expected 44 target rows/i);

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
    expect(() => assertReleasedContentBlockInitialOrRevisedState(
      partial,
      revision.mutations,
    )).toThrow(/partially inserted target/i);
  });
});
