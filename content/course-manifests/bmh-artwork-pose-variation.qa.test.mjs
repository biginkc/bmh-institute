import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ALLOWED_ARTWORK_CHARACTERS,
  ALLOWED_ARTWORK_POSTURES,
  ARTWORK_MASTER_POSE_CONTRACT,
  buildArtworkOutputPosePlan,
  validateArtworkPoseContract,
} from "../../scripts/course-content/artwork-pose-contract.mjs";

const manifest = JSON.parse(await readFile(new URL("./bmh-employee-training.v1.json", import.meta.url), "utf8"));
const course = manifest.program.courses[0];
const contentLessons = course.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.type === "content"));

test("the character plan covers every independent artwork master with varied lesson-informed poses", () => {
  assert.doesNotThrow(() => validateArtworkPoseContract());
  assert.equal(ARTWORK_MASTER_POSE_CONTRACT.length, 21);
  assert.equal(new Set(ARTWORK_MASTER_POSE_CONTRACT.map((entry) => entry.master_id)).size, 21);
  assert.equal(new Set(ARTWORK_MASTER_POSE_CONTRACT.map((entry) => entry.pose_id)).size, 21);
  assert.ok(new Set(ARTWORK_MASTER_POSE_CONTRACT.map((entry) => entry.posture)).size >= 7);
  assert.ok(new Set(ARTWORK_MASTER_POSE_CONTRACT.map((entry) => entry.placement)).size >= 7);

  for (const entry of ARTWORK_MASTER_POSE_CONTRACT) {
    assert.equal(entry.people_count, 1, entry.master_id);
    assert.ok(ALLOWED_ARTWORK_CHARACTERS.includes(entry.character_id), entry.master_id);
    assert.ok(ALLOWED_ARTWORK_POSTURES.includes(entry.posture), entry.master_id);
    assert.equal(entry.skin_fill, "pure white", entry.master_id);
    assert.ok(entry.lesson_or_video_cue.length >= 24, entry.master_id);
    assert.match(entry.pose_instruction, new RegExp(entry.character_id === "andrea-approved" ? "Andrea" : "seller", "i"), entry.master_id);
    assert.match(entry.pose_instruction, /exactly one person/i, entry.master_id);
  }

  const backgrounds = new Set(ARTWORK_MASTER_POSE_CONTRACT.map((entry) => entry.background_rgb.join(",")));
  assert.deepEqual(backgrounds, new Set(["103,182,255", "255,211,1"]));
});

test("all 49 artwork outputs resolve to one pose and each poster retains its exact video cue", () => {
  const outputs = buildArtworkOutputPosePlan(manifest);
  assert.equal(outputs.length, 49);
  assert.equal(outputs.filter((output) => output.kind === "course-cover").length, 1);
  assert.equal(outputs.filter((output) => output.kind === "lesson-card").length, 19);
  assert.equal(outputs.filter((output) => output.kind === "video-poster").length, 29);
  assert.equal(new Set(outputs.map((output) => output.asset_key)).size, 49);

  const mastersById = new Map(ARTWORK_MASTER_POSE_CONTRACT.map((entry) => [entry.master_id, entry]));
  for (const output of outputs) {
    const master = mastersById.get(output.source_master_id);
    assert.ok(master, `${output.asset_key} missing source master`);
    assert.equal(output.character_id, master.character_id, output.asset_key);
    assert.equal(output.pose_id, master.pose_id, output.asset_key);
    assert.equal(output.people_count, 1, output.asset_key);
    assert.equal(output.skin_fill, "pure white", output.asset_key);
    if (output.kind === "video-poster") {
      assert.ok(output.video_asset_key, output.asset_key);
      assert.ok(output.video_title, output.asset_key);
      assert.match(output.lesson_or_video_cue, new RegExp(output.video_title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), output.asset_key);
    }
  }

  assert.deepEqual(
    outputs.filter((output) => output.kind === "lesson-card").map((output) => output.asset_key),
    contentLessons.map((lesson) => lesson.thumbnail_asset_key),
  );
});

test("pose validation rejects two-person art and exact stance repetition", () => {
  assert.throws(
    () => validateArtworkPoseContract(ARTWORK_MASTER_POSE_CONTRACT.map((entry, index) => (index === 0 ? { ...entry, people_count: 2 } : entry))),
    /exactly one person/i,
  );
  assert.throws(
    () =>
      validateArtworkPoseContract(
        ARTWORK_MASTER_POSE_CONTRACT.map((entry, index) =>
          index === 1
            ? {
                ...entry,
                pose_id: ARTWORK_MASTER_POSE_CONTRACT[0].pose_id,
                posture: ARTWORK_MASTER_POSE_CONTRACT[0].posture,
                orientation: ARTWORK_MASTER_POSE_CONTRACT[0].orientation,
                gesture: ARTWORK_MASTER_POSE_CONTRACT[0].gesture,
                placement: ARTWORK_MASTER_POSE_CONTRACT[0].placement,
              }
            : entry,
        ),
      ),
    /repeats an existing pose|unique pose_id/i,
  );
});
