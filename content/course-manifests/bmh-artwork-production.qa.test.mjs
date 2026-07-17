import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createEmptyProductionRecord, sha256, validateProductionRecord } from "../../scripts/course-content/artwork-production-contract.mjs";

const manifestPath = new URL("./bmh-employee-training.v1.json", import.meta.url);
const inventoryPath = new URL("../../docs/course-production/thumbnail-pilots/production-inventory.json", import.meta.url);
const pilotChecksumsPath = new URL("../../docs/course-production/thumbnail-pilots/v7-checksums.json", import.meta.url);
const pilotGenerationLineagePath = new URL("../../docs/course-production/thumbnail-pilots/v7-generation-lineage.json", import.meta.url);

const [manifest, inventory, pilotChecksums, pilotGenerationLineage] = await Promise.all([
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(inventoryPath, "utf8").then(JSON.parse),
  readFile(pilotChecksumsPath, "utf8").then(JSON.parse),
  readFile(pilotGenerationLineagePath, "utf8").then(JSON.parse),
]);

const course = manifest.program.courses[0];
const contentLessons = course.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.type === "content"));
const videoBlocks = contentLessons.flatMap((lesson) => lesson.blocks.filter((block) => block.type === "video"));

test("artwork inventory is gated and contains the locked production counts", () => {
  assert.equal(inventory.schema_version, "bmh-artwork-production/v3-candidate");
  assert.equal(inventory.status, "blocked-pending-pilot-approval");
  assert.equal(inventory.course_cover.asset_key, course.thumbnail_asset_key);
  assert.equal(inventory.lessons.length, 19);
  assert.equal(inventory.lessons.flatMap((lesson) => lesson.posters).length, 29);
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
      .filter(
        (asset) => asset.source_key === course.thumbnail_asset_key || contentLessons.some((lesson) => lesson.thumbnail_asset_key === asset.source_key) || videoBlocks.some((block) => block.content.poster_asset_key === asset.source_key),
      )
      .map((asset) => [asset.source_key, asset]),
  );

  for (const planned of [inventory.course_cover, ...inventory.lessons.map((lesson) => lesson.lesson_card), ...inventoryPosters]) {
    const asset = manifestArtwork.get(planned.asset_key);
    assert.ok(asset, `missing manifest asset ${planned.asset_key}`);
    assert.equal(planned.output_path, asset.local_path);
    assert.ok(["missing", "approved"].includes(asset.approval_status), `${asset.source_key} has unsupported artwork approval ${asset.approval_status}`);
    if (asset.approval_status === "approved") {
      assert.match(asset.checksum_sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(asset.size_bytes) && asset.size_bytes > 0);
      assert.ok(asset.storage_path.includes(asset.checksum_sha256));
    }
  }

  const outputPaths = [inventory.course_cover.output_path, ...inventory.lessons.map((lesson) => lesson.lesson_card.output_path), ...inventoryPosters.map((poster) => poster.output_path)];
  assert.equal(new Set(outputPaths).size, 49);
});

test("three pilots map to their intended manifest topics and stay unapproved", () => {
  const pilots = inventory.lessons.filter((lesson) => lesson.pilot);
  assert.deepEqual(
    pilots.map((lesson) => [lesson.slot, lesson.title, lesson.lesson_card.asset_key, lesson.posters[0].asset_key]),
    [
      ["slot-01", "Welcome and Mindset", "thumbnail-slot-01", "poster-video-slot-01-welcome"],
      ["slot-07", "Opening the Call", "thumbnail-slot-07", "poster-video-slot-07-opening"],
      ["slot-09", "Objection Architecture", "thumbnail-slot-09", "poster-video-slot-09-objection-architecture"],
    ],
  );

  for (const lesson of pilots) {
    assert.equal(lesson.production_source_mode, "promote-approved-pilot-flat-master");
    assert.equal(lesson.approval.status, "awaiting-jarrad-approval");
    assert.equal(lesson.approval.approved_by, null);
    assert.equal(lesson.approval.approved_at, null);
    const checksumRecord = pilotChecksums.assets.find((asset) => asset.slug === lesson.pilot_review.slug);
    assert.ok(checksumRecord, `${lesson.slot} pilot checksum record`);
    assert.deepEqual(lesson.pilot_review.assets, checksumRecord);
    assert.equal(lesson.pilot_review.status, pilotChecksums.status);
  }

  for (const lesson of inventory.lessons.filter((entry) => !entry.pilot)) {
    assert.equal(lesson.production_source_mode, "generate-after-pilot-approval");
  }
});

