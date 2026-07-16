import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createEmptyProductionRecord,
  sha256,
  validateProductionRecord,
} from "../../scripts/course-content/artwork-production-contract.mjs";

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

test("every declared reference is portable and checksum locked", async () => {
  for (const reference of inventory.style_system.reference_inputs) {
    const contents = await readFile(new URL(`../../${reference.path}`, import.meta.url));
    assert.equal(sha256(contents), reference.sha256, reference.id);
  }
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
    assert.equal(asset.prompt_sha256, sha256(asset.prompt));
    assert.match(asset.prompt_sha256, /^[a-f0-9]{64}$/);
    if (asset.pilot) {
      assert.equal(asset.provenance.generation_call, "promote-existing-pilot-call");
      assert.equal(asset.provenance.planned_generation_call_id, null);
    } else {
      assert.equal(asset.provenance.generation_call, "one-distinct-call");
      assert.ok(asset.provenance.planned_generation_call_id);
    }
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

  const plannedCalls = generated
    .map((asset) => asset.provenance.planned_generation_call_id)
    .filter(Boolean);
  const directPosterCalls = inventory.lessons.flatMap((lesson) =>
    lesson.posters
      .filter((poster) => poster.direct_master)
      .map((poster) => poster.direct_master.provenance.planned_generation_call_id),
  );
  assert.equal(plannedCalls.length, 17);
  assert.equal(directPosterCalls.length, 1);
  assert.equal(new Set([...plannedCalls, ...directPosterCalls]).size, 18);
});

test("Opening pilot supplies only its card and Opening poster; Fact Find has a distinct master", () => {
  const opening = inventory.lessons.find((lesson) => lesson.slot === "slot-07");
  const openingPoster = opening.posters.find(
    (poster) => poster.asset_key === "poster-video-slot-07-opening",
  );
  const factFindPoster = opening.posters.find(
    (poster) => poster.asset_key === "poster-video-slot-07-fact-find",
  );

  assert.equal(openingPoster.production_source_mode, "derive-from-lesson-master");
  assert.equal(openingPoster.direct_master, null);
  assert.equal(openingPoster.derivative.source_master_id, opening.master.id);

  assert.equal(
    factFindPoster.production_source_mode,
    "generate-distinct-after-pilot-approval",
  );
  assert.equal(
    factFindPoster.direct_master.id,
    "master-poster-video-slot-07-fact-find",
  );
  assert.equal(
    factFindPoster.direct_master.source_path,
    "course-assets/posters/production/sources/video-slot-07-fact-find-generated.png",
  );
  assert.equal(
    factFindPoster.direct_master.flat_master_path,
    "course-assets/posters/production/flat-masters/video-slot-07-fact-find-flat-master.png",
  );
  assert.deepEqual(factFindPoster.direct_master.reference_ids, [
    "style-ref-1",
    "style-ref-2",
  ]);
  assert.equal(
    factFindPoster.direct_master.prompt_sha256,
    sha256(factFindPoster.direct_master.prompt),
  );
  assert.equal(
    factFindPoster.direct_master.provenance.planned_generation_call_id,
    "imagegen-poster-video-slot-07-fact-find",
  );
  assert.equal(factFindPoster.derivative.source_master_id, factFindPoster.direct_master.id);
  assert.equal(factFindPoster.derivative.crop_profile, "full-safe");
  assert.match(factFindPoster.derivative.recipe_id, /-full-safe$/);
  assert.notEqual(
    factFindPoster.direct_master.prompt_sha256,
    opening.prompt_sha256,
  );
});

test("production records reject partial transitions and preserve nulls until produced", () => {
  const records = [
    inventory.course_cover.production_record,
    ...inventory.lessons.map((lesson) => lesson.master.production_record),
    ...inventory.lessons.flatMap((lesson) =>
      lesson.posters
        .filter((poster) => poster.direct_master)
        .map((poster) => poster.direct_master.production_record),
    ),
  ];
  for (const record of records) {
    assert.deepEqual(record, createEmptyProductionRecord());
    assert.doesNotThrow(() => validateProductionRecord(record));
  }

  assert.throws(
    () =>
      validateProductionRecord({
        ...createEmptyProductionRecord(),
        status: "produced-awaiting-review",
        generated_at: "2026-07-16T00:00:00.000Z",
      }),
    /must be a non-empty string/,
  );
  const produced = {
    ...createEmptyProductionRecord(),
    status: "produced-awaiting-review",
    generated_at: "2026-07-16T00:00:00.000Z",
    generated_by: "operator",
    generation_call_id: "imagegen-example",
    source_sha256: "a".repeat(64),
    flat_master_sha256: "b".repeat(64),
  };
  assert.doesNotThrow(() => validateProductionRecord(produced));
  assert.throws(
    () => validateProductionRecord({ ...produced, status: "reviewed" }),
    /reviewed_at must be a non-empty string/,
  );
  assert.doesNotThrow(() =>
    validateProductionRecord({
      ...produced,
      status: "reviewed",
      reviewed_at: "2026-07-16T01:00:00.000Z",
      reviewed_by: "reviewer",
      review_evidence: "docs/course-production/reviews/example.md",
    }),
  );
});

test("poster recipes are distinct, subject matched, and safely derived", () => {
  for (const lesson of inventory.lessons) {
    const subjects = lesson.posters.map((poster) => poster.focus_subject);
    const recipes = lesson.posters.map((poster) => poster.derivative.recipe_id);
    assert.equal(new Set(subjects).size, subjects.length, `${lesson.slot} subjects`);
    assert.equal(new Set(recipes).size, recipes.length, `${lesson.slot} recipes`);

    for (const poster of lesson.posters) {
      assert.equal(
        poster.derivative.source_master_id,
        poster.direct_master?.id ?? lesson.master.id,
      );
      assert.equal(poster.derivative.target_dimensions.join("x"), "1280x720");
      assert.match(poster.derivative.crop_profile, /^(full|left|center|right)-safe$/);
      assert.ok(poster.focus_subject.length >= 12);
      assert.equal(poster.approval.status, "blocked-pending-pilot-approval");
    }
  }
});

test("builder --check verifies deterministic output without writing", async () => {
  const builderPath = fileURLToPath(
    new URL(
      "../../scripts/course-content/build-artwork-production-inventory.mjs",
      import.meta.url,
    ),
  );
  const before = await stat(fileURLToPath(inventoryPath), { bigint: true });
  const result = spawnSync(process.execPath, [builderPath, "--check"], {
    encoding: "utf8",
  });
  const after = await stat(fileURLToPath(inventoryPath), { bigint: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified .*production-inventory\.json/);
  assert.equal(after.mtimeNs, before.mtimeNs);
});
