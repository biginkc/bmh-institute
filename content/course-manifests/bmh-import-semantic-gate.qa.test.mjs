import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertBmhImportInvocationScope,
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

test("file-backed caption and transcript drift cannot borrow canonical release evidence", async () => {
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
  assert.ok(report.errors.some((error) => error.includes("canonical release manifest")));
  assert.throws(() =>
    assertBmhImportSemanticGate(report, { enforcePublicationBlockers: false }),
    /BMH semantic validation failed/,
  );
  assert.throws(
    () => assertBmhImportSemanticGate(report, { enforcePublicationBlockers: true }),
    /BMH semantic validation failed/,
  );
});

test("canary semantic validation cross-checks exact deterministic identity", async () => {
  const canary = await loadManifest(CANARY_URL);
  const valid = await validateBmhImportSemanticGate({
    manifest: canary,
    now: CURRENT_TIME,
  });
  assert.deepEqual(valid.errors, []);
  assert.ok(valid.publicationBlockers.every((blocker) =>
    !blocker.includes("scenario trust") && !blocker.includes("Closer Lab production"),
  ));

  const swapped = structuredClone(canary);
  swapped.program.courses[0].modules[0].lessons.reverse();
  const invalid = await validateBmhImportSemanticGate({
    manifest: swapped,
    now: CURRENT_TIME,
  });
  assert.ok(invalid.errors.some((error) => error.includes("exact deterministic Tech Stack slice")));
});

test("a canary cannot add role-play without entering the scenario trust boundary", async () => {
  const [canary, full] = await Promise.all([
    loadManifest(CANARY_URL),
    loadManifest(FULL_URL),
  ]);
  const requiredRolePlay = full.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .find((block) => block.type === "role_play" && block.required === true);
  assert.ok(requiredRolePlay);
  canary.program.courses[0].modules[0].lessons[0].blocks.push(
    structuredClone(requiredRolePlay),
  );

  const report = await validateBmhImportSemanticGate({
    manifest: canary,
    now: CURRENT_TIME,
  });
  assert.ok(report.errors.some((error) => error.includes("exact deterministic Tech Stack slice")));
  assert.ok([
    ...report.errors,
    ...report.publicationBlockers,
  ].some((message) => message.includes("canary scenario trust")));
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

test("the CLI canary flag must match the canonical BMH manifest scope", () => {
  assert.doesNotThrow(() =>
    assertBmhImportInvocationScope({ scope: "canary" }, true),
  );
  assert.doesNotThrow(() =>
    assertBmhImportInvocationScope({ scope: "full" }, false),
  );
  assert.throws(
    () => assertBmhImportInvocationScope({ scope: "canary" }, false),
    /requires --canary/,
  );
  assert.throws(
    () => assertBmhImportInvocationScope({ scope: "full" }, true),
    /cannot use --canary/,
  );
  assert.doesNotThrow(() => assertBmhImportInvocationScope(null, false));
});

test("a mutated full manifest cannot inherit canonical reconciliation evidence", async () => {
  const manifest = await loadManifest(FULL_URL);
  manifest.program.title = `${manifest.program.title} forged`;
  const report = await validateBmhImportSemanticGate({
    manifest,
    now: CURRENT_TIME,
  });
  assert.ok(report.errors.some((error) => error.includes("canonical release manifest")));
});
