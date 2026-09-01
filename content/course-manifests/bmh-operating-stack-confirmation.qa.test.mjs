import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import {
  collectDialPadReferences,
  dialPadReferenceSha256,
  validateManifest,
  validateStackConfirmation,
} from "../../scripts/course-content/validate-manifest.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const CURRENT_TIME = new Date("2026-09-02T00:00:00-05:00");

async function loadJson(name) {
  return JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"));
}

test("current confirmation covers the full and canary DialPad references", async () => {
  const [full, canary, confirmation] = await Promise.all([
    loadJson("./bmh-employee-training.v1.json"),
    loadJson("./bmh-employee-training-canary.v1.json"),
    loadJson("./bmh-operating-stack-confirmation.v1.json"),
  ]);

  assert.equal(collectDialPadReferences(full).length, 24);
  assert.equal(collectDialPadReferences(canary).length, 14);
  assert.equal(
    dialPadReferenceSha256(full),
    "60554238e7a5d975446ed2a8867094fcb8873107c749c4c0c5683aff2d990a94",
  );
  assert.equal(
    dialPadReferenceSha256(canary),
    "17059068d3332ecf4a648501ed066a426d30fd6e79285e2c058e5da13941fae7",
  );
  assert.deepEqual(validateStackConfirmation(full, confirmation, CURRENT_TIME), []);
  assert.deepEqual(validateStackConfirmation(canary, confirmation, CURRENT_TIME), []);

  const report = validateManifest(full, {
    stackConfirmation: confirmation,
    now: CURRENT_TIME,
  });
  assert.ok(
    report.publicationBlockers.every(
      (blocker) => !blocker.includes("DialPad references"),
    ),
  );
});

test("checked-in confirmation is current at the actual verification time", async () => {
  const [full, canary, confirmation] = await Promise.all([
    loadJson("./bmh-employee-training.v1.json"),
    loadJson("./bmh-employee-training-canary.v1.json"),
    loadJson("./bmh-operating-stack-confirmation.v1.json"),
  ]);
  const actualVerificationTime = new Date();

  assert.deepEqual(
    validateStackConfirmation(full, confirmation, actualVerificationTime),
    [],
  );
  assert.deepEqual(
    validateStackConfirmation(canary, confirmation, actualVerificationTime),
    [],
  );
});

