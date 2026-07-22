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

test("draft validation accepts the approved release without requiring deferred Closer Lab scenarios", async () => {
  const manifest = await loadManifest(FULL_URL);
  const report = await validateBmhImportSemanticGate({
    manifest,
    now: CURRENT_TIME,
  });
  assert.equal(report.scope, "full");
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.publicationBlockers, []);
  assert.ok(report.publicationBlockers.every((blocker) =>
    !blocker.includes("Artwork production ledger is not finalized"),
  ));
  assert.ok(report.publicationBlockers.every((blocker) =>
    !blocker.includes("requires a policy-safe replacement cut"),
  ));
  assert.doesNotThrow(() =>
    assertBmhImportSemanticGate(report, { enforcePublicationBlockers: false }),
  );
  assert.doesNotThrow(
    () => assertBmhImportSemanticGate(report, { enforcePublicationBlockers: true }),
  );
});

test("file-backed caption drift cannot borrow canonical release evidence", async () => {
  const manifest = await loadManifest(FULL_URL);
  const caption = manifest.assets.find((asset) =>
    asset.source_key === "caption-video-slot-04-humanizing-a",
  );
  assert.ok(caption);
  caption.checksum_sha256 = "a".repeat(64);
  caption.storage_path = `courses/bmh-employee-training/v1/captions/${caption.source_key}.${caption.checksum_sha256}.vtt`;

  const report = await validateBmhImportSemanticGate({
    manifest,
    now: CURRENT_TIME,
  });
  assert.ok(report.publicationBlockers.some((blocker) =>
    blocker.includes("Caption file trust failed")
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

test("an expired operating-stack confirmation remains a canary publication blocker", async () => {
  const canary = await loadManifest(CANARY_URL);
  const report = await validateBmhImportSemanticGate({
    manifest: canary,
    now: new Date("2026-07-24T12:00:00-05:00"),
  });
  assert.deepEqual(report.errors, []);
  assert.ok(report.publicationBlockers.some((blocker) =>
    blocker.includes("DialPad references require a valid current-stack confirmation"),
  ));
  assert.throws(
    () => assertBmhImportSemanticGate(report, { enforcePublicationBlockers: true }),
    /BMH publication gate failed/,
  );
});

test("a canary cannot add role-play without entering the scenario trust boundary", async () => {
  const canary = await loadManifest(CANARY_URL);
  const requiredRolePlay = {
    source_key: "block-role-play-deferred-test",
    type: "role_play",
    sort_order: 99,
    required: true,
    content: {
      scenario_id: "pending:deferred-test",
      scenario_spec: {
        assignment_source_key: "assignment-section-3",
        context: "Deferred test context",
        learner_goal: "Deferred test goal",
        success_criteria: ["one", "two", "three", "four"],
        fail_conditions: ["one", "two", "three"],
      },
    },
  };
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
