import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestPath = new URL("./bmh-employee-training.v1.json", import.meta.url);
const inventoryPath = new URL(
  "../../docs/course-production/thumbnail-pilots/production-inventory.json",
  import.meta.url,
);
const pilotChecksumsPath = new URL(
  "../../docs/course-production/thumbnail-pilots/checksums.json",
  import.meta.url,
);

const [manifest, inventory, pilotChecksums] = await Promise.all([
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(inventoryPath, "utf8").then(JSON.parse),
  readFile(pilotChecksumsPath, "utf8").then(JSON.parse),
]);

const course = manifest.program.courses[0];
const contentLessons = course.modules.flatMap((module) =>
  module.lessons.filter((lesson) => lesson.type === "content"),
);
const videoBlocks = contentLessons.flatMap((lesson) =>
  lesson.blocks.filter((block) => block.type === "video"),
);

test("artwork inventory is gated and contains the locked production counts", () => {
  assert.equal(inventory.schema_version, "bmh-artwork-production/v1");
  assert.equal(inventory.status, "blocked-pending-pilot-approval");
  assert.equal(inventory.course_cover.asset_key, course.thumbnail_asset_key);
  assert.equal(inventory.lessons.length, 19);
  assert.equal(
    inventory.lessons.flatMap((lesson) => lesson.posters).length,
    29,
  );
});

test("all manifest artwork keys and output paths are mapped exactly once", () => {
  assert.deepEqual(
    inventory.lessons.map((lesson) => lesson.lesson_source_key),
    contentLessons.map((lesson) => lesson.source_key),
  );
  assert.deepEqual(
    inventory.lessons.map((lesson) => lesson.lesson_card.asset_key),
    contentLessons.map((lesson) => lesson.thumbnail_asset_key),
  );

  const inventoryPosters = inventory.lessons.flatMap((lesson) => lesson.posters);
  assert.deepEqual(
    inventoryPosters.map((poster) => poster.asset_key),
    videoBlocks.map((block) => block.content.poster_asset_key),
  );
  assert.deepEqual(
    inventoryPosters.map((poster) => poster.video_asset_key),
    videoBlocks.map((block) => block.content.asset_key),
  );

  const manifestArtwork = new Map(
    manifest.assets
      .filter((asset) =>
        asset.source_key === course.thumbnail_asset_key ||
        contentLessons.some(
          (lesson) => lesson.thumbnail_asset_key === asset.source_key,
        ) ||
        videoBlocks.some(
          (block) => block.content.poster_asset_key === asset.source_key,
        ),
      )
      .map((asset) => [asset.source_key, asset]),
  );

  for (const planned of [
    inventory.course_cover,
    ...inventory.lessons.map((lesson) => lesson.lesson_card),
    ...inventoryPosters,
  ]) {
    const asset = manifestArtwork.get(planned.asset_key);
    assert.ok(asset, `missing manifest asset ${planned.asset_key}`);
    assert.equal(planned.output_path, asset.local_path);
    assert.equal(asset.approval_status, "missing");
  }

  const outputPaths = [
    inventory.course_cover.output_path,
    ...inventory.lessons.map((lesson) => lesson.lesson_card.output_path),
    ...inventoryPosters.map((poster) => poster.output_path),
  ];
  assert.equal(new Set(outputPaths).size, 49);
});

test("three pilots map to their intended manifest topics and stay unapproved", () => {
  const pilots = inventory.lessons.filter((lesson) => lesson.pilot);
  assert.deepEqual(
    pilots.map((lesson) => [
      lesson.slot,
      lesson.title,
      lesson.lesson_card.asset_key,
      lesson.posters[0].asset_key,
    ]),
    [
      [
        "slot-01",
        "Welcome and Mindset",
        "thumbnail-slot-01",
        "poster-video-slot-01-welcome",
      ],
      [
        "slot-07",
        "Opening the Call",
        "thumbnail-slot-07",
        "poster-video-slot-07-opening",
      ],
      [
        "slot-09",
        "Objection Architecture",
        "thumbnail-slot-09",
        "poster-video-slot-09-objection-architecture",
      ],
    ],
  );

  for (const lesson of pilots) {
    assert.equal(
      lesson.production_source_mode,
      "promote-approved-pilot-flat-master",
    );
    assert.equal(lesson.approval.status, "awaiting-jarrad-approval");
    assert.equal(lesson.approval.approved_by, null);
    assert.equal(lesson.approval.approved_at, null);
    const checksumRecord = pilotChecksums.assets.find(
      (asset) => asset.slug === lesson.pilot_review.slug,
    );
    assert.ok(checksumRecord, `${lesson.slot} pilot checksum record`);
    assert.deepEqual(lesson.pilot_review.assets, checksumRecord);
    assert.equal(lesson.pilot_review.status, pilotChecksums.status);
  }

  for (const lesson of inventory.lessons.filter((entry) => !entry.pilot)) {
    assert.equal(lesson.production_source_mode, "generate-after-pilot-approval");
  }
});

test("every generated master has an exact guarded prompt and provenance record", () => {
  const generated = [inventory.course_cover, ...inventory.lessons];
  for (const asset of generated) {
    assert.equal(asset.provenance.generator, "built-in image_gen");
    assert.equal(asset.provenance.generation_call, "one-distinct-call");
    assert.ok(asset.prompt.length >= 900, `${asset.asset_key ?? asset.slot} prompt`);
    for (const required of [
      "Use case: stylized-concept",
      "Style/medium:",
      "Composition/framing:",
      "Color palette:",
      "Constraints:",
      "Avoid:",
      "no title",
      "central 80%",
    ]) {
      assert.ok(
        asset.prompt.includes(required),
        `${asset.asset_key ?? asset.slot} prompt missing ${required}`,
      );
    }
  }
});

test("poster recipes are distinct, subject matched, and safely derived", () => {
  for (const lesson of inventory.lessons) {
    const subjects = lesson.posters.map((poster) => poster.focus_subject);
    const recipes = lesson.posters.map((poster) => poster.derivative.recipe_id);
    assert.equal(new Set(subjects).size, subjects.length, `${lesson.slot} subjects`);
    assert.equal(new Set(recipes).size, recipes.length, `${lesson.slot} recipes`);

    for (const poster of lesson.posters) {
      assert.equal(poster.derivative.source_master_id, lesson.master.id);
      assert.equal(poster.derivative.target_dimensions.join("x"), "1280x720");
      assert.match(poster.derivative.crop_profile, /^(full|left|center|right)-safe$/);
      assert.ok(poster.focus_subject.length >= 12);
      assert.equal(poster.approval.status, "blocked-pending-pilot-approval");
    }
  }
});
