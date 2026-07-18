import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { buildTechStackCanary } from "../../scripts/course-content/build-canary-manifest.mjs";

const FULL_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const CANARY_URL = new URL("./bmh-employee-training-canary.v1.json", import.meta.url);

test("the canary is an exact isolated Tech Stack content and quiz slice", async () => {
  const full = JSON.parse(await readFile(FULL_URL, "utf8"));
  const canary = buildTechStackCanary(full);
  const generated = JSON.parse(await readFile(CANARY_URL, "utf8"));

  assert.deepEqual(generated, canary);
  assert.equal(canary.import_id, "bmh-employee-training-canary-v1");
  assert.equal(canary.program.is_published, false);
  assert.match(canary.qa_role_group.name, /Canary/);
  assert.equal(canary.program.courses.length, 1);
  assert.equal(canary.program.courses[0].modules.length, 1);
  assert.deepEqual(
    canary.program.courses[0].modules[0].lessons.map((lesson) => [lesson.source_key, lesson.type]),
    [
      ["lesson-content-slot-03", "content"],
      ["lesson-quiz-slot-03", "quiz"],
    ],
  );
  const canaryQuiz = canary.program.courses[0].modules[0].lessons.find((lesson) => lesson.type === "quiz").quiz;
  assert.equal(canaryQuiz.approval_status, "pending_human_review");
  assert.ok(canary.assets.length <= 10);
  assert.ok(canary.assets.every((asset) =>
    asset.storage_path.startsWith("courses/bmh-employee-training-canary/v1/"),
  ));
  for (const asset of canary.assets.filter((item) => item.approval_status === "approved")) {
    assert.ok(asset.storage_path.includes(asset.checksum_sha256));
  }
  const assetsByKey = new Map(canary.assets.map((asset) => [asset.source_key, asset]));
  for (const lesson of canary.program.courses[0].modules[0].lessons) {
    for (const block of lesson.blocks ?? []) {
      for (const [keyField, pathField] of [
        ["asset_key", "file_path"],
        ["poster_asset_key", "poster_path"],
        ["caption_asset_key", "caption_path"],
        ["transcript_asset_key", "transcript_path"],
      ]) {
        if (block.content?.[pathField] === undefined) continue;
        assert.equal(block.content[pathField], assetsByKey.get(block.content[keyField])?.storage_path);
      }
    }
  }
});