test("V7 pilots retain exact two-root single-character image_gen lineage", async () => {
  assert.equal(pilotGenerationLineage.schema_version, "bmh-thumbnail-pilot-lineage/v3-candidate");
  assert.equal(pilotGenerationLineage.status, "awaiting-jarrad-approval");
  assert.equal(pilotGenerationLineage.contract.people_per_thumbnail, 1);
  assert.deepEqual(pilotGenerationLineage.contract.allowed_characters, ["andrea", "recurring-seller"]);
  assert.deepEqual(
    pilotGenerationLineage.identity_roots.map((root) => root.id),
    ["andrea-approved", "recurring-seller-approved"],
  );
  assert.deepEqual(
    pilotGenerationLineage.records.map((record) => record.slug),
    ["orientation", "opening-the-call", "objection-architecture"],
  );
  assert.deepEqual(
    pilotGenerationLineage.records.map((record) => record.character_id),
    ["andrea-approved", "andrea-approved", "recurring-seller-approved"],
  );

  const pilots = inventory.lessons.filter((lesson) => lesson.pilot);
  for (const lesson of pilots) {
    const record = pilotGenerationLineage.records.find((candidate) => candidate.slug === lesson.pilot_review.slug);
    assert.ok(record, lesson.slot);
    assert.deepEqual(lesson.pilot_review.generation_lineage, record);
    assert.equal(lesson.pilot_review.generation_lineage_record_path, "docs/course-production/thumbnail-pilots/v7-generation-lineage.json");
    assert.equal(lesson.pilot_review.lineage_schema_version, pilotGenerationLineage.schema_version);
    assert.deepEqual(lesson.pilot_review.identity_roots, pilotGenerationLineage.identity_roots);

    const checksumRecord = pilotChecksums.assets.find((asset) => asset.slug === record.slug);
    assert.equal(record.generation.output_sha256, checksumRecord.source.sha256);
    assert.equal(record.generation.output_path, checksumRecord.source.path);
    assert.equal(checksumRecord.character, record.character_id === "andrea-approved" ? "andrea" : "recurring-seller");
    const prompt = await readFile(new URL(`../../${record.generation.prompt_path}`, import.meta.url));
    assert.equal(sha256(prompt), record.generation.prompt_sha256);
    assert.equal(lesson.prompt_sha256, record.generation.prompt_sha256);
    assert.match(record.generation.tool_output_id, /^exec-/);
    for (const locked of [record.contact_sheet_input, checksumRecord.source, checksumRecord.flat_master, checksumRecord.lesson_card, checksumRecord.video_poster]) {
      assert.equal(sha256(await readFile(new URL(`../../${locked.path}`, import.meta.url))), locked.sha256, locked.path);
    }
  }
  const openingLock = pilotGenerationLineage.records.find((record) => record.slug === "opening-the-call").deterministic_character_lock;
  assert.equal(openingLock.drift_pixels_flat_master, 0);
  assert.equal(openingLock.drift_pixels_lesson_card, 0);
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
    assert.ok(asset.prompt.length >= (asset.pilot ? 400 : 900), `${asset.asset_key ?? asset.slot} prompt`);
    if (asset.pilot) {
      assert.match(asset.prompt, /exactly one person|single Andrea character|Keep the Andrea character pixels|single recurring seller/i);
      continue;
    }
    for (const required of ["Use case: stylized-concept", "Style/medium:", "Composition/framing:", "Color palette:", "Constraints:", "Avoid:", "no title", "central 80%"]) {
      assert.ok(asset.prompt.includes(required), `${asset.asset_key ?? asset.slot} prompt missing ${required}`);
    }
  }

  const plannedCalls = generated.map((asset) => asset.provenance.planned_generation_call_id).filter(Boolean);
  const directPosterCalls = inventory.lessons.flatMap((lesson) => lesson.posters.filter((poster) => poster.direct_master).map((poster) => poster.direct_master.provenance.planned_generation_call_id));
  assert.equal(plannedCalls.length, 17);
  assert.equal(directPosterCalls.length, 1);
  assert.equal(new Set([...plannedCalls, ...directPosterCalls]).size, 18);
});

