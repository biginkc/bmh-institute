import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  ARTWORK_MASTER_POSE_CONTRACT,
  getArtworkPose,
  validateArtworkPoseContract,
} from "./artwork-pose-contract.mjs";

import {
  DEFAULT_PATHS,
  REPO_ROOT,
  approvePilots,
  assertPosterSafeEdges,
  createInitialLedger,
  deriveMaster,
  encodeFlatPng,
  finalizeArtwork,
  ingestGeneration,
  inspectArtworkFile,
  isPristinePreapprovalLedger,
  promotePilots,
  preparePipelineReprocess,
  readJson,
  reconcileManifestFromLedger,
  recordApprovedTextureExceptions,
  resolveRepoPath,
  reviewMaster,
  sha256,
  validateLedger,
  withWorkflowLock,
  writeJsonAtomic,
} from "./artwork-production-workflow.mjs";

const inventory = await readJson(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.inventory));
const manifest = await readJson(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.manifest));
const legacyPilotChecksums = await readJson(resolveRepoPath(REPO_ROOT, "docs/course-production/thumbnail-pilots/checksums.json"));
const legacyPilotLineage = await readJson(resolveRepoPath(REPO_ROOT, "docs/course-production/thumbnail-pilots/generation-lineage.json"));

async function tempRoot(t) {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "bmh-artwork-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeRepoFile(root, relativePath, contents) {
  const target = resolveRepoPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
  return target;
}

async function copyRepoFile(root, relativePath) {
  const target = resolveRepoPath(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(resolveRepoPath(REPO_ROOT, relativePath), target);
}

async function rgbPng(color, width = 1280, height = 720) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: color[0], g: color[1], b: color[2] },
    },
  })
    .png()
    .toBuffer();
}