test("confirmation fails closed when missing, stale, scoped incorrectly, or mismatched", async () => {
  const [manifest, confirmation] = await Promise.all([
    loadJson("./bmh-employee-training.v1.json"),
    loadJson("./bmh-operating-stack-confirmation.v1.json"),
  ]);
  const clone = () => structuredClone(confirmation);

  assert.match(
    validateStackConfirmation(manifest, null, CURRENT_TIME).join(" "),
    /missing/,
  );
  assert.match(
    validateStackConfirmation(
      manifest,
      confirmation,
      new Date("2026-09-09T00:00:00-05:00"),
    ).join(" "),
    /expired/,
  );

  const badDigest = clone();
  badDigest.manifest_snapshots[0].dialpad_reference_sha256 = "0".repeat(64);
  assert.match(
    validateStackConfirmation(manifest, badDigest, CURRENT_TIME).join(" "),
    /checksum does not match/,
  );

  const badAsset = clone();
  badAsset.audited_assets[0].checksum_sha256 = "0".repeat(64);
  assert.match(
    validateStackConfirmation(manifest, badAsset, CURRENT_TIME).join(" "),
    /asset drifted/,
  );

  const badBoundary = clone();
  badBoundary.scope.system_boundaries.jitter_employee_readiness = "employee-ready";
  assert.match(
    validateStackConfirmation(manifest, badBoundary, CURRENT_TIME).join(" "),
    /provider boundaries/,
  );

  const badEvidence = clone();
  badEvidence.source_evidence[0].sha256 = "0".repeat(64);
  assert.match(
    validateStackConfirmation(manifest, badEvidence, CURRENT_TIME).join(" "),
    /source evidence checksum/,
  );

  const noDrift = clone();
  delete noDrift.known_content_drift;
  assert.match(
    validateStackConfirmation(manifest, noDrift, CURRENT_TIME).join(" "),
    /known_content_drift/,
  );

  const emptyDriftEntry = clone();
  emptyDriftEntry.known_content_drift[0].remediation = "  ";
  assert.match(
    validateStackConfirmation(manifest, emptyDriftEntry, CURRENT_TIME).join(" "),
    /known_content_drift/,
  );

  // Placeholder metadata is not disclosure: naming the right surface with a
  // detail of "x" tells a reviewer nothing about what is wrong.
  const placeholderDetail = clone();
  placeholderDetail.known_content_drift[0].detail = "x";
  assert.match(
    validateStackConfirmation(manifest, placeholderDetail, CURRENT_TIME).join(" "),
    /known_content_drift must list/,
  );

  const placeholderRemediation = clone();
  placeholderRemediation.known_content_drift[0].remediation = "y";
  assert.match(
    validateStackConfirmation(manifest, placeholderRemediation, CURRENT_TIME).join(" "),
    /known_content_drift must list/,
  );

  const echoedRemediation = clone();
  echoedRemediation.known_content_drift[0].remediation =
    echoedRemediation.known_content_drift[0].detail;
  assert.match(
    validateStackConfirmation(manifest, echoedRemediation, CURRENT_TIME).join(" "),
    /known_content_drift must list/,
  );

  const emptyDriftList = clone();
  emptyDriftList.known_content_drift = [];
  assert.match(
    validateStackConfirmation(manifest, emptyDriftList, CURRENT_TIME).join(" "),
    /known_content_drift/,
  );

  // A well-formed list that names nothing real must not satisfy the guard.
  const garbageDrift = clone();
  garbageDrift.known_content_drift = [
    {
      surface: "something",
      detail: "A detail long enough to clear the placeholder-metadata guard so that this case exercises surface coverage.",
      remediation: "A remediation long enough to clear the placeholder-metadata guard and reach the surface coverage check.",
    },
  ];
  const garbageIssues = validateStackConfirmation(manifest, garbageDrift, CURRENT_TIME).join(" ");
  assert.match(garbageIssues, /does not cover stale texting question question-r-slot-module-18-025/);
  assert.match(garbageIssues, /does not cover stale texting question question-r-slot-module-18-035/);

  // Matching must be EXACT. A surface that merely CONTAINS a required
  // identifier -- the earlier substring behaviour -- must not satisfy it.
  const substringDrift = clone();
  substringDrift.known_content_drift = substringDrift.known_content_drift.map((entry) => ({
    ...entry,
    surface: `see notes about ${entry.surface} somewhere`,
  }));
  const substringIssues = validateStackConfirmation(manifest, substringDrift, CURRENT_TIME).join(" ");
  assert.match(substringIssues, /does not cover drifted surface quiz-slot-18 question-r-slot-module-18-025/);
  assert.match(substringIssues, /does not cover stale texting question question-r-slot-module-18-035/);

  // EVERY required surface must be individually enforced, including the ones
  // that live outside the manifest and cannot be auto-detected.
  for (const required of clone().known_content_drift.map((entry) => entry.surface)) {
    const dropped = clone();
    dropped.known_content_drift = dropped.known_content_drift.filter(
      (entry) => entry.surface !== required,
    );
    assert.match(
      validateStackConfirmation(manifest, dropped, CURRENT_TIME).join(" "),
      /does not cover (drifted surface|stale texting question)/,
      `dropping ${required} must be rejected`,
    );
  }

  const duplicateSurface = clone();
  duplicateSurface.known_content_drift.push({ ...duplicateSurface.known_content_drift[0] });
  assert.match(
    validateStackConfirmation(manifest, duplicateSurface, CURRENT_TIME).join(" "),
    /same surface more than once/,
  );

  const missingTrigger = clone();
  missingTrigger.recheck_triggers = missingTrigger.recheck_triggers.filter(
    (trigger) => trigger !== "before_publication",
  );
  assert.match(
    validateStackConfirmation(manifest, missingTrigger, CURRENT_TIME).join(" "),
    /recheck trigger is missing/,
  );

  const noReverification = clone();
  delete noReverification.reverification;
  assert.match(
    validateStackConfirmation(manifest, noReverification, CURRENT_TIME).join(" "),
    /genuine reverification record/,
  );

  const fabricatedReverification = clone();
  fabricatedReverification.reverification.source_hashes_matched = false;
  assert.match(
    validateStackConfirmation(manifest, fabricatedReverification, CURRENT_TIME).join(" "),
    /genuine reverification record/,
  );

  const staleReverification = clone();
  staleReverification.reverification.reverified_at = "2026-07-01T00:00:00-05:00";
  assert.match(
    validateStackConfirmation(manifest, staleReverification, CURRENT_TIME).join(" "),
    /genuine reverification record/,
  );

  const futureReverification = clone();
  futureReverification.reverification.reverified_at = "2026-09-11T00:00:00-05:00";
  assert.match(
    validateStackConfirmation(manifest, futureReverification, CURRENT_TIME).join(" "),
    /genuine reverification record/,
  );
});

