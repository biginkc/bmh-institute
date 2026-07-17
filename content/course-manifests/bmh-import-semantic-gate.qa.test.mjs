import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertBmhImportSemanticGate,
  validateBmhImportSemanticGate,
} from "../../scripts/course-content/import-semantic-gate.mjs";
import { loadManifest } from "../../scripts/course-content/validate-manifest.mjs";

const FULL_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const CANARY_URL = new URL("./bmh-employee-training-canary.v1.json", import.meta.url);
const CURRENT_TIME = new Date("2026-07-17T12:00:00-05:00");

test("draft validation reports BMH publication blockers without treating the report as approval", async () => {
  const manifest = await loadManifest(FULL_URL);
  const report = await validateBmhImportSemanticGate({
    manifest,
    now: CURRENT_TIME,
  });
  assert.equal(report.scope, "full");
  assert.deepEqual(report.errors, []);
  assert.ok(report.publicationBlockers.length > 0);
  assert.ok(report.publicationBlockers.some((blocker) =>
    blocker.includes("Artwork production ledger is not finalized"),
  ));
  assert.doesNotThrow(() =>
    assertBmhImportSemanticGate(report, { enforcePublicationBlockers: false }),
  );
  assert.throws(
    () => assertBmhImportSemanticGate(report, { enforcePublicationBlockers: true }),
    /BMH publication gate failed/,
  );
});

test("file-backed caption and transcript drift remains report-only for draft but blocks release", async () => {
  const manifest = await loadManifest(FULL_URL);
  const transcript = manifest.assets.find((asset) =>
    asset.source_key === "transcript-video-slot-04-humanizing-a",
  );
  assert.ok(transcript);
  transcript.checksum_sha256 = "a".repeat(64);
  transcript.storage_path = `courses/bmh-employee-training/v1/transcripts/${transcript.source_key}.${transcript.checksum_sha256}.md`;

  const report = await validateBmhImportSemanticGate({
    manifest,
    now: CURRENT_TIME,
  });
  assert.ok(report.publicationBlockers.some((blocker) =>
    blocker.includes("Caption/transcript file trust failed")
      && blocker.includes("checksum does not match"),
  ));
  assert.doesNotThrow(() =>
    assertBmhImportSemanticGate(report, { enforcePublicationBlockers: false }),
  );
  assert.throws(
    () => assertBmhImportSemanticGate(report, { enforcePublicationBlockers: true }),
    /Caption\/transcript file trust failed/,
  );
});

test("canary semantic validation cross-checks exact deterministic identity", async () => {
  const canary = await loadManifest(CANARY_URL);
  const valid = await validateBmhImportSemanticGate({
    manifest: canary,
    now: CURRENT_TIME,
  });
  assert.deepEqual(valid.errors, []);

  const swapped = structuredClone(canary);
  swapped.program.courses[0].modules[0].lessons.reverse();
  const invalid = await validateBmhImportSemanticGate({
    manifest: swapped,
    now: CURRENT_TIME,
  });
  assert.ok(invalid.errors.some((error) => error.includes("exact deterministic Tech Stack slice")));
});

test("semantic errors fail closed even in report-only draft mode", () => {
  assert.throws(
    () => assertBmhImportSemanticGate({
      errors: ["assessment policy drift"],
      publicationBlockers: [],
    }, { enforcePublicationBlockers: false }),
    /BMH semantic validation failed/,
  );
});