test("Opening pilot supplies only its card and Opening poster; Fact Find has a distinct master", () => {
  const opening = inventory.lessons.find((lesson) => lesson.slot === "slot-07");
  const openingPoster = opening.posters.find((poster) => poster.asset_key === "poster-video-slot-07-opening");
  const factFindPoster = opening.posters.find((poster) => poster.asset_key === "poster-video-slot-07-fact-find");

  assert.equal(openingPoster.production_source_mode, "derive-from-lesson-master");
  assert.equal(openingPoster.direct_master, null);
  assert.equal(openingPoster.derivative.source_master_id, opening.master.id);

  assert.equal(factFindPoster.production_source_mode, "generate-distinct-after-pilot-approval");
  assert.equal(factFindPoster.direct_master.id, "master-poster-video-slot-07-fact-find");
  assert.equal(factFindPoster.direct_master.source_path, "course-assets/posters/production/sources/video-slot-07-fact-find-generated.png");
  assert.equal(factFindPoster.direct_master.flat_master_path, "course-assets/posters/production/flat-masters/video-slot-07-fact-find-flat-master.png");
  assert.deepEqual(factFindPoster.direct_master.reference_ids, ["style-ref-1", "style-ref-2"]);
  assert.equal(factFindPoster.direct_master.prompt_sha256, sha256(factFindPoster.direct_master.prompt));
  assert.equal(factFindPoster.direct_master.provenance.planned_generation_call_id, "imagegen-poster-video-slot-07-fact-find");
  assert.equal(factFindPoster.derivative.source_master_id, factFindPoster.direct_master.id);
  assert.equal(factFindPoster.derivative.crop_profile, "full-safe");
  assert.match(factFindPoster.derivative.recipe_id, /-full-safe$/);
  assert.notEqual(factFindPoster.direct_master.prompt_sha256, opening.prompt_sha256);
});

