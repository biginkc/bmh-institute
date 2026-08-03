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
const CURRENT_TIME = new Date("2026-08-03T00:00:00-05:00");

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
      new Date("2026-08-10T00:00:00-05:00"),
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
  futureReverification.reverification.reverified_at = "2026-08-12T00:00:00-05:00";
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
