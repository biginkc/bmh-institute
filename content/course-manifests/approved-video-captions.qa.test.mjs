import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inspectApprovedCaptionAssets,
  loadManifest,
} from "../../scripts/course-content/validate-caption-assets.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const REPO_ROOT = new URL("../../", import.meta.url);

test("only approved video cuts have complete caption and transcript assets", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const report = await inspectApprovedCaptionAssets(manifest, REPO_ROOT);

  assert.equal(report.approvedVideos, 21);
  assert.equal(report.heldVideos, 8);
  assert.equal(report.approvedCaptions, 21);
  assert.equal(report.approvedTranscripts, 21);
  assert.equal(report.heldDerivativeAssetsStillMissing, 16);
  assert.deepEqual(report.errors, []);
});