test("production records reject partial transitions and preserve nulls until produced", () => {
  const records = [
    inventory.course_cover.production_record,
    ...inventory.lessons.map((lesson) => lesson.master.production_record),
    ...inventory.lessons.flatMap((lesson) => lesson.posters.filter((poster) => poster.direct_master).map((poster) => poster.direct_master.production_record)),
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
  assert.throws(() => validateProductionRecord({ ...produced, status: "reviewed" }), /review_decision must be a non-empty string/);
  assert.doesNotThrow(() =>
    validateProductionRecord({
      ...produced,
      status: "reviewed",
      review_decision: "approved",
      reviewed_at: "2026-07-16T01:00:00.000Z",
      reviewed_by: "reviewer",
      review_evidence: "docs/course-production/reviews/example.md",
    }),
  );
  assert.throws(() => validateProductionRecord({ ...produced, typo: true }), /exactly the production record fields/);
  assert.throws(() => validateProductionRecord({ ...produced, generated_at: "not-a-date" }), /ISO UTC timestamp/);
  assert.throws(
    () =>
      validateProductionRecord({
        ...produced,
        flat_master_sha256: produced.source_sha256,
      }),
    /must differ/,
  );
  const reviewed = {
    ...produced,
    status: "reviewed",
    review_decision: "approved",
    reviewed_at: "2026-07-15T23:59:59.000Z",
    reviewed_by: "reviewer",
    review_evidence: "../../outside.md",
  };
  assert.throws(() => validateProductionRecord(reviewed), /cannot precede/);
  assert.throws(
    () =>
      validateProductionRecord({
        ...reviewed,
        reviewed_at: "2026-07-16T01:00:00.000Z",
      }),
    /safe repository-relative path/,
  );
  assert.throws(
    () =>
      validateProductionRecord(produced, "production record", {
        expectedGenerationCallId: "different-call",
      }),
    /does not match the planned call/,
  );
});

test("poster recipes are distinct, subject matched, and safely derived", () => {
  for (const lesson of inventory.lessons) {
    const subjects = lesson.posters.map((poster) => poster.focus_subject);
    const recipes = lesson.posters.map((poster) => poster.derivative.recipe_id);
    assert.equal(new Set(subjects).size, subjects.length, `${lesson.slot} subjects`);
    assert.equal(new Set(recipes).size, recipes.length, `${lesson.slot} recipes`);

    for (const poster of lesson.posters) {
      assert.equal(poster.derivative.source_master_id, poster.direct_master?.id ?? lesson.master.id);
      assert.equal(poster.derivative.target_dimensions.join("x"), "1280x720");
      assert.deepEqual(poster.derivative.normalize_master_dimensions, [1280, 720]);
      assert.equal(poster.derivative.normalize_method, "contain-with-padding");
      assert.deepEqual(poster.derivative.normalize_background_rgb, lesson.master.background_rgb);
      assert.deepEqual(
        poster.derivative.crop_pixels_after_normalize,
        {
          "full-safe": [0, 0, 1280, 720],
          "left-safe": [64, 144, 768, 432],
          "center-safe": [256, 144, 768, 432],
          "right-safe": [448, 144, 768, 432],
        }[poster.derivative.crop_profile],
      );
      assert.match(poster.derivative.crop_profile, /^(full|left|center|right)-safe$/);
      assert.ok(poster.focus_subject.length >= 12);
      assert.equal(poster.approval.status, "blocked-pending-pilot-approval");
    }
  }
});

test("course cover and lesson cards share the exact no-crop contained-card recipe", () => {
  const expectedRecipe = (recipeId, sourceMasterId, background = [103, 182, 255]) => ({
    recipe_id: recipeId,
    source_master_id: sourceMasterId,
    target_dimensions: [1280, 800],
    method: "contain-master-in-1280x720-and-pad-40px-top-and-bottom",
    normalize_master_dimensions: [1280, 720],
    normalize_method: "contain-with-padding",
    normalize_background_rgb: background,
    padding_color_rgb: background,
    crop_allowed: false,
    resample: "lanczos",
    output_format: "lossless-webp",
  });

  assert.equal(inventory.course_cover.id, "master-program-bmh-employee-training");
  assert.deepEqual(inventory.course_cover.derivative, expectedRecipe("course-cover-card-16x10", "master-program-bmh-employee-training"));
  for (const lesson of inventory.lessons) {
    assert.deepEqual(lesson.lesson_card.derivative, expectedRecipe(`${lesson.slot}-lesson-card-16x10`, lesson.master.id, lesson.master.background_rgb), lesson.slot);
  }
});

test("every derivative source master resolves exactly once", () => {
  const masters = [inventory.course_cover, ...inventory.lessons.map((lesson) => lesson.master), ...inventory.lessons.flatMap((lesson) => lesson.posters.flatMap((poster) => (poster.direct_master ? [poster.direct_master] : [])))];
  const masterIds = masters.map((master) => master.id);
  assert.equal(masters.length, 21);
  assert.equal(new Set(masterIds).size, masterIds.length);
  assert.equal(new Set(masters.map((master) => master.source_path)).size, masters.length);
  assert.equal(new Set(masters.map((master) => master.flat_master_path)).size, masters.length);

  const derivatives = [inventory.course_cover.derivative, ...inventory.lessons.flatMap((lesson) => [lesson.lesson_card.derivative, ...lesson.posters.map((poster) => poster.derivative)])];
  const recipeIds = derivatives.map((derivative) => derivative.recipe_id);
  assert.ok(recipeIds.every(Boolean));
  assert.equal(new Set(recipeIds).size, recipeIds.length);
  for (const derivative of derivatives) {
    assert.equal(masterIds.filter((masterId) => masterId === derivative.source_master_id).length, 1, derivative.source_master_id);
  }
});

test("builder --check verifies deterministic output without writing", async () => {
  const builderPath = fileURLToPath(new URL("../../scripts/course-content/build-artwork-production-inventory.mjs", import.meta.url));
  const before = await stat(fileURLToPath(inventoryPath), { bigint: true });
  const result = spawnSync(process.execPath, [builderPath, "--check"], {
    encoding: "utf8",
  });
  const after = await stat(fileURLToPath(inventoryPath), { bigint: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified .*production-inventory\.json/);
  assert.equal(after.mtimeNs, before.mtimeNs);
});
