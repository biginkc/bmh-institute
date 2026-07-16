import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPECTED_HELD_SOURCE_KEYS,
  assertHeldAssetMatchesLock,
  verifyHeldVideoReview,
} from "../../scripts/course-content/verify-held-video-review.mjs";

test("the local review surface is locked to every held manifest video", async () => {
  const result = await verifyHeldVideoReview();

  assert.deepEqual(result.sourceKeys, EXPECTED_HELD_SOURCE_KEYS);
  assert.equal(result.videoCount, 9);
  assert.equal(result.evidenceFileCount, 6);
  assert.equal(result.htmlIsCurrent, true);
});

test("the review lock fails closed when a held cut changes", () => {
  assert.throws(
    () => assertHeldAssetMatchesLock({
      source_key: "video-slot-01-welcome",
      local_path: "course-assets/review-lessonA/LESSON-1A-v8.mp4",
      checksum_sha256: "0".repeat(64),
      size_bytes: 1,
    }),
    /Held cut changed in the manifest/,
  );
});