async function pixelPng(width, height, pixelAt) {
  const data = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const color = pixelAt(column, row);
      const offset = (row * width + column) * 3;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function rawPixels(contents) {
  return sharp(contents).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

function productionLedger(sourceInventory = inventory) {
  const ledger = createInitialLedger(sourceInventory);
  ledger.status = "production";
  ledger.pilot_approval = {
    status: "approved",
    approved_by: "test reviewer",
    approved_at: "2026-07-16T21:30:00.000Z",
    evidence: "evidence/pilots.txt",
    evidence_sha256: "a".repeat(64),
  };
  return ledger;
}

function sharedParentInventory() {
  const candidate = structuredClone(inventory);
  candidate.schema_version = "bmh-artwork-production/v2";
  candidate.course_cover.background_rgb = [103, 182, 255];
  for (const lesson of candidate.lessons) {
    lesson.master.background_rgb = [103, 182, 255];
    lesson.lesson_card.derivative.normalize_background_rgb = [103, 182, 255];
    lesson.lesson_card.derivative.padding_color_rgb = [103, 182, 255];
    for (const poster of lesson.posters) {
      poster.derivative.normalize_background_rgb = [103, 182, 255];
      if (poster.direct_master) poster.direct_master.background_rgb = [103, 182, 255];
    }
  }
  const pilotLessons = candidate.lessons.filter((lesson) => lesson.pilot);
  for (const lesson of pilotLessons) {
    const review = lesson.pilot_review;
    review.assets = structuredClone(legacyPilotChecksums.assets.find((asset) => asset.slug === review.slug));
    review.generation_lineage = structuredClone(legacyPilotLineage.records.find((record) => record.slug === review.slug));
    review.checksum_record_path = "docs/course-production/thumbnail-pilots/checksums.json";
    review.generation_lineage_record_path = "docs/course-production/thumbnail-pilots/generation-lineage.json";
    delete review.identity_contract;
    delete review.identity_roots;
    delete review.lineage_schema_version;
  }
  const orientation = pilotLessons.find((lesson) => lesson.pilot_review.slug === "orientation");
  const originalParentStep = orientation.pilot_review.generation_lineage.steps[0];
  const sharedParent = {
    id: "shared-pilot-cast-parent",
    operation: "generate",
    prompt_path: originalParentStep.prompt_path,
    prompt_sha256: originalParentStep.prompt_sha256,
    inputs: originalParentStep.inputs.map((input, index) => ({
      id: `shared-parent-input-${index + 1}`,
      role: "canonical shared-parent reference",
      ...structuredClone(input),
    })),
    tool_evidence: structuredClone(originalParentStep.tool_evidence),
    output: structuredClone(originalParentStep.output),
  };
  for (const lesson of pilotLessons) {
    const review = lesson.pilot_review;
    const originalSteps = review.generation_lineage.steps;
    const sourceStep = review.slug === "orientation" ? originalSteps.at(-1) : originalSteps[0];
    const step = structuredClone(sourceStep);
    step.step = 1;
    step.operation = "edit";
    step.parent_source_sha256 = sharedParent.output.sha256;
    step.inputs = [
      {
        id: sharedParent.id,
        role: "shared generated cast parent",
        path: sharedParent.output.path,
        sha256: sharedParent.output.sha256,
      },
      ...step.inputs.filter((input) => input.sha256 !== sharedParent.output.sha256),
    ];
    review.generation_lineage = {
      slug: review.slug,
      shared_parent_id: sharedParent.id,
      terminal_output_sha256: step.output.sha256,
      steps: [step],
    };
    review.lineage_schema_version = "bmh-thumbnail-pilot-lineage/v2";
    review.shared_generation_parent = structuredClone(sharedParent);
  }
  return candidate;
}

function poseVariationInventory() {
  const candidate = structuredClone(inventory);
  candidate.schema_version = "bmh-artwork-production/v4-candidate";
  const applyDirection = (target, masterId) => {
    const direction = structuredClone(getArtworkPose(masterId));
    target.art_direction = direction;
    if ("background_rgb" in target) target.background_rgb = structuredClone(direction.background_rgb);
    return direction;
  };

  const coverDirection = applyDirection(candidate.course_cover, candidate.course_cover.id);
  candidate.course_cover.derivative.normalize_background_rgb = structuredClone(coverDirection.background_rgb);
  candidate.course_cover.derivative.padding_color_rgb = structuredClone(coverDirection.background_rgb);

  for (const lesson of candidate.lessons) {
    const lessonDirection = applyDirection(lesson.master, lesson.master.id);
    lesson.art_direction = structuredClone(lessonDirection);
    lesson.lesson_card.art_direction = structuredClone(lessonDirection);
    lesson.lesson_card.derivative.normalize_background_rgb = structuredClone(lessonDirection.background_rgb);
    lesson.lesson_card.derivative.padding_color_rgb = structuredClone(lessonDirection.background_rgb);
    for (const poster of lesson.posters) {
      const masterId = poster.direct_master?.id ?? lesson.master.id;
      const posterDirection = structuredClone(getArtworkPose(masterId));
      poster.art_direction = posterDirection;
      poster.derivative.normalize_background_rgb = structuredClone(posterDirection.background_rgb);
      if (poster.direct_master) applyDirection(poster.direct_master, masterId);
    }
    if (lesson.pilot) {
      lesson.pilot_review.lineage_schema_version = "bmh-thumbnail-pilot-lineage/v4-candidate";
      const lineage = lesson.pilot_review.generation_lineage;
      lineage.pose_label = lessonDirection.pose_id;
      lineage.pose_signature = lessonDirection.lineage_pose_signature;
      delete lineage.deterministic_character_lock;
    }
  }
  return candidate;
}

function pilotBindings(ledger) {
  const bySlug = new Map(ledger.masters.filter((master) => master.pilot).map((master) => [master.pilot.slug, master]));
  return ["orientation", "opening-the-call", "objection-architecture"].map((slug) => {
    const master = bySlug.get(slug);
    return {
      slug,
      terminal_output_sha256: master.pilot.lineage.terminal_output_sha256 ?? master.pilot.lineage.generation?.output_sha256,
      flat_master_sha256: master.pilot.assets.flat_master.sha256,
      lesson_card_sha256: master.pilot.assets.lesson_card.sha256,
      video_poster_sha256: master.pilot.assets.video_poster.sha256,
    };
  });
}

async function writePilotApprovalArtifact(root, ledger, mutate = () => {}) {
  const pilot = ledger.masters.find((master) => master.pilot).pilot;
  const lineagePath = pilot.lineage_record_path;
  for (const relativePath of [DEFAULT_PATHS.inventory, lineagePath, pilot.checksum_record_path]) await copyRepoFile(root, relativePath);
  const requestPath = "docs/course-production/thumbnail-pilots/approval-request.md";
  const request = Buffer.from("Approve the locked three-image BMH artwork pilot.\n");
  await writeRepoFile(root, requestPath, request);
  const bindings = pilotBindings(ledger);
  const bindingsText = bindings.map((binding) => `${binding.slug}|${binding.terminal_output_sha256}|${binding.flat_master_sha256}|${binding.lesson_card_sha256}|${binding.video_poster_sha256}\n`).join("");
  const artifact = {
    schema_version: "bmh-artwork-pilot-approval/v1",
    decision: "approved",
    approver: "Jarrad Henry",
    approved_at: "2026-07-16T22:00:00.000Z",
    request_binding: {
      request_id: "pilot-approval-2026-07-16",
      request_path: requestPath,
      request_sha256: sha256(request),
      pilot_bindings_sha256: sha256(bindingsText),
    },
    inventory_sha256: sha256(await readFile(resolveRepoPath(root, DEFAULT_PATHS.inventory))),
    generation_lineage_sha256: sha256(await readFile(resolveRepoPath(root, lineagePath))),
    pilot_bindings: bindings,
  };
  mutate(artifact);
  const evidence = "evidence/pilot-approval.json";
  await writeRepoFile(root, evidence, Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`));
  return { evidence, artifact };
}

test("tracked ledger validates the active fail-closed lifecycle while preserving the pristine preapproval template", async () => {
  const expected = createInitialLedger(inventory);
  assert.equal(isPristinePreapprovalLedger(expected), true);
  assert.equal(expected.status, "preapproval");
  assert.equal(expected.masters.length, 28);
  assert.equal(expected.assets.length, 49);
  assert.equal(expected.masters.filter((master) => master.planned_generation_call_id).length, 25);
  assert.equal(
    expected.assets.every((asset) => asset.approval_status === "missing" && asset.checksum_sha256 === null),
    true,
  );

  const tracked = await readJson(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.ledger));
  await validateLedger({
    root: REPO_ROOT,
    inventory,
    manifest,
    ledger: tracked,
    inspectFiles: true,
  });
  assert.equal(tracked.masters.length, 28);
  assert.equal(tracked.assets.length, 49);
  assert.equal(tracked.masters.filter((master) => master.planned_generation_call_id).length, 25);
  if (tracked.status === "preapproval") {
    assert.deepEqual(tracked, expected);
  } else {
    assert.equal(["pilot-approved", "production", "finalized"].includes(tracked.status), true);
    assert.equal(tracked.pilot_approval.status, "approved");
    assert.equal(tracked.pilot_approval.approved_by, "Jarrad Henry");
  }
  for (const asset of tracked.assets) {
    const manifestAsset = manifest.assets.find((candidate) => candidate.source_key === asset.asset_key);
    assert.equal(asset.base_storage_path, manifestAsset.storage_path, `${asset.asset_key} base storage path must match the preapproval manifest`);
  }
  assert.deepEqual(
    new Set(tracked.assets.filter((asset) => asset.kind === "video-poster").map((asset) => asset.derivative.recipe.crop_pixels_after_normalize.join(","))),
    new Set(["0,0,1280,720", "64,144,768,432", "448,144,768,432"]),
  );
  await validateLedger({
    root: REPO_ROOT,
    inventory,
    manifest,
    ledger: tracked,
  });
});

test("only a pristine preapproval ledger may be refreshed after inventory evidence changes", () => {
  const pristine = createInitialLedger(inventory);
  assert.equal(isPristinePreapprovalLedger(pristine), true);
  for (const mutate of [
    (ledger) => {
      ledger.status = "pilot-approved";
    },
    (ledger) => {
      ledger.pilot_approval.status = "approved";
    },
    (ledger) => {
      ledger.masters[0].lineage.push({ output_sha256: "a".repeat(64) });
    },
    (ledger) => {
      ledger.masters[0].review.status = "approved";
    },
    (ledger) => {
      ledger.assets[0].checksum_sha256 = "a".repeat(64);
    },
    (ledger) => {
      ledger.assets[0].history.push({ checksum_sha256: "a".repeat(64) });
    },
  ]) {
    const candidate = structuredClone(pristine);
    mutate(candidate);
    assert.equal(isPristinePreapprovalLedger(candidate), false);
  }
});

test("v4 inventory preserves one-person pose variation across every master and derived output", () => {
  const candidate = poseVariationInventory();
  const ledger = createInitialLedger(candidate);
  assert.equal(ledger.masters.length, 28);
  assert.equal(ledger.assets.length, 49);
  assert.equal(new Set(ledger.masters.map((master) => master.art_direction.pose_id)).size, 28);
  assert.equal(ledger.assets.every((asset) => asset.art_direction.people_count === 1 && asset.art_direction.skin_fill === "pure white"), true);

  const pilots = ledger.masters.filter((master) => master.pilot);
  assert.deepEqual(
    pilots.map((master) => [master.pilot.slug, master.pilot.lineage.pose_label]),
    [
      ["orientation", "standing-welcome"],
      ["opening-the-call", "seated-desk-call"],
      ["objection-architecture", "standing-reframe-gesture"],
    ],
  );
  assert.notEqual(pilots[0].pilot.lineage.pose_signature, pilots[1].pilot.lineage.pose_signature);

  const duplicateAndrea = poseVariationInventory();
  const orientation = duplicateAndrea.lessons.find((lesson) => lesson.pilot_review?.slug === "orientation");
  const opening = duplicateAndrea.lessons.find((lesson) => lesson.pilot_review?.slug === "opening-the-call");
  opening.pilot_review.generation_lineage.pose_signature = orientation.pilot_review.generation_lineage.pose_signature;
  assert.throws(() => createInitialLedger(duplicateAndrea), /pose signature|globally unique|drifts/i);

  const twoPeople = poseVariationInventory();
  twoPeople.lessons[1].master.art_direction.people_count = 2;
  assert.throws(() => createInitialLedger(twoPeople), /exactly one person/i);
});

test("pose contract requires seated and upright variance for both recurring characters", () => {
  assert.equal(validateArtworkPoseContract(), true);

  const adjacentRepeat = structuredClone(ARTWORK_MASTER_POSE_CONTRACT);
  adjacentRepeat[7].posture = adjacentRepeat[6].posture;
  assert.throws(
    () => validateArtworkPoseContract(adjacentRepeat),
    /repeats the previous .* posture/i,
  );

  const sellerWithoutSeatedVariance = structuredClone(ARTWORK_MASTER_POSE_CONTRACT);
  for (const entry of sellerWithoutSeatedVariance) {
    if (entry.character_id === "recurring-seller-approved") {
      entry.posture = "leaning-forward";
    }
  }
  assert.throws(
    () => validateArtworkPoseContract(sellerWithoutSeatedVariance),
    /repeats an existing pose|repeats the previous|at least five posture categories/i,
  );
});

test("validator rejects immutable palette, counts, pilot, and output-plan drift", async () => {
  const mutations = [
    (ledger) => {
      ledger.palette_rgb[0][0] += 1;
    },
    (ledger) => {
      ledger.counts.posters -= 1;
    },
    (ledger) => {
      ledger.masters.find((master) => master.pilot).pilot.slug = "drifted";
    },
    (ledger) => {
      ledger.masters[0].outputs[0].recipe.id = "drifted";
    },
  ];
  for (const mutate of mutations) {
    const ledger = createInitialLedger(inventory);
    mutate(ledger);
    await assert.rejects(
      validateLedger({
        root: REPO_ROOT,
        inventory,
        manifest,
        ledger,
        inspectFiles: false,
      }),
      /drifted|Locked/,
    );
  }
});

test("recipe-specific yellow normalization and padding are derived and inspected exactly", async (t) => {
  const root = await tempRoot(t);
  const yellowInventory = structuredClone(inventory);
  yellowInventory.course_cover.derivative.normalize_background_rgb = [255, 211, 1];
  yellowInventory.course_cover.derivative.padding_color_rgb = [255, 211, 1];
  const ledger = productionLedger(yellowInventory);
  const masterId = "master-program-bmh-employee-training";
  const source = await writeRepoFile(root, "provider/narrow-blue.png", await rgbPng([103, 182, 255], 640, 720));
  await ingestGeneration({
    root,
    ledger,
    masterId,
    sourceFile: source,
    generationCallId: "call-yellow-background",
    toolOutputId: "output-yellow-background",
    generatedAt: "2026-07-16T22:05:00.000Z",
    generatedBy: "test",
  });
  await deriveMaster({ root, ledger, masterId });
  const cover = ledger.assets.find((asset) => asset.kind === "course-cover");
  const { data, info } = await sharp(resolveRepoPath(root, cover.manifest_path)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  assert.deepEqual(pixel(640, 0), [255, 211, 1], "top padding must use the recipe yellow");
  assert.deepEqual(pixel(0, 400), [255, 211, 1], "contain normalization must use the recipe yellow");
  assert.deepEqual(pixel(640, 400), [103, 182, 255], "source pixels must remain distinct from padding");
  await inspectArtworkFile(root, cover, ledger.palette_rgb);

  await writeRepoFile(
    root,
    cover.manifest_path,
    await sharp({
      create: {
        width: 1280,
        height: 800,
        channels: 3,
        background: { r: 103, g: 182, b: 255 },
      },
    })
      .webp({ lossless: true })
      .toBuffer(),
  );
  await assert.rejects(inspectArtworkFile(root, cover, ledger.palette_rgb), /does not preserve exact recipe padding/);
});

test("flat encoding normalizes all four corners and an edge-connected yellow-amber field to one exact background token", async () => {
  const yellow = [255, 211, 1];
  const amber = [255, 174, 1];
  const source = await pixelPng(12, 8, (column, row) => ((column + row) % 3 === 0 ? amber : yellow));
  const flat = await encodeFlatPng(source, inventory.style_system.palette_rgb, yellow);
  const { data, info } = await rawPixels(flat);
  const token = (column, row) => [...data.subarray((row * info.width + column) * 3, (row * info.width + column) * 3 + 3)];
  assert.deepEqual(token(0, 0), yellow);
  assert.deepEqual(token(info.width - 1, 0), yellow);
  assert.deepEqual(token(0, info.height - 1), yellow);
  assert.deepEqual(token(info.width - 1, info.height - 1), yellow);
  for (let index = 0; index < data.length; index += 3) assert.deepEqual([...data.subarray(index, index + 3)], yellow);
});

test("background normalization preserves enclosed same-family fills behind black outlines and unrelated foreground", async () => {
  const blue = [103, 182, 255];
  const yellow = [255, 211, 1];
  const amber = [255, 174, 1];
  const green = [105, 153, 53];
  const black = [0, 0, 0];
  const source = await pixelPng(15, 15, (column, row) => {
    if (column >= 3 && column <= 11 && row >= 3 && row <= 11) {
      if (column === 3 || column === 11 || row === 3 || row === 11) return black;
      if (column === 7 && row === 7) return green;
      return (column + row) % 5 === 0 ? amber : yellow;
    }
    return blue;
  });
  const flat = await encodeFlatPng(source, inventory.style_system.palette_rgb, blue);
  const { data, info } = await rawPixels(flat);
  const token = (column, row) => [...data.subarray((row * info.width + column) * 3, (row * info.width + column) * 3 + 3)];
  assert.deepEqual(token(4, 4), yellow, "enclosed yellow family remains foreground rather than becoming background");
  assert.deepEqual(token(7, 7), green, "non-edge foreground remains unchanged");
  assert.deepEqual(token(3, 3), black, "black outline remains intact");
  assert.deepEqual(token(0, 7), blue, "edge-connected background remains exact");
});

test("enclosed fill cleanup removes same-family texture without crossing black outlines", async () => {
  const blue = [103, 182, 255];
  const white = [255, 255, 255];
  const cream = [254, 255, 198];
  const black = [0, 0, 0];
  const source = await pixelPng(15, 15, (column, row) => {
    if (column >= 3 && column <= 11 && row >= 3 && row <= 11) {
      if (column === 3 || column === 11 || row === 3 || row === 11) return black;
      return (column + row) % 4 === 0 ? cream : white;
    }
    return blue;
  });
  const flat = await encodeFlatPng(source, inventory.style_system.palette_rgb, blue);
  const { data, info } = await rawPixels(flat);
  for (let row = 4; row <= 10; row += 1) {
    for (let column = 4; column <= 10; column += 1) {
      const offset = (row * info.width + column) * 3;
      assert.deepEqual([...data.subarray(offset, offset + 3)], white);
    }
  }
});

test("poster review edge gate accepts exact safe borders and rejects edge-contact foreground", async () => {
  const blue = [103, 182, 255];
  const black = [0, 0, 0];
  const safe = await pixelPng(24, 16, (column, row) => (column >= 6 && column <= 17 && row >= 6 && row <= 9 ? black : blue));
  await assertPosterSafeEdges(safe, blue, "safe synthetic poster", 4);
  const unsafe = await pixelPng(24, 16, (column, row) => (column === 0 && row === 8 ? black : blue));
  await assert.rejects(assertPosterSafeEdges(unsafe, blue, "unsafe synthetic poster", 4), /non-background pixels in its 4px safe edge/);
});

test("artwork recipes fail closed when normalization or padding RGB is not locked", () => {
  for (const mutate of [
    (candidate) => {
      candidate.course_cover.derivative.normalize_background_rgb = [1, 2, 3];
    },
    (candidate) => {
      delete candidate.course_cover.derivative.padding_color_rgb;
    },
    (candidate) => {
      candidate.lessons[0].posters[0].derivative.normalize_background_rgb = [255, 211, 2];
    },
  ]) {
    const candidate = structuredClone(inventory);
    mutate(candidate);
    assert.throws(() => createInitialLedger(candidate), /RGB triplet|locked blue or yellow/);
  }
});

test("pilot v2 records one shared canonical parent while keeping child lineage globally unique", async (t) => {
  const root = await tempRoot(t);
  const v2Inventory = sharedParentInventory();
  const ledger = createInitialLedger(v2Inventory);
  await validateLedger({
    root: REPO_ROOT,
    inventory: v2Inventory,
    manifest,
    ledger,
    inspectFiles: false,
  });
  const pilots = ledger.masters.filter((master) => master.pilot);
  const parent = pilots[0].pilot.shared_generation_parent;
  assert.equal(new Set(pilots.map((master) => master.pilot.lineage.shared_parent_id)).size, 1);
  assert.equal(
    pilots.every((master) => master.pilot.shared_generation_parent.id === parent.id),
    true,
  );

  ledger.status = "pilot-approved";
  ledger.pilot_approval = {
    status: "approved",
    approved_by: "Jarrad Henry",
    approved_at: "2026-07-16T22:00:00.000Z",
    evidence: "evidence/pilot.json",
    evidence_sha256: "1".repeat(64),
  };
  for (const master of pilots) {
    for (const asset of Object.values(master.pilot.assets)) {
      if (asset && typeof asset === "object" && asset.path) await copyRepoFile(root, asset.path);
    }
  }
  await promotePilots({ root, ledger });
  for (const master of pilots) {
    assert.equal(master.lineage[0].operation, "pilot-correction");
    assert.equal(master.lineage[0].parent_source_sha256, parent.output.sha256);
    assert.equal(master.lineage[0].reference_inputs[0].sha256, parent.output.sha256);
  }
  assert.equal(pilots.flatMap((master) => master.lineage).filter((step) => step.output_sha256 === parent.output.sha256).length, 0, "the canonical shared generation must not be duplicated as three child generation steps");
});

test("pilot v2 rejects shared-parent misuse and duplicate canonical or child ids", () => {
  const cases = [
    {
      mutate: (candidate) => {
        candidate.lessons.find((lesson) => lesson.pilot).pilot_review.generation_lineage.shared_parent_id = "unresolved-parent";
      },
      pattern: /shared parent does not resolve/,
    },
    {
      mutate: (candidate) => {
        const review = candidate.lessons.find((lesson) => lesson.pilot).pilot_review;
        review.generation_lineage.steps[0].parent_source_sha256 = "f".repeat(64);
      },
      pattern: /lineage is disconnected/,
    },
    {
      mutate: (candidate) => {
        const reviews = candidate.lessons.filter((lesson) => lesson.pilot).map((lesson) => lesson.pilot_review);
        const conflictingSha = "e".repeat(64);
        reviews[1].shared_generation_parent.output.sha256 = conflictingSha;
        reviews[1].generation_lineage.steps[0].parent_source_sha256 = conflictingSha;
        reviews[1].generation_lineage.steps[0].inputs[0].sha256 = conflictingSha;
      },
      pattern: /has conflicting definitions/,
    },
    {
      mutate: (candidate) => {
        const review = candidate.lessons.find((lesson) => lesson.pilot).pilot_review;
        review.generation_lineage.steps[0].tool_evidence.invocation_call_id = review.shared_generation_parent.tool_evidence.invocation_call_id;
      },
      pattern: /invocation ids must be globally unique/,
    },
    {
      mutate: (candidate) => {
        const reviews = candidate.lessons.filter((lesson) => lesson.pilot).map((lesson) => lesson.pilot_review);
        reviews[1].generation_lineage.steps[0].tool_evidence.tool_output_id = reviews[0].generation_lineage.steps[0].tool_evidence.tool_output_id;
      },
      pattern: /tool output ids must be globally unique/,
    },
  ];
  for (const { mutate, pattern } of cases) {
    const candidate = sharedParentInventory();
    mutate(candidate);
    assert.throws(() => createInitialLedger(candidate), pattern);
  }
});

test("pilot v3 rejects mixed roots, extra people, wrong character ids, and stale lineage", () => {
  const pilotReviews = (candidate) => candidate.lessons.filter((lesson) => lesson.pilot).map((lesson) => lesson.pilot_review);
  const cases = [
    {
      mutate: (candidate) => {
        const review = pilotReviews(candidate)[0];
        review.identity_roots[1] = structuredClone(review.identity_roots[0]);
      },
      pattern: /identity roots cannot be mixed or duplicated/,
    },
    {
      mutate: (candidate) => {
        pilotReviews(candidate)[0].generation_lineage.character_ids = ["andrea-approved", "recurring-seller-approved"];
      },
      pattern: /one-person character contract/,
    },
    {
      mutate: (candidate) => {
        pilotReviews(candidate)[0].generation_lineage.character_id = "recurring-seller-approved";
      },
      pattern: /exact character id drifted/,
    },
    {
      mutate: (candidate) => {
        pilotReviews(candidate)[2].generation_lineage.generation.output_sha256 = "f".repeat(64);
      },
      pattern: /source checksum drifted from lineage/,
    },
  ];
  for (const { mutate, pattern } of cases) {
    const candidate = structuredClone(inventory);
    mutate(candidate);
    assert.throws(() => createInitialLedger(candidate), pattern);
  }
});

test("validator rejects impossible lifecycle and replacement states", async () => {
  const cases = [
    (ledger) => {
      ledger.masters[0].status = "derived";
    },
    (ledger) => {
      ledger.status = "pilot-approved";
    },
    (ledger) => {
      ledger.status = "production";
    },
    (ledger) => {
      ledger.assets[0].replacement_authorized_checksum = "a".repeat(64);
    },
    (ledger) => {
      ledger.final_approval = { ...ledger.final_approval, status: "approved" };
    },
  ];
  for (const mutate of cases) {
    const ledger = createInitialLedger(inventory);
    mutate(ledger);
    await assert.rejects(
      validateLedger({
        root: REPO_ROOT,
        inventory,
        manifest,
        ledger,
        inspectFiles: false,
      }),
    );
  }
});

test("atomic JSON writes leave complete parseable state", async (t) => {
  const root = await tempRoot(t);
  const target = path.join(root, "state", "ledger.json");
  await writeJsonAtomic(target, { sequence: 1, value: "first" });
  await writeJsonAtomic(target, { sequence: 2, value: "second" });
  assert.deepEqual(JSON.parse(await readFile(target, "utf8")), {
    sequence: 2,
    value: "second",
  });
});

test("atomic writes accept a legitimate symlinked system temp root", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bmh-artwork-system-root-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  if ((await realpath(root)) === path.resolve(root)) return;
  const target = path.join(root, "state", "ledger.json");
  await writeJsonAtomic(target, { accepted: true }, { root });
  assert.deepEqual(await readJson(target), { accepted: true });
});

test("atomic writes create and persist a deeply nested repository path", async (t) => {
  const root = await tempRoot(t);
  const target = path.join(root, "lineage", "master", "derivatives", "state.json");
  await writeJsonAtomic(target, { durable: true }, { root });
  assert.deepEqual(await readJson(target), { durable: true });
  assert.equal((await lstat(path.dirname(target))).isDirectory(), true);
});

test("workflow lock serializes concurrent ledger writers without lost updates", async (t) => {
  const root = await tempRoot(t);
  const ledgerPath = resolveRepoPath(root, DEFAULT_PATHS.ledger);
  await writeJsonAtomic(ledgerPath, { count: 0 }, { root });
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      withWorkflowLock(root, async () => {
        const current = await readJson(ledgerPath);
        await new Promise((resolve) => setTimeout(resolve, (index % 3) + 1));
        await writeJsonAtomic(ledgerPath, { count: current.count + 1 }, { root });
      }),
    ),
  );
  assert.deepEqual(await readJson(ledgerPath), { count: 12 });
});

test("status and verify wait for the workflow transaction lock", async () => {
  const cliPath = resolveRepoPath(REPO_ROOT, "scripts/course-content/artwork-production.mjs");
  for (const command of ["status", "verify"]) {
    let child;
    let exited = false;
    let output = "";
    let errors = "";
    let exitPromise;
    await withWorkflowLock(REPO_ROOT, async () => {
      child = spawn(process.execPath, [cliPath, command], { cwd: REPO_ROOT });
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        errors += chunk;
      });
      exitPromise = new Promise((resolve) =>
        child.once("exit", (code, signal) => {
          exited = true;
          resolve({ code, signal });
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(exited, false, `${command} read escaped the workflow transaction lock`);
    });
    const exit = await exitPromise;
    assert.deepEqual(exit, { code: 0, signal: null }, `${command} failed after lock release: ${errors}`);
    assert.doesNotThrow(() => JSON.parse(output));
  }
});

test("finalized ledger recovers a drifted manifest without mutating canonical ledger state", async (t) => {
  const ledger = createInitialLedger(inventory);
  ledger.assets.forEach((asset, index) => {
    asset.checksum_sha256 = index.toString(16).padStart(64, "0");
    asset.size_bytes = index + 1;
    asset.approval_status = "approved";
    const extension = path.posix.extname(asset.base_storage_path);
    asset.storage_path = `${asset.base_storage_path.slice(0, -extension.length)}-${asset.checksum_sha256}${extension}`;
  });
  ledger.status = "finalized";
  const drifted = structuredClone(manifest);
  for (const asset of drifted.assets.filter((candidate) => ledger.assets.some((entry) => entry.asset_key === candidate.source_key))) {
    asset.storage_path = `drifted/${asset.source_key}.webp`;
  }
  const before = JSON.stringify(ledger);
  const reconciled = reconcileManifestFromLedger(ledger, drifted);
  assert.equal(JSON.stringify(ledger), before, "reconcile must not mutate the finalized source-of-truth ledger");
  for (const asset of ledger.assets) {
    const manifestAsset = reconciled.assets.find((candidate) => candidate.source_key === asset.asset_key);
    assert.equal(manifestAsset.approval_status, "approved");
    assert.equal(manifestAsset.storage_path.endsWith(`-${asset.checksum_sha256}.webp`), true);
    assert.equal(asset.storage_path, manifestAsset.storage_path);
  }
  const root = await tempRoot(t);
  const recoveredPath = path.join(root, "manifest.json");
  await writeJsonAtomic(recoveredPath, reconciled);
  const firstBytes = await readFile(recoveredPath);
  await writeJsonAtomic(recoveredPath, reconcileManifestFromLedger(ledger, reconciled));
  assert.deepEqual(await readFile(recoveredPath), firstBytes, "crash recovery rerun must persist byte-identical manifest state");
});

test("pilot approval requires the exact affirmative Jarrad Henry controller artifact", async (t) => {
  const root = await tempRoot(t);
  const cases = [
    {
      label: "arbitrary reviewer",
      approvedBy: "Generic Reviewer",
      mutate: () => {},
      pattern: /requires approver Jarrad Henry/,
    },
    {
      label: "missing decision",
      approvedBy: "Jarrad Henry",
      mutate: (artifact) => {
        delete artifact.decision;
      },
      pattern: /decision must be approved/,
    },
    {
      label: "tampered binding",
      approvedBy: "Jarrad Henry",
      mutate: (artifact) => {
        artifact.pilot_bindings[0].lesson_card_sha256 = "0".repeat(64);
      },
      pattern: /bindings drifted/,
    },
    {
      label: "fabricated generic evidence",
      approvedBy: "Jarrad Henry",
      mutate: (artifact) => {
        artifact.schema_version = "generic-approval/v1";
      },
      pattern: /schema is invalid/,
    },
  ];
  for (const candidate of cases) {
    const ledger = createInitialLedger(inventory);
    const { evidence } = await writePilotApprovalArtifact(root, ledger, candidate.mutate);
    await assert.rejects(
      approvePilots({
        root,
        ledger,
        approvedBy: candidate.approvedBy,
        approvedAt: "2026-07-16T22:00:00.000Z",
        evidence,
      }),
      candidate.pattern,
      candidate.label,
    );
    assert.equal(ledger.status, "preapproval");
  }
  const ledger = createInitialLedger(inventory);
  const { evidence, artifact } = await writePilotApprovalArtifact(root, ledger);
  await writeRepoFile(root, artifact.request_binding.request_path, Buffer.from("tampered request\n"));
  await assert.rejects(
    approvePilots({
      root,
      ledger,
      approvedBy: "Jarrad Henry",
      approvedAt: artifact.approved_at,
      evidence,
    }),
    /request file drifted/,
  );
});

test("pilot promotion copies all approved bytes and never regenerates the approved card/poster", async (t) => {
  const root = await tempRoot(t);
  const ledger = createInitialLedger(inventory);
  const pilots = ledger.masters.filter((master) => master.pilot);
  for (const reference of ledger.references) await copyRepoFile(root, reference.path);
  for (const master of pilots) {
    for (const asset of Object.values(master.pilot.assets)) {
      if (asset && typeof asset === "object" && asset.path) await copyRepoFile(root, asset.path);
    }
    const generation = master.pilot.lineage.generation;
    await copyRepoFile(root, generation.prompt_path);
    await copyRepoFile(root, generation.output_path);
    if (generation.parent_path) await copyRepoFile(root, generation.parent_path);
    await copyRepoFile(root, master.pilot.lineage.contact_sheet_input.path);
  }
  const { evidence } = await writePilotApprovalArtifact(root, ledger);
  await approvePilots({
    root,
    ledger,
    approvedBy: "Jarrad Henry",
    approvedAt: "2026-07-16T22:00:00.000Z",
    evidence,
  });
  const requestIdTamper = structuredClone(ledger);
  requestIdTamper.pilot_approval.request_id = "different-request";
  await assert.rejects(
    validateLedger({
      root,
      inventory,
      manifest,
      ledger: requestIdTamper,
      inspectFiles: false,
    }),
    /Stored pilot approval request_id drifted/,
  );
  const bindingsTamper = structuredClone(ledger);
  bindingsTamper.pilot_approval.pilot_bindings_sha256 = "0".repeat(64);
  await assert.rejects(
    validateLedger({
      root,
      inventory,
      manifest,
      ledger: bindingsTamper,
      inspectFiles: false,
    }),
    /Stored pilot approval bindings checksum drifted/,
  );
  await promotePilots({ root, ledger });
  for (const master of pilots) {
    assert.deepEqual(await readFile(resolveRepoPath(root, master.source_path)), await readFile(resolveRepoPath(root, master.pilot.assets.source.path)));
    assert.deepEqual(await readFile(resolveRepoPath(root, master.flat_master_path)), await readFile(resolveRepoPath(root, master.pilot.assets.flat_master.path)));
    const card = ledger.assets.find((asset) => asset.provenance.master_id === master.id && asset.kind === "lesson-card");
    const poster = ledger.assets.find((asset) => asset.provenance.master_id === master.id && asset.kind === "video-poster");
    assert.equal(card.checksum_sha256, master.pilot.assets.lesson_card.sha256);
    assert.equal(poster.checksum_sha256, master.pilot.assets.video_poster.sha256);
  }
  await validateLedger({ root, inventory, manifest, ledger });
  const orientation = pilots.find((master) => master.pilot.slug === "orientation");
  const approvedCardBefore = (await readFile(resolveRepoPath(root, orientation.pilot.assets.lesson_card.path))).toString("hex");
  const approvedPosterBefore = (await readFile(resolveRepoPath(root, orientation.pilot.assets.video_poster.path))).toString("hex");
  await deriveMaster({ root, ledger, masterId: orientation.id });
  const mindset = ledger.assets.find((asset) => asset.asset_key === "poster-video-slot-01-mindset");
  const mindsetRecord = await inspectArtworkFile(root, mindset, ledger.palette_rgb);
  assert.deepEqual(mindset.dimensions, [1280, 720]);
  assert.equal((await sharp(mindsetRecord.contents).metadata()).width, 1280);
  assert.equal((await sharp(mindsetRecord.contents).metadata()).height, 720);
  const welcome = ledger.assets.find((asset) => asset.asset_key === "poster-video-slot-01-welcome");
  assert.notEqual(mindset.pixel_sha256, welcome.pixel_sha256, "Mindset must not duplicate the approved Welcome poster");
  await validateLedger({ root, inventory, manifest, ledger });
  const provenanceTamper = structuredClone(ledger);
  provenanceTamper.assets.find((asset) => asset.asset_key === mindset.asset_key).provenance.terminal_source_sha256 = "f".repeat(64);
  await assert.rejects(
    validateLedger({
      root,
      inventory,
      manifest,
      ledger: provenanceTamper,
      inspectFiles: false,
    }),
    /terminal source provenance drifted/,
  );
  const persistedLedgerPath = resolveRepoPath(root, "state/production-ledger.json");
  await writeJsonAtomic(persistedLedgerPath, ledger);
  const reloaded = await readJson(persistedLedgerPath);
  const hashesBeforeReloadedDerive = reloaded.assets.filter((asset) => asset.provenance.master_id === orientation.id).map((asset) => [asset.asset_key, asset.checksum_sha256, asset.pixel_sha256]);
  await deriveMaster({ root, ledger: reloaded, masterId: orientation.id });
  assert.deepEqual(
    reloaded.assets.filter((asset) => asset.provenance.master_id === orientation.id).map((asset) => [asset.asset_key, asset.checksum_sha256, asset.pixel_sha256]),
    hashesBeforeReloadedDerive,
    "persist/reload derive rerun must verify without changing hashes",
  );
  assert.equal((await readFile(resolveRepoPath(root, orientation.pilot.assets.lesson_card.path))).toString("hex"), approvedCardBefore);
  assert.equal((await readFile(resolveRepoPath(root, orientation.pilot.assets.video_poster.path))).toString("hex"), approvedPosterBefore);
  orientation.review = {
    status: "approved",
    reviewed_by: "test",
    reviewed_at: "2026-07-16T22:10:00.000Z",
    evidence: "kept",
    evidence_sha256: "b".repeat(64),
  };
  const beforeRepeatPromotion = structuredClone(ledger);
  await promotePilots({ root, ledger });
  assert.deepEqual(ledger, beforeRepeatPromotion, "repeated promotion must verify without resetting derived/reviewed state");
});

test("ingest rejects transparent PNG and symlink provider inputs", async (t) => {
  const root = await tempRoot(t);
  const ledger = productionLedger();
  const alpha = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const alphaPath = await writeRepoFile(root, "provider/alpha.png", alpha);
  await assert.rejects(
    ingestGeneration({
      root,
      ledger,
      masterId: "master-program-bmh-employee-training",
      sourceFile: alphaPath,
      generationCallId: "call-alpha",
      toolOutputId: "output-alpha",
      generatedAt: "2026-07-16T22:01:00.000Z",
      generatedBy: "test",
    }),
    /must not contain alpha/,
  );
  const opaquePath = await writeRepoFile(root, "provider/opaque.png", await rgbPng([12, 24, 36], 32, 32));
  const linkPath = resolveRepoPath(root, "provider/link.png");
  const { symlink } = await import("node:fs/promises");
  await symlink(opaquePath, linkPath);
  await assert.rejects(
    ingestGeneration({
      root,
      ledger,
      masterId: "master-program-bmh-employee-training",
      sourceFile: linkPath,
      generationCallId: "call-link",
      toolOutputId: "output-link",
      generatedAt: "2026-07-16T22:02:00.000Z",
      generatedBy: "test",
    }),
    /contains a symlink/,
  );
});

test("writes reject a symlinked repository ancestor before touching the external target", async (t) => {
  const root = await tempRoot(t);
  const outside = await tempRoot(t);
  const ledger = productionLedger();
  await mkdir(resolveRepoPath(root, "course-assets/thumbnails"), {
    recursive: true,
  });
  await symlink(outside, resolveRepoPath(root, "course-assets/thumbnails/production"));
  const provider = await writeRepoFile(root, "provider/source.png", await rgbPng([103, 182, 255]));
  await assert.rejects(
    ingestGeneration({
      root,
      ledger,
      masterId: "master-program-bmh-employee-training",
      sourceFile: provider,
      generationCallId: "call-safe-write",
      toolOutputId: "output-safe-write",
      generatedAt: "2026-07-16T22:05:00.000Z",
      generatedBy: "test",
    }),
    /Write ancestor must be a real directory|contains a symlink/,
  );
  await assert.rejects(lstat(path.join(outside, "sources/program-bmh-employee-training-generated.png")), /ENOENT/);
});

test("duplicate poster candidates are rejected before publication and remain correctable", async (t) => {
  const root = await tempRoot(t);
  const ledger = productionLedger();
  const masterId = "master-slot-08";
  const source = await writeRepoFile(root, "provider/uniform.png", await rgbPng([103, 182, 255]));
  await ingestGeneration({
    root,
    ledger,
    masterId,
    sourceFile: source,
    generationCallId: "call-uniform",
    toolOutputId: "output-uniform",
    generatedAt: "2026-07-16T22:05:00.000Z",
    generatedBy: "test",
  });
  await assert.rejects(deriveMaster({ root, ledger, masterId }), /duplicates an existing poster's decoded pixels/);
  const master = ledger.masters.find((candidate) => candidate.id === masterId);
  assert.equal(master.status, "source-ready");
  for (const outputRef of master.outputs) {
    const output = ledger.assets.find((asset) => asset.asset_key === outputRef.asset_key);
    assert.equal(output.checksum_sha256, null);
    await assert.rejects(lstat(resolveRepoPath(root, output.manifest_path)), /ENOENT/);
  }
  await assert.rejects(lstat(resolveRepoPath(root, master.flat_master_path)), /ENOENT/);
  const correctionPrompt = "evidence/duplicate-correction.txt";
  await writeRepoFile(root, correctionPrompt, Buffer.from("make each crop visually distinct"));
  const corrected = await writeRepoFile(root, "provider/corrected.png", await rgbPng([255, 197, 0]));
  await ingestGeneration({
    root,
    ledger,
    masterId,
    sourceFile: corrected,
    generationCallId: "call-corrected",
    toolOutputId: "output-corrected",
    generatedAt: "2026-07-16T22:06:00.000Z",
    generatedBy: "test",
    correctionPromptPath: correctionPrompt,
    parentSha256: master.terminal_source_sha256,
  });
  assert.equal(master.lineage.length, 2);
  assert.equal(master.status, "source-ready");
});

test("output inspection rejects lossy WebP even when dimensions and palette look valid", async (t) => {
  const root = await tempRoot(t);
  const asset = createInitialLedger(inventory).assets.find((candidate) => candidate.kind === "video-poster");
  const lossy = await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 3,
      background: { r: 103, g: 182, b: 255 },
    },
  })
    .webp({ lossless: false, quality: 80 })
    .toBuffer();
  await writeRepoFile(root, asset.manifest_path, lossy);
  await assert.rejects(inspectArtworkFile(root, asset, inventory.style_system.palette_rgb), /must be lossless/);
});

test("correction archives rejected derivatives and authorizes only their exact replacement", async (t) => {
  const root = await tempRoot(t);
  const ledger = productionLedger();
  const masterId = "master-program-bmh-employee-training";
  const firstPath = await writeRepoFile(root, "provider/first.png", await rgbPng([103, 182, 255]));
  const firstIngest = {
    root,
    ledger,
    masterId,
    sourceFile: firstPath,
    generationCallId: "call-first",
    toolOutputId: "output-first",
    generatedAt: "2026-07-16T22:03:00.000Z",
    generatedBy: "test",
  };
  await ingestGeneration(firstIngest);
  const firstReplaySnapshot = JSON.stringify(ledger);
  await ingestGeneration(firstIngest);
  assert.equal(JSON.stringify(ledger), firstReplaySnapshot, "exact initial ingest replay must be a no-op");
  await assert.rejects(ingestGeneration({ ...firstIngest, parentSha256: "0".repeat(64) }), /replay parent checksum differs/);
  const unexpectedPromptPath = "evidence/unexpected-initial-replay-prompt.txt";
  await writeRepoFile(root, unexpectedPromptPath, Buffer.from("unexpected correction semantics"));
  await assert.rejects(
    ingestGeneration({
      ...firstIngest,
      correctionPromptPath: unexpectedPromptPath,
    }),
    /replay correction prompt path differs/,
  );
  await deriveMaster({ root, ledger, masterId });
  const output = ledger.assets.find((asset) => asset.provenance.master_id === masterId);
  const firstChecksum = output.checksum_sha256;
  const firstPixelChecksum = output.pixel_sha256;
  const master = ledger.masters.find((candidate) => candidate.id === masterId);
  const reviewEvidence = "evidence/review.txt";
  await writeRepoFile(root, reviewEvidence, Buffer.from([master.id, master.terminal_source_sha256, master.flat_master_sha256, output.asset_key, output.checksum_sha256, output.pixel_sha256].join("\n")));
  await assert.rejects(
    reviewMaster({
      root,
      ledger,
      masterId,
      decision: "approved",
      reviewedBy: "reviewer",
      reviewedAt: "2026-07-16T22:02:59.000Z",
      evidence: reviewEvidence,
    }),
    /review predates generation/,
  );
  const badReviewEvidence = "evidence/bad-review.txt";
  await writeRepoFile(root, badReviewEvidence, Buffer.from(master.id));
  await assert.rejects(
    reviewMaster({
      root,
      ledger,
      masterId,
      decision: "approved",
      reviewedBy: "reviewer",
      reviewedAt: "2026-07-16T22:03:30.000Z",
      evidence: badReviewEvidence,
    }),
    /does not bind/,
  );
  await reviewMaster({
    root,
    ledger,
    masterId,
    decision: "approved",
    reviewedBy: "reviewer",
    reviewedAt: "2026-07-16T22:03:30.000Z",
    evidence: reviewEvidence,
  });
  assert.equal(output.provenance.review_evidence, reviewEvidence);
  const reviewedSnapshot = structuredClone(master.review);
  await deriveMaster({ root, ledger, masterId });
  assert.equal(output.checksum_sha256, firstChecksum, "same runtime rerun must be deterministic");
  assert.deepEqual(master.review, reviewedSnapshot, "derive rerun must not clear an existing review");
  const promptPath = "evidence/correction.txt";
  await writeRepoFile(root, promptPath, Buffer.from("change the background to locked yellow"));
  const secondPath = await writeRepoFile(root, "provider/second.png", await rgbPng([255, 197, 0]));
  const parent = ledger.masters.find((master) => master.id === masterId).terminal_source_sha256;
  await assert.rejects(
    ingestGeneration({
      root,
      ledger,
      masterId,
      sourceFile: secondPath,
      generationCallId: "call-too-early",
      toolOutputId: "output-too-early",
      generatedAt: "2026-07-16T22:02:00.000Z",
      generatedBy: "test",
      correctionPromptPath: promptPath,
      parentSha256: parent,
    }),
    /predates its lineage tail/,
  );
  const correctionIngest = {
    root,
    ledger,
    masterId,
    sourceFile: secondPath,
    generationCallId: "call-second",
    toolOutputId: "output-second",
    generatedAt: "2026-07-16T22:04:00.000Z",
    generatedBy: "test",
    correctionPromptPath: promptPath,
    parentSha256: parent,
  };
  await ingestGeneration(correctionIngest);
  const correctionReplaySnapshot = JSON.stringify(ledger);
  await ingestGeneration(correctionIngest);
  assert.equal(JSON.stringify(ledger), correctionReplaySnapshot, "exact correction replay must be a no-op");
  await assert.rejects(ingestGeneration({ ...correctionIngest, parentSha256: "f".repeat(64) }), /replay parent checksum differs/);
  const alternatePromptPath = "evidence/correction-copy.txt";
  await writeRepoFile(root, alternatePromptPath, Buffer.from("change the background to locked yellow"));
  await assert.rejects(
    ingestGeneration({
      ...correctionIngest,
      correctionPromptPath: alternatePromptPath,
    }),
    /replay correction prompt path differs/,
  );
  await writeRepoFile(root, promptPath, Buffer.from("tampered correction prompt"));
  await assert.rejects(ingestGeneration(correctionIngest), /replay correction prompt checksum differs/);
  await writeRepoFile(root, promptPath, Buffer.from("change the background to locked yellow"));
  assert.equal(output.history.length, 1);
  assert.equal(output.history[0].checksum_sha256, firstChecksum);
  assert.equal(output.history[0].pixel_sha256, firstPixelChecksum);
  assert.equal(sha256(await readFile(resolveRepoPath(root, output.history[0].archived_path))), firstChecksum);
  assert.equal(output.replacement_authorized_checksum, firstChecksum);
  const crashedRun = structuredClone(ledger);
  await deriveMaster({ root, ledger: crashedRun, masterId });
  const crashedChecksum = crashedRun.assets.find((asset) => asset.asset_key === output.asset_key).checksum_sha256;
  await deriveMaster({ root, ledger, masterId });
  assert.equal(output.checksum_sha256, crashedChecksum, "restart must adopt deterministic candidate bytes already published before ledger persistence");
  assert.notEqual(output.checksum_sha256, firstChecksum);
  assert.equal(output.replacement_authorized_checksum, null);
  const inspected = await inspectArtworkFile(root, output, ledger.palette_rgb);
  assert.equal(inspected.checksum_sha256, output.checksum_sha256);
});

test("pipeline reprocess archives exact prior bytes and deterministically rebuilds without new generation lineage", async (t) => {
  const root = await tempRoot(t);
  const ledger = productionLedger();
  const masterId = "master-program-bmh-employee-training";
  const source = await writeRepoFile(root, "provider/reprocess.png", await rgbPng([103, 182, 255]));
  await ingestGeneration({
    root,
    ledger,
    masterId,
    sourceFile: source,
    generationCallId: "call-reprocess",
    toolOutputId: "output-reprocess",
    generatedAt: "2026-07-16T22:03:00.000Z",
    generatedBy: "test",
  });
  await deriveMaster({ root, ledger, masterId });
  const master = ledger.masters.find((candidate) => candidate.id === masterId);
  const output = ledger.assets.find((asset) => asset.provenance.master_id === masterId);
  const lineageLength = master.lineage.length;
  const firstFlat = master.flat_master_sha256;
  const firstOutput = output.checksum_sha256;
  await preparePipelineReprocess({ root, ledger, masterId });
  assert.equal(master.status, "source-ready");
  assert.equal(master.lineage.length, lineageLength, "pipeline reprocess must not invent image generation lineage");
  assert.equal(master.flat_history.at(-1).checksum_sha256, firstFlat);
  assert.equal(output.history.at(-1).checksum_sha256, firstOutput);
  await deriveMaster({ root, ledger, masterId });
  assert.equal(master.status, "derived");
  assert.equal(master.lineage.length, lineageLength);
  assert.equal(master.flat_master_sha256, firstFlat, "same source and pipeline rebuild deterministically");
  assert.equal(output.checksum_sha256, firstOutput, "same derivative rebuild deterministically");
  assert.equal(master.flat_replacement_authorized_checksum, null);
  assert.equal(output.replacement_authorized_checksum, null);
});

test("poster-only correction preserves the approved card bytes while replacing every poster from the corrected source", async (t) => {
  const root = await tempRoot(t);
  const ledger = productionLedger();
  const masterId = "master-slot-04";
  const master = ledger.masters.find((candidate) => candidate.id === masterId);
  const background = master.background_rgb;
  const initialSource = await writeRepoFile(
    root,
    "provider/poster-only-initial.png",
    await pixelPng(1280, 720, (column, row) => {
      if (row >= 250 && row < 350 && ((column >= 150 && column < 250) || (column >= 590 && column < 690) || (column >= 1030 && column < 1130))) return [0, 0, 0];
      return background;
    }),
  );
  await ingestGeneration({
    root,
    ledger,
    masterId,
    sourceFile: initialSource,
    generationCallId: "call-poster-only-initial",
    toolOutputId: "output-poster-only-initial",
    generatedAt: "2026-07-16T22:04:00.000Z",
    generatedBy: "test",
  });
  await deriveMaster({ root, ledger, masterId });

  const card = ledger.assets.find((asset) => asset.asset_key === "thumbnail-slot-04");
  const posters = ledger.assets.filter((asset) => asset.provenance.master_id === masterId && asset.kind === "video-poster");
  const priorCardContents = await readFile(resolveRepoPath(root, card.output_path));
  const priorCardChecksum = card.checksum_sha256;
  const priorFlatChecksum = master.flat_master_sha256;
  const priorPosterChecksums = new Map(posters.map((poster) => [poster.asset_key, poster.checksum_sha256]));
  const correctionPromptPath = "evidence/poster-only-correction.txt";
  await writeRepoFile(root, correctionPromptPath, "Recompose the poster-safe subject clusters without changing the passed lesson card.\n");
  const correctedSource = await writeRepoFile(
    root,
    "provider/poster-only-corrected.png",
    await pixelPng(1280, 720, (column, row) => {
      if (row >= 230 && row < 370 && ((column >= 180 && column < 300) || (column >= 580 && column < 720) || (column >= 980 && column < 1120))) return [255, 123, 0];
      return background;
    }),
  );
  await ingestGeneration({
    root,
    ledger,
    masterId,
    sourceFile: correctedSource,
    generationCallId: "call-poster-only-corrected",
    toolOutputId: "output-poster-only-corrected",
    generatedAt: "2026-07-16T22:05:00.000Z",
    generatedBy: "test",
    correctionPromptPath,
    parentSha256: master.terminal_source_sha256,
    preserveOutputKeys: [card.asset_key],
  });
  assert.equal(master.lineage.at(-1).preserved_output_keys.join(","), card.asset_key);
  await assert.rejects(
    ingestGeneration({
      root,
      ledger,
      masterId,
      sourceFile: correctedSource,
      generationCallId: "call-poster-only-corrected",
      toolOutputId: "output-poster-only-corrected",
      generatedAt: "2026-07-16T22:05:00.000Z",
      generatedBy: "test",
      correctionPromptPath,
      parentSha256: master.lineage.at(-1).parent_source_sha256,
      preserveOutputKeys: [],
    }),
    /replay preserved output keys differ/,
  );
  await deriveMaster({ root, ledger, masterId });

  const currentCardContents = await readFile(resolveRepoPath(root, card.output_path));
  assert.equal(sha256(currentCardContents), sha256(priorCardContents));
  assert.equal(card.checksum_sha256, priorCardChecksum);
  assert.equal(currentCardContents.equals(priorCardContents), true, "preserved card bytes must remain exact");
  assert.equal(card.provenance.preserved_from_flat_master_sha256, priorFlatChecksum);
  assert.notEqual(master.flat_master_sha256, priorFlatChecksum);
  for (const poster of posters) {
    assert.notEqual(poster.checksum_sha256, priorPosterChecksums.get(poster.asset_key));
    assert.equal(poster.history.at(-1).checksum_sha256, priorPosterChecksums.get(poster.asset_key));
  }
});

test("V8 texture exceptions are exact-checksum scoped and cannot transfer to replacement bytes", async () => {
  const tracked = await readJson(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.ledger));
  const evidence = "docs/course-production/thumbnail-pilots/approvals/v8-approved-texture-exceptions-2026-07-17.json";
  await recordApprovedTextureExceptions({ root: REPO_ROOT, ledger: tracked, evidence });
  assert.equal(tracked.approved_texture_exceptions.length, 4);
  assert.equal(tracked.approved_texture_exceptions.every((entry) => entry.approval_inheritance === "forbidden"), true);
  await validateLedger({ root: REPO_ROOT, inventory, manifest, ledger: tracked, inspectFiles: true });
  const replacement = structuredClone(tracked);
  replacement.approved_texture_exceptions[0].checksum_sha256 = "f".repeat(64);
  await assert.rejects(
    validateLedger({ root: REPO_ROOT, inventory, manifest, ledger: replacement, inspectFiles: false }),
    /no longer matches current bytes/,
  );
});

test("finalization requires complete evidence and timing, then reconciles from finalized ledger", async (t) => {
  const root = await tempRoot(t);
  const ledger = createInitialLedger(inventory);
  ledger.status = "production";
  ledger.pilot_approval = {
    status: "approved",
    approved_by: "Jarrad Henry",
    approved_at: "2026-07-16T22:00:00.000Z",
    evidence: "evidence/pilot.json",
    evidence_sha256: "1".repeat(64),
  };
  for (const [index, master] of ledger.masters.entries()) {
    master.status = "derived";
    master.terminal_source_sha256 = (index + 1).toString(16).padStart(64, "0");
    master.flat_master_sha256 = (index + 101).toString(16).padStart(64, "0");
    master.lineage = [{ completed_at: "2026-07-16T22:10:00.000Z" }];
    master.review = {
      status: "approved",
      reviewed_by: "reviewer",
      reviewed_at: "2026-07-16T22:20:00.000Z",
      evidence: `evidence/review-${index}.txt`,
      evidence_sha256: (index + 201).toString(16).padStart(64, "0"),
    };
  }
  for (const [index, asset] of ledger.assets.entries()) {
    const [width, height] = asset.dimensions;
    const background = asset.derivative.recipe.padding_rgb ?? asset.derivative.recipe.normalize_background_rgb;
    const markerTop = asset.kind === "video-poster" ? 60 + ((index * 11) % 580) : 80 + ((index * 11) % 620);
    const markerLeft = 40 + ((index * 23) % 1160);
    const contents = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: background[0], g: background[1], b: background[2] },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 12,
              height: 12,
              channels: 3,
              background: { r: 255, g: 174, b: 1 },
            },
          },
          left: markerLeft,
          top: markerTop,
        },
      ])
      .webp({ lossless: true })
      .toBuffer();
    await writeRepoFile(root, asset.manifest_path, contents);
    const record = await inspectArtworkFile(root, asset, ledger.palette_rgb);
    asset.checksum_sha256 = record.checksum_sha256;
    asset.pixel_sha256 = record.pixel_sha256;
    asset.size_bytes = record.size_bytes;
  }
  const evidencePath = "evidence/final.txt";
  await writeRepoFile(root, evidencePath, Buffer.from(ledger.assets.flatMap((asset) => [asset.asset_key, asset.checksum_sha256, asset.pixel_sha256]).join("\n")));
  const badEvidencePath = "evidence/final-bad.txt";
  await writeRepoFile(root, badEvidencePath, Buffer.from("not bound"));
  const untrustedLedger = structuredClone(ledger);
  const untrustedManifest = structuredClone(manifest);
  const untrustedLedgerBefore = structuredClone(untrustedLedger);
  const untrustedManifestBefore = structuredClone(untrustedManifest);
  await assert.rejects(
    finalizeArtwork({
      root,
      ledger: untrustedLedger,
      manifest: untrustedManifest,
      approvedBy: "Generic Reviewer",
      approvedAt: "2026-07-16T22:30:00.000Z",
      evidence: evidencePath,
    }),
    /Final approval requires approver Jarrad Henry/,
  );
  assert.deepEqual(untrustedLedger, untrustedLedgerBefore, "rejected final approval must not mutate the ledger");
  assert.deepEqual(untrustedManifest, untrustedManifestBefore, "rejected final approval must not mutate the manifest");
  await assert.rejects(
    finalizeArtwork({
      root,
      ledger: structuredClone(ledger),
      manifest,
      approvedBy: "Jarrad Henry",
      approvedAt: "2026-07-16T22:30:00.000Z",
      evidence: badEvidencePath,
    }),
    /does not bind/,
  );
  await assert.rejects(
    finalizeArtwork({
      root,
      ledger: structuredClone(ledger),
      manifest,
      approvedBy: "Jarrad Henry",
      approvedAt: "2026-07-16T22:19:59.000Z",
      evidence: evidencePath,
    }),
    /predates an artwork review/,
  );
  assert.throws(() => reconcileManifestFromLedger(createInitialLedger(inventory), manifest), /requires a finalized ledger/);
  const result = await finalizeArtwork({
    root,
    ledger,
    manifest,
    approvedBy: "Jarrad Henry",
    approvedAt: "2026-07-16T22:30:00.000Z",
    evidence: evidencePath,
  });
  assert.equal(result.ledger.status, "finalized");
  assert.equal(result.ledger.final_approval.status, "approved");
  assert.equal(
    result.manifest.assets.filter((asset) => ledger.assets.some((entry) => entry.asset_key === asset.source_key)).every((asset) => asset.approval_status === "approved"),
    true,
  );
  assert.deepEqual(reconcileManifestFromLedger(result.ledger, result.manifest), result.manifest);
  const finalApproverTamper = structuredClone(result.ledger);
  finalApproverTamper.final_approval.approved_by = "Generic Reviewer";
  await assert.rejects(
    validateLedger({
      root,
      inventory,
      manifest: result.manifest,
      ledger: finalApproverTamper,
      inspectFiles: false,
    }),
    /Final approval requires approver Jarrad Henry/,
  );
  const sourceReadyTamper = structuredClone(result.ledger);
  sourceReadyTamper.masters[0].status = "source-ready";
  await assert.rejects(
    validateLedger({
      root,
      inventory,
      manifest: result.manifest,
      ledger: sourceReadyTamper,
      inspectFiles: false,
    }),
    /Finalized ledger requires every artwork master to be derived/,
  );
  const reviewTamper = structuredClone(result.ledger);
  reviewTamper.masters[0].review.status = "changes_requested";
  await assert.rejects(
    validateLedger({
      root,
      inventory,
      manifest: result.manifest,
      ledger: reviewTamper,
      inspectFiles: false,
    }),
    /Finalized ledger requires every artwork master review to be approved/,
  );
});