test("audited captions and guides match their recorded checksums and counts", async () => {
  const [manifest, confirmation] = await Promise.all([
    loadJson("./bmh-employee-training.v1.json"),
    loadJson("./bmh-operating-stack-confirmation.v1.json"),
  ]);
  const assetsByKey = new Map(
    manifest.assets.map((asset) => [asset.source_key, asset]),
  );

  for (const audited of confirmation.audited_assets) {
    const asset = assetsByKey.get(audited.source_key);
    assert.ok(asset, audited.source_key);
    assert.equal(asset.local_path, audited.local_path);
    assert.equal(asset.checksum_sha256, audited.checksum_sha256);
    if (asset.kind === "video") continue;

    const filePath = resolve(ROOT, audited.local_path);
    const bytes = await readFile(filePath);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      audited.checksum_sha256,
    );
    if (asset.kind === "pdf") {
      const { stdout } = await execFileAsync("pdftotext", [filePath, "-"]);
      assert.equal((stdout.match(/DialPad/gi) ?? []).length, 0);
    } else {
      assert.equal(
        (bytes.toString("utf8").match(/DialPad/gi) ?? []).length,
        audited.dialpad_reference_count,
      );
    }
  }
});

// The drift inventory was wrong twice by hand, both times because a repo-wide
// grep silently skipped files. This sweeps the TRACKED file list instead, so a
// new copy of the superseded workflow cannot enter the repo undisclosed.
test("every tracked file teaching the superseded DialPad-texting workflow is disclosed", async () => {
  const confirmation = await loadJson("./bmh-operating-stack-confirmation.v1.json");
  const tracked = (await execFileAsync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })).stdout
    .split("\0")
    .filter(Boolean);

  const PATTERN = /through dialpad or gmail|dialpad for texts|sending texts|dialpad or gmail/i;
  const offenders = [];
  for (const file of tracked) {
    let text;
    try {
      text = await readFile(resolve(ROOT, file), "utf8");
    } catch {
      continue; // unreadable or binary; the approved cut is disclosed explicitly
    }
    if (PATTERN.test(text)) offenders.push(file);
  }

  // These quote the superseded lines in order to disclose or test them.
  const selfReferential = new Set([
    "content/course-manifests/bmh-operating-stack-confirmation.v1.json",
    "content/course-manifests/bmh-operating-stack-confirmation.qa.test.mjs",
  ]);
  const surfaces = confirmation.known_content_drift.map((entry) => entry.surface);
  const isDisclosed = (file) =>
    surfaces.some(
      (surface) =>
        surface === file ||
        // "…/video-slot-18-mission-control.vtt at 00:01:12"
        surface.startsWith(`${file} `) ||
        // "course-assets/scenes/module-18-lesson18B/_logs" covers its log files
        file.startsWith(`${surface}/`) ||
        // a manifest is disclosed through the questions named inside it
        (file.startsWith("content/course-manifests/") && surface.startsWith("quiz-slot-")),
    );
  const undisclosed = offenders
    .filter((file) => !selfReferential.has(file))
    .filter((file) => !isDisclosed(file));

  assert.deepEqual(
    undisclosed,
    [],
    `these tracked files teach the superseded workflow but are not in known_content_drift: ${undisclosed.join(", ")}`,
  );
});
