import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, open, readFile, realpath, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import lockfile from "proper-lockfile";

export const SCHEMA_VERSION = "bmh-artwork-production-ledger/v1";
export const EXPECTED_COUNTS = Object.freeze({
  covers: 1,
  cards: 19,
  posters: 29,
});
export const DEFAULT_PATHS = Object.freeze({
  inventory: "docs/course-production/thumbnail-pilots/production-inventory.json",
  ledger: "docs/course-production/thumbnail-pilots/production-ledger.json",
  manifest: "content/course-manifests/bmh-employee-training.v1.json",
});

const APPROVED = "approved";
const MISSING = "missing";
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const BLUE = [103, 182, 255];
const YELLOW = [255, 211, 1];
const LOCKED_BACKGROUND_RGB = new Set([BLUE.join(","), YELLOW.join(",")]);

function clone(value) {
  return structuredClone(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is required`);
}

function assertIso(value, label) {
  assertString(value, label);
  assert(ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)), `${label} must be an ISO UTC timestamp`);
}

function assertRecipeRgb(value, palette, label) {
  assert(
    Array.isArray(value) && value.length === 3 && value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255),
    `${label} must be an RGB triplet`,
  );
  const key = value.join(",");
  assert(LOCKED_BACKGROUND_RGB.has(key), `${label} must be locked blue or yellow`);
  assert(
    Array.isArray(palette) && palette.some((color) => Array.isArray(color) && color.join(",") === key),
    `${label} must belong to the locked artwork palette`,
  );
  return clone(value);
}

export function resolveRepoPath(root, relativePath) {
  assertString(relativePath, "repository path");
  assert(!path.isAbsolute(relativePath), `Path must be repository-relative: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  assert(resolved === root || resolved.startsWith(`${root}${path.sep}`), `Path escapes repository: ${relativePath}`);
  return resolved;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function syncDirectory(directoryPath) {
  const directory = await open(directoryPath, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function prepareSafeWriteParent(root, filePath) {
  if (!root) {
    await mkdir(path.dirname(filePath), { recursive: true });
    return;
  }
  const absoluteRoot = path.resolve(root);
  const rootRealPath = await realpath(absoluteRoot);
  const absoluteTarget = path.resolve(filePath);
  assert(absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`), `Write path escapes repository: ${filePath}`);
  const relativeParent = path.relative(absoluteRoot, path.dirname(absoluteTarget));
  let current = absoluteRoot;
  const traversed = [];
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    traversed.push(segment);
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      assert(info.isDirectory() && !info.isSymbolicLink(), `Write ancestor must be a real directory: ${current}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current);
      await syncDirectory(path.dirname(current));
    }
    assert((await realpath(current)) === path.join(rootRealPath, ...traversed), `Write ancestor contains a symlink: ${current}`);
  }
}

export async function withWorkflowLock(root, callback, options = {}) {
  const ledgerPath = resolveRepoPath(root, DEFAULT_PATHS.ledger);
  await prepareSafeWriteParent(root, ledgerPath);
  const release = await lockfile.lock(ledgerPath, {
    realpath: false,
    stale: options.stale ?? 120_000,
    update: options.update ?? 20_000,
    retries: options.retries ?? {
      retries: 100,
      minTimeout: 20,
      maxTimeout: 250,
    },
  });
  try {
    return await callback();
  } finally {
    await release();
  }
}

export async function writeJsonAtomic(filePath, value, { root = null } = {}) {
  await prepareSafeWriteParent(root, filePath);
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
  await syncDirectory(path.dirname(filePath));
}

async function writeBufferAtomic(filePath, buffer, root) {
  await prepareSafeWriteParent(root, filePath);
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(buffer);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
  await syncDirectory(path.dirname(filePath));
}

async function copyFileAtomic(source, destination, root) {
  await prepareSafeWriteParent(root, destination);
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  await copyFile(source, temporary);
  const handle = await open(temporary, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, destination);
  await syncDirectory(path.dirname(destination));
}

function baseApproval() {
  return {
    status: "pending",
    approved_by: null,
    approved_at: null,
    evidence: null,
    evidence_sha256: null,
  };
}

function baseReview() {
  return {
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    evidence: null,
    evidence_sha256: null,
  };
}

function baseStoragePath(asset, kind) {
  if (kind === "course-cover") {
    assert(asset.asset_key.startsWith("thumbnail-"), `${asset.asset_key} course-cover key is invalid`);
    return `courses/bmh-employee-training/v1/thumbnails/${asset.asset_key.slice("thumbnail-".length)}.webp`;
  }
  if (kind === "lesson-card") {
    const match = asset.asset_key.match(/^thumbnail-slot-(\d{2})$/);
    assert(match, `${asset.asset_key} lesson card key is invalid`);
    return `courses/bmh-employee-training/v1/thumbnails/slot-${match[1]}.webp`;
  }
  assert(asset.asset_key.startsWith("poster-"), `${asset.asset_key} poster key is invalid`);
  return `courses/bmh-employee-training/v1/posters/${asset.asset_key.slice("poster-".length)}.webp`;
}

function baseOutput(asset, masterId, recipe) {
  assert(recipe.source_master_id === masterId, `${asset.asset_key} source_master_id does not resolve to ${masterId}`);
  return {
    asset_key: asset.asset_key,
    source_key: asset.asset_key,
    manifest_path: asset.output_path,
    output_path: asset.output_path,
    checksum_sha256: null,
    pixel_sha256: null,
    size_bytes: null,
    approval_status: MISSING,
    base_storage_path: baseStoragePath(asset, recipe.kind),
    storage_path: null,
    replacement_authorized_checksum: null,
    history: [],
    dimensions: recipe.target_dimensions,
    kind: recipe.kind,
    provenance: {
      master_id: masterId,
      source_master_id: masterId,
      prompt_sha256: null,
      reference_ids: [],
      terminal_source_sha256: null,
      flat_master_sha256: null,
      derivative_recipe_id: recipe.id,
      derivative_recipe_sha256: sha256(JSON.stringify(recipe)),
      lineage_steps: 0,
      reviewed_by: null,
      reviewed_at: null,
      review_evidence: null,
    },
    derivative: {
      source_master_id: masterId,
      recipe: clone(recipe),
      recipe_sha256: sha256(JSON.stringify(recipe)),
    },
  };
}

function cardRecipe(derivative, palette, kind = "lesson-card") {
  assert(derivative?.recipe_id, `${kind} recipe_id is required`);
  assert(derivative?.source_master_id, `${kind} source_master_id is required`);
  return {
    id: derivative.recipe_id,
    kind,
    source_master_id: derivative.source_master_id,
    operation: derivative.method,
    normalize_master_dimensions: clone(derivative.normalize_master_dimensions),
    normalize_method: derivative.normalize_method,
    normalize_background_rgb: assertRecipeRgb(derivative.normalize_background_rgb, palette, `${kind} normalization background`),
    target_dimensions: clone(derivative.target_dimensions),
    padding_rgb: assertRecipeRgb(derivative.padding_color_rgb, palette, `${kind} padding`),
    resample: derivative.resample,
    crop_allowed: derivative.crop_allowed,
    output_format: derivative.output_format,
  };
}

function posterRecipe(poster, palette) {
  const derivative = poster.derivative;
  assert(derivative?.recipe_id, `${poster.asset_key} recipe_id is required`);
  assert(derivative?.source_master_id, `${poster.asset_key} source_master_id is required`);
  assert(derivative.normalize_master_dimensions?.join("x") === "1280x720", `${poster.asset_key} must normalize to 1280x720`);
  assert(
    Array.isArray(derivative.crop_pixels_after_normalize) && derivative.crop_pixels_after_normalize.length === 4,
    `${poster.asset_key} fixed pixel crop is required`,
  );
  return {
    id: derivative.recipe_id,
    kind: "video-poster",
    source_master_id: derivative.source_master_id,
    operation: "normalize-1280x720-then-fixed-safe-crop",
    normalize_master_dimensions: clone(derivative.normalize_master_dimensions),
    normalize_method: derivative.normalize_method,
    normalize_background_rgb: assertRecipeRgb(derivative.normalize_background_rgb, palette, `${poster.asset_key} normalization background`),
    crop_profile: derivative.crop_profile,
    crop_pixels_after_normalize: clone(derivative.crop_pixels_after_normalize),
    target_dimensions: clone(derivative.target_dimensions),
    resample: derivative.resample,
    output_format: derivative.output_format,
    duplicate_pixel_sha256_forbidden: true,
    visual_subject_confirmation_required: true,
    focus_subject: poster.focus_subject,
    video_title: poster.video_title,
  };
}

function baseMaster({
  id,
  kind,
  sourceMode,
  plannedCallId,
  promptSha256,
  referenceIds,
  referenceInputs,
  sourcePath,
  flatMasterPath,
  backgroundRgb,
  pilot,
  outputs,
}) {
  return {
    id,
    kind,
    source_mode: sourceMode,
    planned_generation_call_id: plannedCallId,
    prompt_sha256: promptSha256,
    reference_ids: clone(referenceIds),
    reference_inputs: clone(referenceInputs),
    source_path: sourcePath,
    flat_master_path: flatMasterPath,
    ...(backgroundRgb ? { background_rgb: clone(backgroundRgb) } : {}),
    pilot,
    status: "missing",
    terminal_source_sha256: null,
    flat_master_sha256: null,
    flat_replacement_authorized_checksum: null,
    flat_history: [],
    lineage: [],
    review: baseReview(),
    outputs,
  };
}

function isSharedPilotLineage(lineage) {
  return typeof lineage?.shared_parent_id === "string" && lineage.shared_parent_id.length > 0;
}

function assertPilotToolEvidence(evidence, label) {
  assertString(evidence?.invocation_call_id, `${label} invocation_call_id`);
  assertString(evidence?.tool_output_id, `${label} tool_output_id`);
  assertString(evidence?.agent_path, `${label} agent_path`);
  assertIso(evidence?.completed_at, `${label} completed_at`);
}

function assertPilotOutput(output, label) {
  assertString(output?.path, `${label} output path`);
  assert(SHA256.test(output?.sha256), `${label} output checksum is invalid`);
}

function pilotPlan(pilotReview) {
  const plan = {
    slug: pilotReview.slug,
    assets: clone(pilotReview.assets),
    lineage: clone(pilotReview.generation_lineage),
  };
  if (!isSharedPilotLineage(plan.lineage)) return plan;

  assert(pilotReview.lineage_schema_version === "bmh-thumbnail-pilot-lineage/v2", `${plan.slug} shared-parent lineage schema is invalid`);
  const sharedParent = pilotReview.shared_generation_parent;
  assert(sharedParent?.id === plan.lineage.shared_parent_id, `${plan.slug} shared parent does not resolve`);
  assert(sharedParent.operation === "generate", `${plan.slug} shared parent must be a generation`);
  assertString(sharedParent.prompt_path, `${plan.slug} shared parent prompt path`);
  assert(SHA256.test(sharedParent.prompt_sha256), `${plan.slug} shared parent prompt checksum is invalid`);
  assert(Array.isArray(sharedParent.inputs) && sharedParent.inputs.length > 0, `${plan.slug} shared parent inputs are missing`);
  assert(
    sharedParent.inputs.every((input) => input?.id && input?.role && input?.path && SHA256.test(input.sha256)),
    `${plan.slug} shared parent input provenance is incomplete`,
  );
  assertPilotToolEvidence(sharedParent.tool_evidence, `${plan.slug} shared parent`);
  assertPilotOutput(sharedParent.output, `${plan.slug} shared parent`);
  assert(Array.isArray(plan.lineage.steps) && plan.lineage.steps.length > 0, `${plan.slug} pilot lineage is empty`);
  let parentOutput = sharedParent.output;
  let parentCompletedAt = Date.parse(sharedParent.tool_evidence.completed_at);
  for (const [index, step] of plan.lineage.steps.entries()) {
    assert(step.operation === "edit", `${plan.slug} shared-parent lineage step ${index + 1} must be an edit`);
    assert(step.parent_source_sha256 === parentOutput.sha256, `${plan.slug} shared-parent lineage is disconnected`);
    assert(
      Array.isArray(step.inputs) &&
        (index > 0 || step.inputs[0]?.id === sharedParent.id) &&
        step.inputs[0]?.path === parentOutput.path &&
        step.inputs[0]?.sha256 === parentOutput.sha256,
      `${plan.slug} edit input does not bind its parent`,
    );
    assertPilotToolEvidence(step.tool_evidence, `${plan.slug} pilot step ${index + 1}`);
    assertPilotOutput(step.output, `${plan.slug} pilot step ${index + 1}`);
    assert(Date.parse(step.tool_evidence.completed_at) >= parentCompletedAt, `${plan.slug} shared-parent lineage timestamps are out of order`);
    parentOutput = step.output;
    parentCompletedAt = Date.parse(step.tool_evidence.completed_at);
  }
  assert(plan.lineage.terminal_output_sha256 === parentOutput.sha256, `${plan.slug} pilot terminal checksum drifted`);
  assert(plan.assets?.source?.sha256 === parentOutput.sha256, `${plan.slug} pilot source does not match lineage terminal`);
  plan.lineage_schema_version = pilotReview.lineage_schema_version;
  plan.shared_generation_parent = clone(sharedParent);
  return plan;
}

function canonicalSharedPilotParents(masters) {
  const parents = new Map();
  for (const master of masters) {
    if (!master.pilot || !isSharedPilotLineage(master.pilot.lineage)) continue;
    const parent = master.pilot.shared_generation_parent;
    assert(parent?.id === master.pilot.lineage.shared_parent_id, `${master.id} shared parent does not resolve`);
    const existing = parents.get(parent.id);
    if (existing) {
      assert(JSON.stringify(existing) === JSON.stringify(parent), `Shared pilot parent ${parent.id} has conflicting definitions`);
    } else {
      parents.set(parent.id, parent);
    }
  }
  return [...parents.values()];
}

function assertPilotV2GlobalUniqueness(masters) {
  const v2Pilots = masters.filter((master) => master.pilot && isSharedPilotLineage(master.pilot.lineage));
  if (v2Pilots.length === 0) return;
  const parents = canonicalSharedPilotParents(masters);
  assert(parents.length === 1, "Pilot lineage v2 must have exactly one canonical shared parent");
  const steps = [...parents, ...v2Pilots.flatMap((master) => master.pilot.lineage.steps)];
  const invocationIds = steps.map((step) => step.tool_evidence.invocation_call_id);
  const toolOutputIds = steps.map((step) => step.tool_evidence.tool_output_id);
  const outputHashes = steps.map((step) => step.output.sha256);
  assert(new Set(invocationIds).size === invocationIds.length, "Pilot generation invocation ids must be globally unique");
  assert(new Set(toolOutputIds).size === toolOutputIds.length, "Pilot generation tool output ids must be globally unique");
  assert(new Set(outputHashes).size === outputHashes.length, "Pilot generation output checksums must be globally unique");
}

export function createInitialLedger(inventory) {
  assert(inventory.schema_version === "bmh-artwork-production/v1" || inventory.schema_version === "bmh-artwork-production/v2", "Unsupported artwork inventory");
  const inventoryV2 = inventory.schema_version === "bmh-artwork-production/v2";
  const palette = inventory.style_system?.palette_rgb;
  const referencesById = new Map(inventory.style_system.reference_inputs.map((reference) => [reference.id, reference]));
  const resolveReferences = (ids) =>
    ids.map((id) => {
      const reference = referencesById.get(id);
      assert(reference, `Unknown artwork reference ${id}`);
      assert(SHA256.test(reference.sha256), `Artwork reference ${id} lacks a SHA-256`);
      return clone(reference);
    });
  const masters = [];
  const outputs = [];

  const coverMasterId = inventory.course_cover.id ?? "master-program-bmh-employee-training";
  const coverBackground = inventoryV2 ? assertRecipeRgb(inventory.course_cover.background_rgb, palette, "course-cover master background") : null;
  const coverRecipe = cardRecipe(inventory.course_cover.derivative, palette, "course-cover");
  const coverOutput = baseOutput(inventory.course_cover, coverMasterId, coverRecipe);
  outputs.push(coverOutput);
  masters.push(
    baseMaster({
      id: coverMasterId,
      kind: "course-cover-master",
      sourceMode: "generate-after-pilot-approval",
      plannedCallId: inventory.course_cover.provenance.planned_generation_call_id,
      promptSha256: inventory.course_cover.prompt_sha256,
      referenceIds: inventory.course_cover.reference_ids,
      referenceInputs: resolveReferences(inventory.course_cover.reference_ids),
      sourcePath: inventory.course_cover.source_path,
      flatMasterPath: inventory.course_cover.flat_master_path,
      backgroundRgb: coverBackground,
      pilot: null,
      outputs: [
        {
          asset_key: coverOutput.asset_key,
          manifest_path: coverOutput.manifest_path,
          recipe: coverRecipe,
        },
      ],
    }),
  );

  for (const lesson of inventory.lessons) {
    const masterId = lesson.master.id;
    const lessonRecipe = cardRecipe(lesson.lesson_card.derivative, palette);
    const lessonBackground = inventoryV2 ? assertRecipeRgb(lesson.master.background_rgb, palette, `${lesson.master.id} background`) : null;
    const lessonOutput = baseOutput(lesson.lesson_card, masterId, lessonRecipe);
    outputs.push(lessonOutput);
    const masterOutputs = [
      {
        asset_key: lessonOutput.asset_key,
        manifest_path: lessonOutput.manifest_path,
        recipe: lessonRecipe,
      },
    ];
    for (const poster of lesson.posters.filter((entry) => !entry.direct_master)) {
      const recipe = posterRecipe(poster, palette);
      const output = baseOutput(poster, masterId, recipe);
      outputs.push(output);
      masterOutputs.push({
        asset_key: output.asset_key,
        manifest_path: output.manifest_path,
        recipe,
      });
    }
    masters.push(
      baseMaster({
        id: masterId,
        kind: "lesson-master",
        sourceMode: lesson.production_source_mode,
        plannedCallId: lesson.provenance.planned_generation_call_id,
        promptSha256: lesson.prompt_sha256,
        referenceIds: lesson.reference_ids,
        referenceInputs: resolveReferences(lesson.reference_ids),
        sourcePath: lesson.master.source_path,
        flatMasterPath: lesson.master.flat_master_path,
        backgroundRgb: lessonBackground,
        pilot: lesson.pilot ? pilotPlan(lesson.pilot_review) : null,
        outputs: masterOutputs,
      }),
    );

    for (const poster of lesson.posters.filter((entry) => entry.direct_master)) {
      const direct = poster.direct_master;
      const directId = direct.id;
      const directBackground = inventoryV2 ? assertRecipeRgb(direct.background_rgb, palette, `${directId} background`) : null;
      const recipe = posterRecipe(poster, palette);
      const output = baseOutput(poster, directId, recipe);
      outputs.push(output);
      masters.push(
        baseMaster({
          id: directId,
          kind: "direct-poster-master",
          sourceMode: poster.production_source_mode,
          plannedCallId: direct.provenance.planned_generation_call_id,
          promptSha256: direct.prompt_sha256,
          referenceIds: direct.reference_ids,
          referenceInputs: resolveReferences(direct.reference_ids),
          sourcePath: direct.source_path,
          flatMasterPath: direct.flat_master_path,
          backgroundRgb: directBackground,
          pilot: null,
          outputs: [
            {
              asset_key: output.asset_key,
              manifest_path: output.manifest_path,
              recipe,
            },
          ],
        }),
      );
    }
  }

  const counts = {
    covers: outputs.filter((asset) => asset.kind === "course-cover").length,
    cards: outputs.filter((asset) => asset.kind === "lesson-card").length,
    posters: outputs.filter((asset) => asset.kind === "video-poster").length,
    masters: masters.length,
    planned_generation_calls: masters.filter((master) => master.planned_generation_call_id).length,
    promoted_pilots: masters.filter((master) => master.pilot).length,
  };
  assert(counts.covers === EXPECTED_COUNTS.covers, "Expected exactly one course cover");
  assert(counts.cards === EXPECTED_COUNTS.cards, "Expected exactly 19 lesson cards");
  assert(counts.posters === EXPECTED_COUNTS.posters, "Expected exactly 29 video posters");
  assert(counts.planned_generation_calls === 18, "Expected exactly 18 new generation calls");
  assert(counts.promoted_pilots === 3, "Expected exactly three promoted pilots");
  assert(new Set(outputs.map((asset) => asset.asset_key)).size === 49, "Artwork keys must be unique");
  assert(new Set(outputs.map((asset) => asset.manifest_path)).size === 49, "Artwork paths must be unique");
  const recipeIds = outputs.map((asset) => asset.derivative.recipe.id);
  assert(new Set(recipeIds).size === 49, "Artwork recipe IDs must be globally unique");
  const masterIds = masters.map((master) => master.id);
  assert(masters.length === 21 && new Set(masterIds).size === 21, "Expected exactly 21 unique source masters");
  const masterPaths = masters.flatMap((master) => [master.source_path, master.flat_master_path]);
  assert(new Set(masterPaths).size === masterPaths.length, "Source and flat-master paths must be globally unique");
  const plannedCallIds = masters.map((master) => master.planned_generation_call_id).filter(Boolean);
  assert(new Set(plannedCallIds).size === 18, "Planned generation call IDs must be unique");
  assert(
    masters.filter((master) => master.pilot).every((master) => isSharedPilotLineage(master.pilot.lineage) === inventoryV2),
    `Artwork inventory ${inventory.schema_version} has an incompatible pilot lineage schema`,
  );
  assertPilotV2GlobalUniqueness(masters);

  return {
    schema_version: SCHEMA_VERSION,
    status: "preapproval",
    inventory_path: DEFAULT_PATHS.inventory,
    manifest_path: DEFAULT_PATHS.manifest,
    palette_rgb: clone(inventory.style_system.palette_rgb),
    references: clone(inventory.style_system.reference_inputs),
    derivative_runtime: {
      engine: "sharp",
      sharp_version: sharp.versions.sharp,
      libvips_version: sharp.versions.vips,
    },
    counts,
    pilot_approval: baseApproval(),
    final_approval: baseApproval(),
    masters,
    assets: outputs,
    updated_at: null,
  };
}

function findMaster(ledger, masterId) {
  const master = ledger.masters.find((candidate) => candidate.id === masterId);
  assert(master, `Unknown artwork master: ${masterId}`);
  return master;
}

function findOutput(ledger, assetKey) {
  const output = ledger.assets.find((candidate) => candidate.asset_key === assetKey);
  assert(output, `Unknown artwork output: ${assetKey}`);
  return output;
}

async function fileRecord(root, relativePath) {
  const fullPath = resolveRepoPath(root, relativePath);
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(fullPath)]);
  assert(realFile === realRoot || realFile.startsWith(`${realRoot}${path.sep}`), `File resolves outside repository: ${relativePath}`);
  assert(realFile === fullPath, `File path contains a symlink: ${relativePath}`);
  const info = await lstat(fullPath);
  assert(info.isFile() && !info.isSymbolicLink(), `File must be a regular non-symlink: ${relativePath}`);
  const contents = await readFile(fullPath);
  return { contents, size_bytes: info.size, checksum_sha256: sha256(contents) };
}

async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertAbsentOrExact(root, relativePath, expectedBuffer, label) {
  const fullPath = resolveRepoPath(root, relativePath);
  if (!(await pathExists(fullPath))) return false;
  const actual = await fileRecord(root, relativePath);
  assert(actual.checksum_sha256 === sha256(expectedBuffer), `${label} exists but is not the expected restart artifact`);
  return true;
}

async function validateEvidence(root, relativePath, requiredValues) {
  const record = await fileRecord(root, relativePath);
  const contents = record.contents.toString("utf8");
  for (const value of requiredValues) {
    assertString(value, `Evidence binding for ${relativePath}`);
    assert(contents.includes(value), `Evidence ${relativePath} does not bind ${value}`);
  }
  return { path: relativePath, sha256: record.checksum_sha256 };
}

function paletteKey(color) {
  return color.join(",");
}

function nearestPaletteColor(red, green, blue, palette) {
  let best = palette[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const candidate = (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2;
    if (candidate < distance) {
      best = color;
      distance = candidate;
    }
  }
  return best;
}

async function quantizeBuffer(input, palette, flattenBackground = BLUE) {
  const { data, info } = await sharp(input)
    .flatten({
      background: {
        r: flattenBackground[0],
        g: flattenBackground[1],
        b: flattenBackground[2],
      },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += 3) {
    const color = nearestPaletteColor(data[index], data[index + 1], data[index + 2], palette);
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
  }
  return { data, width: info.width, height: info.height };
}

async function encodeFlatPng(input, palette, background = BLUE) {
  const flat = await quantizeBuffer(input, palette, background);
  return sharp(flat.data, {
    raw: { width: flat.width, height: flat.height, channels: 3 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function encodeDerivedWebp(flatMasterInput, recipe, palette) {
  const metadata = await sharp(flatMasterInput).metadata();
  assert(metadata.width && metadata.height, "Cannot read flat-master dimensions");
  assert(recipe.normalize_master_dimensions?.join("x") === "1280x720", `${recipe.id} normalization dimensions drifted`);
  assert(recipe.normalize_method === "contain-with-padding", `${recipe.id} normalization method drifted`);
  const normalizeBackground = assertRecipeRgb(recipe.normalize_background_rgb, palette, `${recipe.id} normalization background`);
  let pipeline = sharp(flatMasterInput).removeAlpha();
  if (recipe.kind === "course-cover" || recipe.kind === "lesson-card") {
    const padding = assertRecipeRgb(recipe.padding_rgb, palette, `${recipe.id} padding`);
    const resized = await pipeline
      .resize(1280, 720, {
        fit: "contain",
        position: "centre",
        background: {
          r: normalizeBackground[0],
          g: normalizeBackground[1],
          b: normalizeBackground[2],
        },
        kernel: sharp.kernel.lanczos3,
      })
      .raw()
      .toBuffer();
    const canvas = Buffer.alloc(1280 * 800 * 3);
    for (let index = 0; index < canvas.length; index += 3) {
      canvas[index] = padding[0];
      canvas[index + 1] = padding[1];
      canvas[index + 2] = padding[2];
    }
    for (let row = 0; row < 720; row += 1) {
      resized.copy(canvas, (row + 40) * 1280 * 3, row * 1280 * 3, (row + 1) * 1280 * 3);
    }
    pipeline = sharp(canvas, {
      raw: { width: 1280, height: 800, channels: 3 },
    });
  } else {
    const [left, top, width, height] = recipe.crop_pixels_after_normalize;
    const normalized = await pipeline
      .resize(1280, 720, {
        fit: "contain",
        position: "centre",
        background: {
          r: normalizeBackground[0],
          g: normalizeBackground[1],
          b: normalizeBackground[2],
        },
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();
    pipeline = sharp(normalized).extract({ left, top, width, height }).resize(1280, 720, { fit: "fill", kernel: sharp.kernel.lanczos3 });
  }
  const intermediate = await pipeline.png().toBuffer();
  const quantized = await quantizeBuffer(intermediate, palette, normalizeBackground);
  return sharp(quantized.data, {
    raw: { width: quantized.width, height: quantized.height, channels: 3 },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

async function inspectArtworkBuffer(asset, palette, contents) {
  const metadata = await sharp(contents).metadata();
  assert(
    metadata.width === asset.dimensions[0] && metadata.height === asset.dimensions[1],
    `${asset.asset_key} dimensions are ${metadata.width}x${metadata.height}; expected ${asset.dimensions.join("x")}`,
  );
  assert(metadata.format === "webp", `${asset.asset_key} must be WebP`);
  assert(!metadata.hasAlpha, `${asset.asset_key} must not contain alpha`);
  assert((metadata.pages ?? 1) === 1, `${asset.asset_key} must not be animated`);
  const riff = contents.toString("ascii");
  assert(riff.includes("VP8L") && !riff.includes("ANIM"), `${asset.asset_key} must be lossless, non-animated WebP`);
  const { data, info } = await sharp(contents).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const allowed = new Set(palette.map(paletteKey));
  for (let index = 0; index < data.length; index += 3) {
    const key = `${data[index]},${data[index + 1]},${data[index + 2]}`;
    assert(allowed.has(key), `${asset.asset_key} contains color outside the locked palette: ${key}`);
  }
  if (asset.kind === "lesson-card" || asset.kind === "course-cover") {
    const padding = assertRecipeRgb(asset.derivative?.recipe?.padding_rgb, palette, `${asset.asset_key} padding`);
    for (const row of [...Array(40).keys(), ...Array.from({ length: 40 }, (_, index) => 760 + index)]) {
      for (let column = 0; column < 1280; column += 1) {
        const offset = (row * info.width + column) * 3;
        assert(
          data[offset] === padding[0] && data[offset + 1] === padding[1] && data[offset + 2] === padding[2],
          `${asset.asset_key} does not preserve exact recipe padding`,
        );
      }
    }
  }
  return { pixel_sha256: sha256(data) };
}

export async function inspectArtworkFile(root, asset, palette) {
  const fullPath = resolveRepoPath(root, asset.manifest_path);
  const fileInfo = await lstat(fullPath);
  assert(fileInfo.isFile() && !fileInfo.isSymbolicLink(), `${asset.asset_key} must be a regular non-symlink file`);
  const record = await fileRecord(root, asset.manifest_path);
  return {
    ...record,
    ...(await inspectArtworkBuffer(asset, palette, record.contents)),
  };
}

function applyOutputProvenance(output, master) {
  output.provenance = {
    ...output.provenance,
    prompt_sha256: master.prompt_sha256,
    reference_ids: clone(master.reference_ids),
    reference_inputs: clone(master.reference_inputs),
    terminal_source_sha256: master.terminal_source_sha256,
    flat_master_sha256: master.flat_master_sha256,
    lineage_steps: master.lineage.length,
    reviewed_by: master.review.reviewed_by,
    reviewed_at: master.review.reviewed_at,
    review_evidence: master.review.evidence,
    review_evidence_sha256: master.review.evidence_sha256 ?? null,
  };
}

function lockedPilotBindings(ledger) {
  const bySlug = new Map(ledger.masters.filter((master) => master.pilot).map((master) => [master.pilot.slug, master]));
  return ["orientation", "opening-the-call", "objection-architecture"].map((slug) => {
    const master = bySlug.get(slug);
    assert(master, `Missing locked pilot ${slug}`);
    return {
      slug,
      terminal_output_sha256: master.pilot.lineage.terminal_output_sha256,
      flat_master_sha256: master.pilot.assets.flat_master.sha256,
      lesson_card_sha256: master.pilot.assets.lesson_card.sha256,
      video_poster_sha256: master.pilot.assets.video_poster.sha256,
    };
  });
}

function pilotBindingsSha256(bindings) {
  return sha256(
    bindings
      .map(
        (binding) =>
          `${binding.slug}|${binding.terminal_output_sha256}|${binding.flat_master_sha256}|${binding.lesson_card_sha256}|${binding.video_poster_sha256}\n`,
      )
      .join(""),
  );
}

async function validatePilotApprovalArtifact({ root, ledger, evidence, approvedBy, approvedAt }) {
  assert(approvedBy === "Jarrad Henry", "Pilot approval requires approver Jarrad Henry");
  const evidenceRecord = await fileRecord(root, evidence);
  let artifact;
  try {
    artifact = JSON.parse(evidenceRecord.contents.toString("utf8"));
  } catch (error) {
    throw new Error("Pilot approval evidence must be structured JSON", {
      cause: error,
    });
  }
  assert(artifact?.schema_version === "bmh-artwork-pilot-approval/v1", "Pilot approval schema is invalid");
  assert(artifact.decision === APPROVED, "Pilot approval decision must be approved");
  assert(artifact.approver === "Jarrad Henry" && artifact.approver === approvedBy, "Pilot approval approver is invalid");
  assert(artifact.approved_at === approvedAt, "Pilot approval timestamp does not match the controller request");
  assertIso(artifact.approved_at, "pilot approval artifact approved_at");
  const bindings = lockedPilotBindings(ledger);
  assert(JSON.stringify(artifact.pilot_bindings) === JSON.stringify(bindings), "Pilot approval bindings drifted");
  const bindingsSha256 = pilotBindingsSha256(bindings);
  assert(artifact.request_binding?.pilot_bindings_sha256 === bindingsSha256, "Pilot approval bindings checksum drifted");
  assertString(artifact.request_binding?.request_id, "pilot approval request_id");
  assert(/^[A-Za-z0-9._:-]+$/.test(artifact.request_binding.request_id), "Pilot approval request_id is invalid");
  assertString(artifact.request_binding?.request_path, "pilot approval request_path");
  assert(SHA256.test(artifact.request_binding?.request_sha256), "Pilot approval request checksum is invalid");
  const requestRecord = await fileRecord(root, artifact.request_binding.request_path);
  assert(requestRecord.checksum_sha256 === artifact.request_binding.request_sha256, "Pilot approval request file drifted");
  const inventoryRecord = await fileRecord(root, ledger.inventory_path);
  assert(artifact.inventory_sha256 === inventoryRecord.checksum_sha256, "Pilot approval inventory checksum drifted");
  const lineageRecord = await fileRecord(root, "docs/course-production/thumbnail-pilots/generation-lineage.json");
  assert(artifact.generation_lineage_sha256 === lineageRecord.checksum_sha256, "Pilot approval lineage checksum drifted");
  return { evidenceRecord, artifact, bindingsSha256 };
}

export async function validateLedger({ root, inventory, manifest, ledger, inspectFiles = true }) {
  assert(ledger.schema_version === SCHEMA_VERSION, "Unsupported production ledger");
  const expected = createInitialLedger(inventory);
  assert(ledger.inventory_path === expected.inventory_path, "Ledger inventory path drifted");
  assert(ledger.manifest_path === expected.manifest_path, "Ledger manifest path drifted");
  assert(JSON.stringify(ledger.palette_rgb) === JSON.stringify(expected.palette_rgb), "Locked artwork palette drifted");
  assert(JSON.stringify(ledger.counts) === JSON.stringify(expected.counts), "Locked artwork counts drifted");
  assert(["preapproval", "pilot-approved", "production", "finalized"].includes(ledger.status), "Ledger lifecycle status is invalid");
  if (ledger.status === "finalized") {
    assert(
      ledger.masters.every((master) => master.status === "derived"),
      "Finalized ledger requires every artwork master to be derived",
    );
    assert(
      ledger.masters.every((master) => master.review.status === APPROVED),
      "Finalized ledger requires every artwork master review to be approved",
    );
  }
  assert(
    ledger.derivative_runtime?.sharp_version === sharp.versions.sharp && ledger.derivative_runtime?.libvips_version === sharp.versions.vips,
    `Derivative runtime changed: expected sharp ${ledger.derivative_runtime?.sharp_version}/libvips ${ledger.derivative_runtime?.libvips_version}, got sharp ${sharp.versions.sharp}/libvips ${sharp.versions.vips}`,
  );
  assert(ledger.masters.length === expected.masters.length, "Ledger master count drifted");
  assert(ledger.assets.length === 49, "Ledger must contain exactly 49 artwork outputs");
  assert(JSON.stringify(ledger.references) === JSON.stringify(expected.references), "Ledger reference order or provenance drifted");
  assert(new Set(ledger.assets.map((asset) => asset.asset_key)).size === 49, "Ledger artwork keys are not unique");
  assert(new Set(ledger.assets.map((asset) => asset.manifest_path)).size === 49, "Ledger artwork paths are not unique");
  const manifestByKey = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));
  assert(manifestByKey.size === manifest.assets.length, "Manifest source keys must be unique");
  const masterById = new Map(ledger.masters.map((master) => [master.id, master]));
  for (const reference of ledger.references) {
    assert(SHA256.test(reference.sha256), `${reference.id} reference checksum is invalid`);
    const actual = await fileRecord(root, reference.path);
    assert(actual.checksum_sha256 === reference.sha256, `${reference.id} reference checksum drifted`);
  }
  const expectedByKey = new Map(expected.assets.map((asset) => [asset.asset_key, asset]));
  for (const asset of ledger.assets) {
    const planned = expectedByKey.get(asset.asset_key);
    const manifestAsset = manifestByKey.get(asset.asset_key);
    assert(planned, `Unexpected ledger asset ${asset.asset_key}`);
    assert(manifestAsset, `Manifest is missing ${asset.asset_key}`);
    assert(asset.source_key === asset.asset_key, `${asset.asset_key} source key mismatch`);
    assert(asset.manifest_path === planned.manifest_path, `${asset.asset_key} ledger path drifted`);
    assert(asset.output_path === asset.manifest_path, `${asset.asset_key} output path drifted`);
    assert(asset.manifest_path === manifestAsset.local_path, `${asset.asset_key} manifest path drifted`);
    assert(asset.dimensions.join("x") === planned.dimensions.join("x"), `${asset.asset_key} dimensions drifted`);
    assert(asset.kind === planned.kind, `${asset.asset_key} kind drifted`);
    assert(asset.base_storage_path === planned.base_storage_path, `${asset.asset_key} base storage path drifted`);
    assert(
      JSON.stringify({
        master_id: asset.provenance.master_id,
        source_master_id: asset.provenance.source_master_id,
        derivative_recipe_id: asset.provenance.derivative_recipe_id,
        derivative_recipe_sha256: asset.provenance.derivative_recipe_sha256,
      }) ===
        JSON.stringify({
          master_id: planned.provenance.master_id,
          source_master_id: planned.provenance.source_master_id,
          derivative_recipe_id: planned.provenance.derivative_recipe_id,
          derivative_recipe_sha256: planned.provenance.derivative_recipe_sha256,
        }),
      `${asset.asset_key} immutable provenance drifted`,
    );
    assert(asset.derivative?.source_master_id === planned.derivative.source_master_id, `${asset.asset_key} source master drifted`);
    assert(JSON.stringify(asset.derivative?.recipe) === JSON.stringify(planned.derivative.recipe), `${asset.asset_key} derivative recipe drifted`);
    if (asset.checksum_sha256 !== null) assert(SHA256.test(asset.checksum_sha256), `${asset.asset_key} checksum invalid`);
    if (asset.pixel_sha256 !== undefined && asset.pixel_sha256 !== null) {
      assert(SHA256.test(asset.pixel_sha256), `${asset.asset_key} pixel checksum invalid`);
    }
    assert(asset.derivative?.recipe_sha256 === sha256(JSON.stringify(asset.derivative?.recipe)), `${asset.asset_key} derivative recipe checksum drifted`);
    assertString(asset.provenance?.master_id, `${asset.asset_key} provenance master_id`);
    assertString(asset.provenance?.source_master_id, `${asset.asset_key} provenance source_master_id`);
    if (asset.checksum_sha256) {
      const owner = masterById.get(asset.provenance.master_id);
      assert(owner, `${asset.asset_key} has no owning master`);
      assert(Number.isInteger(asset.size_bytes) && asset.size_bytes > 0, `${asset.asset_key} produced file size invalid`);
      assert(SHA256.test(asset.pixel_sha256), `${asset.asset_key} produced pixel checksum invalid`);
      assert(SHA256.test(asset.provenance.terminal_source_sha256), `${asset.asset_key} terminal source provenance invalid`);
      assert(SHA256.test(asset.provenance.flat_master_sha256), `${asset.asset_key} flat-master provenance invalid`);
      assert(asset.provenance.prompt_sha256 === owner.prompt_sha256, `${asset.asset_key} prompt provenance drifted`);
      assert(JSON.stringify(asset.provenance.reference_ids) === JSON.stringify(owner.reference_ids), `${asset.asset_key} reference ids drifted`);
      assert(JSON.stringify(asset.provenance.reference_inputs) === JSON.stringify(owner.reference_inputs), `${asset.asset_key} reference inputs drifted`);
      assert(asset.provenance.terminal_source_sha256 === owner.terminal_source_sha256, `${asset.asset_key} terminal source provenance drifted`);
      assert(asset.provenance.flat_master_sha256 === owner.flat_master_sha256, `${asset.asset_key} flat-master provenance drifted`);
      assert(asset.provenance.lineage_steps === owner.lineage.length, `${asset.asset_key} lineage count drifted`);
      assert(asset.provenance.reviewed_by === owner.review.reviewed_by, `${asset.asset_key} reviewer provenance drifted`);
      assert(asset.provenance.reviewed_at === owner.review.reviewed_at, `${asset.asset_key} review timestamp provenance drifted`);
      assert(asset.provenance.review_evidence === owner.review.evidence, `${asset.asset_key} review evidence provenance drifted`);
      assert(asset.provenance.review_evidence_sha256 === owner.review.evidence_sha256, `${asset.asset_key} review evidence checksum provenance drifted`);
    } else {
      assert(asset.pixel_sha256 === null && asset.size_bytes === null, `${asset.asset_key} missing output retains produced metadata`);
    }
    if (asset.approval_status === APPROVED) {
      assert(asset.checksum_sha256 && Number.isInteger(asset.size_bytes) && asset.size_bytes > 0, `${asset.asset_key} approval lacks file metadata`);
    } else {
      assert(asset.approval_status === MISSING, `${asset.asset_key} approval status invalid`);
    }
    assert(Array.isArray(asset.history), `${asset.asset_key} history must be an array`);
    for (const [historyIndex, historical] of asset.history.entries()) {
      assert(historical.version === historyIndex + 1, `${asset.asset_key} history order is invalid`);
      assert(SHA256.test(historical.checksum_sha256), `${asset.asset_key} history checksum invalid`);
      assert(SHA256.test(historical.pixel_sha256), `${asset.asset_key} history pixel checksum invalid`);
      assert(historical.recipe_sha256 === asset.derivative.recipe_sha256, `${asset.asset_key} history recipe drifted`);
      assert(Number.isInteger(historical.lineage_sequence) && historical.lineage_sequence > 0, `${asset.asset_key} history lineage sequence invalid`);
      if (inspectFiles) {
        const archived = await fileRecord(root, historical.archived_path);
        assert(archived.checksum_sha256 === historical.checksum_sha256, `${asset.asset_key} historical derivative drifted`);
      }
    }
    if (asset.replacement_authorized_checksum !== null) {
      const owner = masterById.get(asset.provenance.master_id);
      assert(owner?.status === "source-ready", `${asset.asset_key} replacement authorization requires source-ready master`);
      assert(SHA256.test(asset.replacement_authorized_checksum), `${asset.asset_key} replacement authorization invalid`);
      assert(
        asset.history.at(-1)?.checksum_sha256 === asset.replacement_authorized_checksum,
        `${asset.asset_key} replacement authorization is not tied to history`,
      );
      assert(asset.checksum_sha256 === null, `${asset.asset_key} replacement authorization conflicts with produced metadata`);
    }
    const lifecycleOwner = masterById.get(asset.provenance.master_id);
    if (lifecycleOwner?.status === "missing") {
      assert(asset.checksum_sha256 === null && asset.history.length === 0, `${asset.asset_key} missing master retains output history`);
      assert(asset.replacement_authorized_checksum === null, `${asset.asset_key} missing master retains replacement authorization`);
    }
    if (inspectFiles && asset.checksum_sha256) {
      const actual = await inspectArtworkFile(root, asset, ledger.palette_rgb);
      assert(actual.checksum_sha256 === asset.checksum_sha256, `${asset.asset_key} checksum drifted`);
      assert(actual.size_bytes === asset.size_bytes, `${asset.asset_key} size drifted`);
      assert(actual.pixel_sha256 === asset.pixel_sha256, `${asset.asset_key} pixel checksum drifted`);
    } else if (inspectFiles && (await pathExists(resolveRepoPath(root, asset.manifest_path)))) {
      const existing = await fileRecord(root, asset.manifest_path);
      assert(
        asset.replacement_authorized_checksum && existing.checksum_sha256 === asset.replacement_authorized_checksum,
        `${asset.asset_key} is an orphan production output not recorded by the ledger`,
      );
    }
  }
  const sharedPilotParents = canonicalSharedPilotParents(ledger.masters);
  const invocationIds = sharedPilotParents.map((parent) => parent.tool_evidence.invocation_call_id);
  const toolOutputIds = sharedPilotParents.map((parent) => parent.tool_evidence.tool_output_id);
  const lineageOutputHashes = sharedPilotParents.map((parent) => parent.output.sha256);
  for (const master of ledger.masters) {
    const planned = expected.masters.find((candidate) => candidate.id === master.id);
    assert(planned, `Unexpected ledger master ${master.id}`);
    assert(master.source_path === planned.source_path, `${master.id} source path drifted`);
    assert(master.flat_master_path === planned.flat_master_path, `${master.id} flat-master path drifted`);
    assert(JSON.stringify(master.background_rgb) === JSON.stringify(planned.background_rgb), `${master.id} background drifted`);
    assert(master.prompt_sha256 === planned.prompt_sha256, `${master.id} prompt checksum drifted`);
    assert(JSON.stringify(master.reference_ids) === JSON.stringify(planned.reference_ids), `${master.id} references drifted`);
    assert(JSON.stringify(master.reference_inputs) === JSON.stringify(planned.reference_inputs), `${master.id} reference provenance drifted`);
    assert(master.kind === planned.kind, `${master.id} kind drifted`);
    assert(master.source_mode === planned.source_mode, `${master.id} source mode drifted`);
    assert(master.planned_generation_call_id === planned.planned_generation_call_id, `${master.id} planned call drifted`);
    assert(JSON.stringify(master.pilot) === JSON.stringify(planned.pilot), `${master.id} pilot plan drifted`);
    assert(JSON.stringify(master.outputs) === JSON.stringify(planned.outputs), `${master.id} output/recipe plan drifted`);
    assert(["missing", "source-ready", "derived"].includes(master.status), `${master.id} status is invalid`);
    const sharedPilotParent = master.pilot && isSharedPilotLineage(master.pilot.lineage) ? master.pilot.shared_generation_parent : null;
    let previous = sharedPilotParent?.output.sha256 ?? null;
    let previousCompletedAt = sharedPilotParent ? Date.parse(sharedPilotParent.tool_evidence.completed_at) : null;
    for (const [index, step] of master.lineage.entries()) {
      assert(step.sequence === index + 1, `${master.id} lineage order is invalid`);
      assert(["generate", "correction", "pilot-generate", "pilot-correction"].includes(step.operation), `${master.id} lineage operation invalid`);
      assert(SHA256.test(step.output_sha256), `${master.id} lineage checksum invalid`);
      assertIso(step.completed_at, `${master.id} lineage completed_at`);
      assertString(step.generated_by, `${master.id} lineage generated_by`);
      assertString(step.generation_call_id, `${master.id} lineage generation_call_id`);
      assertString(step.tool_output_id, `${master.id} lineage tool_output_id`);
      assert(Array.isArray(step.reference_inputs) && step.reference_inputs.length > 0, `${master.id} lineage reference provenance missing`);
      for (const input of step.reference_inputs) {
        assertString(input.path, `${master.id} lineage input path`);
        assert(SHA256.test(input.sha256), `${master.id} lineage input checksum invalid`);
        if (inspectFiles) {
          const inputRecord = await fileRecord(root, input.path);
          assert(inputRecord.checksum_sha256 === input.sha256, `${master.id} lineage input checksum drifted`);
        }
      }
      invocationIds.push(step.generation_call_id);
      toolOutputIds.push(step.tool_output_id);
      if (previousCompletedAt) {
        assert(Date.parse(step.completed_at) >= previousCompletedAt, `${master.id} lineage timestamps are out of order`);
      }
      if (index > 0 || sharedPilotParent) {
        assert(step.parent_source_sha256 === previous, `${master.id} correction parent checksum mismatch`);
      } else {
        assert(step.parent_source_sha256 === null, `${master.id} initial generation cannot have a parent`);
      }
      if (index === 0 && sharedPilotParent) {
        assert(step.operation === "pilot-correction", `${master.id} shared-parent pilot must begin with an edit`);
        assert(step.reference_inputs[0]?.sha256 === sharedPilotParent.output.sha256, `${master.id} shared-parent pilot input is disconnected`);
      }
      if (step.operation.includes("correction")) {
        assertString(step.correction_prompt_path, `${master.id} correction prompt path`);
        assert(SHA256.test(step.correction_prompt_sha256), `${master.id} correction prompt checksum invalid`);
        if (inspectFiles) {
          const prompt = await fileRecord(root, step.correction_prompt_path);
          const promptChecksum = step.operation.startsWith("pilot-") ? sha256(prompt.contents.toString("utf8").replace(/\r?\n$/, "")) : prompt.checksum_sha256;
          assert(promptChecksum === step.correction_prompt_sha256, `${master.id} correction prompt checksum drifted`);
        }
      }
      if (inspectFiles) {
        const archived = await fileRecord(root, step.archived_output_path);
        assert(archived.checksum_sha256 === step.output_sha256, `${master.id} archived lineage output drifted`);
      }
      previous = step.output_sha256;
      lineageOutputHashes.push(step.output_sha256);
      previousCompletedAt = Date.parse(step.completed_at);
    }
    if (master.lineage.length > 0) {
      assert(master.terminal_source_sha256 === previous, `${master.id} terminal checksum drifted`);
      if (!master.pilot && ledger.pilot_approval.status === APPROVED) {
        assert(Date.parse(master.lineage[0].completed_at) >= Date.parse(ledger.pilot_approval.approved_at), `${master.id} generation predates pilot approval`);
      }
      if (inspectFiles) {
        const source = await fileRecord(root, master.source_path);
        assert(source.checksum_sha256 === master.terminal_source_sha256, `${master.id} terminal source drifted`);
      }
    } else if (inspectFiles) {
      if (await pathExists(resolveRepoPath(root, master.source_path))) throw new Error(`${master.id} has an orphan source file`);
    }
    if (master.status === "missing") {
      assert(master.lineage.length === 0 && master.terminal_source_sha256 === null, `${master.id} missing state retains lineage`);
      assert(
        master.flat_master_sha256 === null && master.flat_replacement_authorized_checksum === null,
        `${master.id} missing state retains flat-master state`,
      );
      assert(master.flat_history.length === 0, `${master.id} missing state retains flat history`);
      assert(master.review.status === "pending", `${master.id} missing state retains review`);
    } else {
      assert(master.lineage.length > 0 && SHA256.test(master.terminal_source_sha256), `${master.id} active state lacks lineage`);
    }
    if (master.status === "derived") {
      assert(SHA256.test(master.flat_master_sha256), `${master.id} derived state lacks flat master`);
      for (const outputRef of master.outputs) {
        assert(
          SHA256.test(ledger.assets.find((asset) => asset.asset_key === outputRef.asset_key)?.checksum_sha256),
          `${master.id} derived state lacks output ${outputRef.asset_key}`,
        );
      }
      assert(master.flat_replacement_authorized_checksum === null, `${master.id} derived state retains flat replacement authorization`);
    }
    if (master.flat_master_sha256) {
      assert(SHA256.test(master.flat_master_sha256), `${master.id} flat-master checksum invalid`);
      if (inspectFiles) {
        const flat = await fileRecord(root, master.flat_master_path);
        assert(flat.checksum_sha256 === master.flat_master_sha256, `${master.id} flat master drifted`);
      }
    } else if (inspectFiles && (await pathExists(resolveRepoPath(root, master.flat_master_path)))) {
      assert(master.flat_replacement_authorized_checksum, `${master.id} has an orphan flat master`);
      const flat = await fileRecord(root, master.flat_master_path);
      assert(flat.checksum_sha256 === master.flat_replacement_authorized_checksum, `${master.id} flat replacement authorization drifted`);
    }
    assert(Array.isArray(master.flat_history), `${master.id} flat history must be an array`);
    for (const [historyIndex, historical] of master.flat_history.entries()) {
      assert(historical.version === historyIndex + 1, `${master.id} flat history order invalid`);
      assert(SHA256.test(historical.checksum_sha256), `${master.id} flat history checksum invalid`);
      assert(Number.isInteger(historical.lineage_sequence) && historical.lineage_sequence > 0, `${master.id} flat history lineage sequence invalid`);
      if (inspectFiles) {
        const archived = await fileRecord(root, historical.archived_path);
        assert(archived.checksum_sha256 === historical.checksum_sha256, `${master.id} historical flat master drifted`);
      }
    }
    if (master.review.status === APPROVED || master.review.status === "changes_requested") {
      assertIso(master.review.reviewed_at, `${master.id} reviewed_at`);
      assertString(master.review.reviewed_by, `${master.id} reviewed_by`);
      assertString(master.review.evidence, `${master.id} review evidence`);
      assert(SHA256.test(master.review.evidence_sha256), `${master.id} review evidence checksum invalid`);
      if (previousCompletedAt) {
        assert(Date.parse(master.review.reviewed_at) >= previousCompletedAt, `${master.id} review predates generation`);
      }
      if (inspectFiles) {
        const bindings = [master.id, master.terminal_source_sha256, master.flat_master_sha256];
        for (const outputRef of master.outputs) {
          const output = ledger.assets.find((asset) => asset.asset_key === outputRef.asset_key);
          bindings.push(output.asset_key, output.checksum_sha256, output.pixel_sha256);
        }
        const evidence = await validateEvidence(root, master.review.evidence, bindings);
        assert(evidence.sha256 === master.review.evidence_sha256, `${master.id} review evidence drifted`);
      }
    } else {
      assert(master.review.status === "pending", `${master.id} review decision is invalid`);
    }
  }
  assert(new Set(invocationIds).size === invocationIds.length, "Generation invocation ids must be globally unique");
  assert(new Set(toolOutputIds).size === toolOutputIds.length, "Generation tool output ids must be globally unique");
  assert(new Set(lineageOutputHashes).size === lineageOutputHashes.length, "Generation output checksums must be globally unique");
  const sourceHashes = ledger.masters.map((master) => master.terminal_source_sha256).filter(Boolean);
  const flatHashes = ledger.masters.map((master) => master.flat_master_sha256).filter(Boolean);
  assert(new Set(sourceHashes).size === sourceHashes.length, "Terminal source checksums must be globally unique");
  assert(new Set(flatHashes).size === flatHashes.length, "Flat-master checksums must be globally unique");
  const masterIds = ledger.masters.map((master) => master.id);
  assert(new Set(masterIds).size === masterIds.length, "Every source master id must be unique");
  for (const asset of ledger.assets) {
    assert(
      masterIds.filter((id) => id === asset.derivative?.source_master_id).length === 1,
      `${asset.asset_key} derivative source_master_id must resolve exactly once`,
    );
  }
  const posterHashes = ledger.assets.filter((asset) => asset.kind === "video-poster" && asset.checksum_sha256).map((asset) => asset.pixel_sha256);
  assert(new Set(posterHashes).size === posterHashes.length, "Two video posters have identical pixels");
  if (ledger.pilot_approval.status === APPROVED) {
    assertIso(ledger.pilot_approval.approved_at, "pilot approved_at");
    assertString(ledger.pilot_approval.approved_by, "pilot approved_by");
    assert(SHA256.test(ledger.pilot_approval.evidence_sha256), "Pilot evidence checksum invalid");
    const { evidenceRecord, artifact, bindingsSha256 } = await validatePilotApprovalArtifact({
      root,
      ledger,
      evidence: ledger.pilot_approval.evidence,
      approvedBy: ledger.pilot_approval.approved_by,
      approvedAt: ledger.pilot_approval.approved_at,
    });
    assert(evidenceRecord.checksum_sha256 === ledger.pilot_approval.evidence_sha256, "Pilot evidence drifted");
    assert(ledger.pilot_approval.request_id === artifact.request_binding.request_id, "Stored pilot approval request_id drifted");
    assert(ledger.pilot_approval.pilot_bindings_sha256 === bindingsSha256, "Stored pilot approval bindings checksum drifted");
    const latestPilotGeneration = Math.max(
      ...ledger.masters
        .filter((master) => master.pilot)
        .flatMap((master) => master.pilot.lineage.steps.map((step) => Date.parse(step.tool_evidence.completed_at))),
    );
    if (Number.isFinite(latestPilotGeneration)) {
      assert(Date.parse(ledger.pilot_approval.approved_at) >= latestPilotGeneration, "Pilot approval predates pilot production");
    }
  } else {
    assert(ledger.pilot_approval.status === "pending", "Pilot approval status invalid");
  }
  if (ledger.status === "preapproval") {
    assert(ledger.pilot_approval.status === "pending", "Preapproval ledger cannot contain pilot approval");
    assert(
      ledger.masters.every((master) => master.status === "missing"),
      "Preapproval ledger cannot contain active masters",
    );
  } else if (ledger.status === "pilot-approved") {
    assert(ledger.pilot_approval.status === APPROVED, "Pilot-approved ledger lacks approval");
    assert(
      ledger.masters.every((master) => master.status === "missing"),
      "Pilot-approved ledger cannot contain promoted masters",
    );
  } else {
    assert(ledger.pilot_approval.status === APPROVED, `${ledger.status} ledger lacks pilot approval`);
    assert(
      ledger.masters.filter((master) => master.pilot).every((master) => ["source-ready", "derived"].includes(master.status)),
      `${ledger.status} ledger contains unpromoted pilots`,
    );
  }
  if (ledger.status !== "finalized") {
    assert(ledger.final_approval.status === "pending", "Non-finalized ledger contains final approval");
  }
  if (ledger.status === "finalized") {
    assert(
      ledger.masters.every((master) => master.status === "derived"),
      "Finalized ledger requires every artwork master to be derived",
    );
    assert(
      ledger.masters.every((master) => master.review.status === APPROVED),
      "Finalized ledger requires every artwork master review to be approved",
    );
    assert(
      ledger.assets.every((asset) => asset.approval_status === APPROVED),
      "Finalized ledger contains unapproved artwork",
    );
    for (const asset of ledger.assets) {
      const manifestAsset = manifestByKey.get(asset.asset_key);
      const extension = path.posix.extname(asset.base_storage_path);
      const stem = asset.base_storage_path.slice(0, -extension.length);
      assert(asset.storage_path === `${stem}-${asset.checksum_sha256}${extension}`, `${asset.asset_key} canonical storage path drifted`);
      assert(manifestAsset.approval_status === APPROVED, `${asset.asset_key} manifest approval drifted`);
      assert(manifestAsset.checksum_sha256 === asset.checksum_sha256, `${asset.asset_key} manifest checksum drifted`);
      assert(manifestAsset.size_bytes === asset.size_bytes, `${asset.asset_key} manifest size drifted`);
      assert(manifestAsset.storage_path === asset.storage_path, `${asset.asset_key} storage path drifted`);
      assert(manifestAsset.storage_path.includes(asset.checksum_sha256), `${asset.asset_key} storage path is not checksum-addressed`);
    }
    assert(ledger.final_approval.status === APPROVED, "Final approval is missing");
    assertIso(ledger.final_approval.approved_at, "final approved_at");
    assertString(ledger.final_approval.approved_by, "final approved_by");
    assert(SHA256.test(ledger.final_approval.evidence_sha256), "Final evidence checksum invalid");
    assert(new Set(ledger.assets.map((asset) => asset.checksum_sha256)).size === 49, "Final artwork file checksums must be unique");
    assert(
      new Set(ledger.assets.filter((asset) => asset.kind === "video-poster").map((asset) => asset.pixel_sha256)).size === 29,
      "Final poster pixels must be unique",
    );
    if (inspectFiles) {
      const evidence = await validateEvidence(
        root,
        ledger.final_approval.evidence,
        ledger.assets.flatMap((asset) => [asset.asset_key, asset.checksum_sha256, asset.pixel_sha256]),
      );
      assert(evidence.sha256 === ledger.final_approval.evidence_sha256, "Final evidence drifted");
    }
  } else {
    for (const asset of ledger.assets) {
      assert(asset.storage_path === null, `${asset.asset_key} storage path populated before finalization`);
      const manifestAsset = manifestByKey.get(asset.asset_key);
      assert(manifestAsset.storage_path === asset.base_storage_path, `${asset.asset_key} preapproval storage path drifted`);
      assert(manifestAsset.approval_status === MISSING, `${asset.asset_key} manifest changed before finalization`);
      assert(manifestAsset.checksum_sha256 === null && manifestAsset.size_bytes === null, `${asset.asset_key} manifest metadata changed before finalization`);
    }
  }
  return true;
}

export async function approvePilots({ root, ledger, approvedBy, approvedAt, evidence }) {
  assert(ledger.status === "preapproval", "Pilot approval is only valid from preapproval state");
  assertString(approvedBy, "approved_by");
  assertIso(approvedAt, "approved_at");
  assertString(evidence, "evidence");
  const latestPilotCompletion = Math.max(
    ...ledger.masters
      .filter((master) => master.pilot)
      .flatMap((master) => master.pilot.lineage.steps.map((step) => Date.parse(step.tool_evidence.completed_at))),
  );
  assert(Date.parse(approvedAt) >= latestPilotCompletion, "Pilot approval predates pilot generation completion");
  const { evidenceRecord, artifact, bindingsSha256 } = await validatePilotApprovalArtifact({
    root,
    ledger,
    evidence,
    approvedBy,
    approvedAt,
  });
  ledger.pilot_approval = {
    status: APPROVED,
    approved_by: approvedBy,
    approved_at: approvedAt,
    evidence,
    evidence_sha256: evidenceRecord.checksum_sha256,
    request_id: artifact.request_binding.request_id,
    pilot_bindings_sha256: bindingsSha256,
  };
  ledger.status = "pilot-approved";
  ledger.updated_at = approvedAt;
  return ledger;
}

function pilotLineage(master) {
  const sharedParent = isSharedPilotLineage(master.pilot.lineage) ? master.pilot.shared_generation_parent : null;
  return master.pilot.lineage.steps.map((step, index) => ({
    sequence: index + 1,
    operation: step.operation === "generate" ? "pilot-generate" : "pilot-correction",
    prompt_sha256: step.prompt_sha256,
    correction_prompt_path: index === 0 && !sharedParent ? null : step.prompt_path,
    correction_prompt_sha256: index === 0 && !sharedParent ? null : step.prompt_sha256,
    parent_source_sha256: index === 0 ? (sharedParent?.output.sha256 ?? null) : master.pilot.lineage.steps[index - 1].output.sha256,
    generation_call_id: step.tool_evidence.invocation_call_id,
    tool_output_id: step.tool_evidence.tool_output_id,
    generated_by: step.tool_evidence.agent_path,
    completed_at: step.tool_evidence.completed_at,
    archived_output_path: step.output.path,
    output_sha256: step.output.sha256,
    reference_inputs: clone(step.inputs),
  }));
}

export async function promotePilots({ root, ledger }) {
  assert(ledger.pilot_approval.status === APPROVED, "Pilot promotion requires explicit pilot approval");
  if (ledger.status === "production") {
    for (const master of ledger.masters.filter((candidate) => candidate.pilot)) {
      assert(["source-ready", "derived"].includes(master.status), `${master.id} is not in a promoted state`);
      assert(master.terminal_source_sha256 === master.pilot.assets.source.sha256, `${master.id} promoted source provenance drifted`);
      assert(master.flat_master_sha256 === master.pilot.assets.flat_master.sha256, `${master.id} promoted flat provenance drifted`);
      assert(JSON.stringify(master.lineage) === JSON.stringify(pilotLineage(master)), `${master.id} promoted lineage drifted`);
      const source = await fileRecord(root, master.source_path);
      const flat = await fileRecord(root, master.flat_master_path);
      assert(source.checksum_sha256 === master.pilot.assets.source.sha256, `${master.id} promoted source drifted`);
      assert(flat.checksum_sha256 === master.pilot.assets.flat_master.sha256, `${master.id} promoted flat master drifted`);
      const card = findOutput(ledger, master.outputs.find((entry) => entry.recipe.kind === "lesson-card").asset_key);
      const poster = findOutput(ledger, master.outputs.find((entry) => entry.recipe.kind === "video-poster").asset_key);
      for (const [output, pilotAsset] of [
        [card, master.pilot.assets.lesson_card],
        [poster, master.pilot.assets.video_poster],
      ]) {
        const actual = await inspectArtworkFile(root, output, ledger.palette_rgb);
        assert(actual.checksum_sha256 === pilotAsset.sha256, `${output.asset_key} promoted bytes drifted`);
      }
    }
    return ledger;
  }
  assert(ledger.status === "pilot-approved", "Pilot promotion is only valid from pilot-approved or verified production state");
  for (const master of ledger.masters.filter((candidate) => candidate.pilot)) {
    const source = master.pilot.assets.source;
    const flat = master.pilot.assets.flat_master;
    const sourceRecord = await fileRecord(root, source.path);
    const flatRecord = await fileRecord(root, flat.path);
    assert(sourceRecord.checksum_sha256 === source.sha256, `${master.id} pilot source checksum drifted`);
    assert(flatRecord.checksum_sha256 === flat.sha256, `${master.id} pilot flat-master checksum drifted`);
    if (!(await assertAbsentOrExact(root, master.source_path, sourceRecord.contents, `${master.id} promoted source`))) {
      await copyFileAtomic(resolveRepoPath(root, source.path), resolveRepoPath(root, master.source_path), root);
    }
    if (!(await assertAbsentOrExact(root, master.flat_master_path, flatRecord.contents, `${master.id} promoted flat master`))) {
      await copyFileAtomic(resolveRepoPath(root, flat.path), resolveRepoPath(root, master.flat_master_path), root);
    }
    master.lineage = pilotLineage(master);
    master.terminal_source_sha256 = source.sha256;
    master.flat_master_sha256 = flat.sha256;
    master.status = "source-ready";

    const [cardRef, firstPosterRef] = [
      master.outputs.find((output) => output.recipe.kind === "lesson-card"),
      master.outputs.find((output) => output.recipe.kind === "video-poster"),
    ];
    assert(cardRef && firstPosterRef, `${master.id} pilot output mapping is incomplete`);
    const promoted = [
      [cardRef, master.pilot.assets.lesson_card],
      [firstPosterRef, master.pilot.assets.video_poster],
    ];
    for (const [outputRef, approvedAsset] of promoted) {
      const approvedRecord = await fileRecord(root, approvedAsset.path);
      assert(approvedRecord.checksum_sha256 === approvedAsset.sha256, `${master.id} approved pilot derivative checksum drifted`);
      const output = findOutput(ledger, outputRef.asset_key);
      if (!(await assertAbsentOrExact(root, output.manifest_path, approvedRecord.contents, `${master.id} promoted derivative`))) {
        await copyFileAtomic(resolveRepoPath(root, approvedAsset.path), resolveRepoPath(root, output.manifest_path), root);
      }
      const copied = await inspectArtworkFile(root, output, ledger.palette_rgb);
      assert(copied.checksum_sha256 === approvedAsset.sha256, `${master.id} promoted derivative was not copied byte-for-byte`);
      output.checksum_sha256 = copied.checksum_sha256;
      output.pixel_sha256 = copied.pixel_sha256;
      output.size_bytes = copied.size_bytes;
      output.approval_status = MISSING;
      output.provenance.promoted_pilot_sha256 = approvedAsset.sha256;
      applyOutputProvenance(output, master);
    }
  }
  ledger.status = "production";
  ledger.updated_at = new Date().toISOString();
  return ledger;
}

export async function ingestGeneration({
  root,
  ledger,
  masterId,
  sourceFile,
  generationCallId,
  toolOutputId,
  generatedAt,
  generatedBy,
  correctionPromptPath = null,
  parentSha256 = null,
}) {
  assert(ledger.pilot_approval.status === APPROVED, "Generation ingest requires pilot approval");
  assert(ledger.status === "production", "Generation ingest requires promoted pilots");
  const master = findMaster(ledger, masterId);
  assert(!master.pilot, "Approved pilots must be promoted, not ingested as new generations");
  assertString(sourceFile, "source file");
  assertString(generationCallId, "generation call id");
  assertString(toolOutputId, "tool output id");
  assertIso(generatedAt, "generated_at");
  assertString(generatedBy, "generated_by");
  const providerPath = path.resolve(sourceFile);
  assert((await realpath(providerPath)) === providerPath, `${masterId} provider source path contains a symlink`);
  const providerInfo = await lstat(providerPath);
  assert(providerInfo.isFile() && !providerInfo.isSymbolicLink(), `${masterId} provider source must be a regular non-symlink file`);
  const sourceBuffer = await readFile(providerPath);
  const metadata = await sharp(sourceBuffer).metadata();
  assert(metadata.format === "png", `${masterId} provider source must be PNG`);
  assert(metadata.width && metadata.height, `${masterId} provider source has no dimensions`);
  assert(!metadata.hasAlpha, `${masterId} provider source must not contain alpha`);
  assert((metadata.pages ?? 1) === 1, `${masterId} provider source must not be animated`);
  const outputSha256 = sha256(sourceBuffer);
  let suppliedCorrectionPromptSha256 = null;
  if (correctionPromptPath !== null) {
    assertString(correctionPromptPath, "correction prompt path");
    suppliedCorrectionPromptSha256 = (await fileRecord(root, correctionPromptPath)).checksum_sha256;
  }
  const replay = master.lineage.at(-1);
  if (
    replay &&
    replay.generation_call_id === generationCallId &&
    replay.tool_output_id === toolOutputId &&
    replay.output_sha256 === outputSha256 &&
    replay.completed_at === generatedAt &&
    replay.generated_by === generatedBy
  ) {
    assert(parentSha256 === replay.parent_source_sha256, `${masterId} replay parent checksum differs from recorded lineage`);
    assert(correctionPromptPath === replay.correction_prompt_path, `${masterId} replay correction prompt path differs from recorded lineage`);
    assert(suppliedCorrectionPromptSha256 === replay.correction_prompt_sha256, `${masterId} replay correction prompt checksum differs from recorded lineage`);
    const terminal = await fileRecord(root, master.source_path);
    const archived = await fileRecord(root, replay.archived_output_path);
    assert(terminal.checksum_sha256 === outputSha256 && archived.checksum_sha256 === outputSha256, `${masterId} replay files drifted`);
    return ledger;
  }
  const existingInvocationIds = ledger.masters.flatMap((candidate) => candidate.lineage.map((step) => step.generation_call_id));
  const existingToolOutputIds = ledger.masters.flatMap((candidate) => candidate.lineage.map((step) => step.tool_output_id));
  const existingSourceHashes = ledger.masters.flatMap((candidate) => candidate.lineage.map((step) => step.output_sha256));
  assert(!existingInvocationIds.includes(generationCallId), `Generation call id already exists: ${generationCallId}`);
  assert(!existingToolOutputIds.includes(toolOutputId), `Tool output id already exists: ${toolOutputId}`);
  assert(!existingSourceHashes.includes(outputSha256), `${masterId} provider source duplicates an existing lineage output`);
  const sequence = master.lineage.length + 1;
  const correction = sequence > 1;
  if (master.lineage.length > 0) {
    assert(Date.parse(generatedAt) >= Date.parse(master.lineage.at(-1).completed_at), `${masterId} generation timestamp predates its lineage tail`);
  } else {
    assert(Date.parse(generatedAt) >= Date.parse(ledger.pilot_approval.approved_at), `${masterId} generation predates pilot approval`);
  }
  if (correction) {
    assert(parentSha256 === master.terminal_source_sha256, `${masterId} correction parent checksum does not match terminal source`);
    assertString(correctionPromptPath, "correction prompt path");
    assert(["derived", "source-ready"].includes(master.status), `${masterId} correction requires a derived or correctable source-ready version`);
    if (master.status === "source-ready") {
      assert(master.review.status === "pending", `${masterId} correctable source-ready version retains a review`);
      for (const outputRef of master.outputs) {
        assert(findOutput(ledger, outputRef.asset_key).checksum_sha256 === null, `${masterId} source-ready correction retains current output metadata`);
      }
    }
  } else {
    assert(correctionPromptPath === null && parentSha256 === null, `${masterId} first ingest cannot be a correction`);
    assert(master.status === "missing", `${masterId} first ingest requires missing state`);
  }
  const extension = path.extname(sourceFile).toLowerCase();
  const archivePath = path.posix.join(path.posix.dirname(master.source_path), "lineage", master.id, `step-${String(sequence).padStart(3, "0")}${extension}`);
  const correctionPromptSha256 = suppliedCorrectionPromptSha256;
  if (correction && master.status === "derived") {
    assert(SHA256.test(master.flat_master_sha256), `${masterId} prior flat master is not recorded`);
    const priorFlat = await fileRecord(root, master.flat_master_path);
    assert(priorFlat.checksum_sha256 === master.flat_master_sha256, `${masterId} prior flat master drifted`);
    const flatArchive = path.posix.join(
      path.posix.dirname(master.source_path),
      "lineage",
      master.id,
      "flat-masters",
      `version-${String(sequence - 1).padStart(3, "0")}.png`,
    );
    if (!(await assertAbsentOrExact(root, flatArchive, priorFlat.contents, `${masterId} historical flat master`))) {
      await writeBufferAtomic(resolveRepoPath(root, flatArchive), priorFlat.contents, root);
    }
    master.flat_history.push({
      version: master.flat_history.length + 1,
      lineage_sequence: sequence - 1,
      archived_path: flatArchive,
      checksum_sha256: master.flat_master_sha256,
      size_bytes: priorFlat.size_bytes,
    });
    master.flat_replacement_authorized_checksum = master.flat_master_sha256;
    for (const outputRef of master.outputs) {
      const output = findOutput(ledger, outputRef.asset_key);
      assert(SHA256.test(output.checksum_sha256), `${output.asset_key} prior derivative is not recorded`);
      const actual = await inspectArtworkFile(root, output, ledger.palette_rgb);
      assert(actual.checksum_sha256 === output.checksum_sha256, `${output.asset_key} changed before correction archival`);
      const archive = path.posix.join(
        path.posix.dirname(master.source_path),
        "lineage",
        master.id,
        "derivatives",
        `version-${String(sequence - 1).padStart(3, "0")}-${path.posix.basename(output.manifest_path)}`,
      );
      if (!(await assertAbsentOrExact(root, archive, actual.contents, `${output.asset_key} historical derivative`))) {
        await writeBufferAtomic(resolveRepoPath(root, archive), actual.contents, root);
      }
      output.history.push({
        version: output.history.length + 1,
        lineage_sequence: sequence - 1,
        archived_path: archive,
        checksum_sha256: output.checksum_sha256,
        pixel_sha256: output.pixel_sha256,
        size_bytes: output.size_bytes,
        recipe_sha256: output.derivative.recipe_sha256,
        review: clone(master.review),
      });
      output.replacement_authorized_checksum = output.checksum_sha256;
    }
  }
  if (!(await assertAbsentOrExact(root, archivePath, sourceBuffer, `${masterId} lineage archive`))) {
    await writeBufferAtomic(resolveRepoPath(root, archivePath), sourceBuffer, root);
  }
  const sourceDestination = resolveRepoPath(root, master.source_path);
  let sourceAlreadyExact = false;
  if (await pathExists(sourceDestination)) {
    const current = await fileRecord(root, master.source_path);
    const allowed = correction ? [master.terminal_source_sha256, outputSha256] : [outputSha256];
    assert(allowed.includes(current.checksum_sha256), `${masterId} source destination is an orphan or mismatched restart artifact`);
    sourceAlreadyExact = current.checksum_sha256 === outputSha256;
  }
  if (!sourceAlreadyExact) await writeBufferAtomic(sourceDestination, sourceBuffer, root);
  master.lineage.push({
    sequence,
    operation: correction ? "correction" : "generate",
    prompt_sha256: correction ? correctionPromptSha256 : master.prompt_sha256,
    correction_prompt_path: correctionPromptPath,
    correction_prompt_sha256: correctionPromptSha256,
    parent_source_sha256: correction ? parentSha256 : null,
    generation_call_id: generationCallId,
    tool_output_id: toolOutputId,
    generated_by: generatedBy,
    completed_at: generatedAt,
    archived_output_path: archivePath,
    output_sha256: outputSha256,
    reference_inputs: clone(master.reference_inputs),
  });
  master.terminal_source_sha256 = outputSha256;
  master.flat_master_sha256 = null;
  master.status = "source-ready";
  master.review = baseReview();
  for (const outputRef of master.outputs) {
    const output = findOutput(ledger, outputRef.asset_key);
    output.checksum_sha256 = null;
    output.pixel_sha256 = null;
    output.size_bytes = null;
    output.approval_status = MISSING;
  }
  ledger.status = "production";
  ledger.updated_at = generatedAt;
  return ledger;
}

export async function deriveMaster({ root, ledger, masterId }) {
  const master = findMaster(ledger, masterId);
  assert(master.status === "source-ready" || master.status === "derived", `${masterId} has no source to derive`);
  const sourceRecord = await fileRecord(root, master.source_path);
  assert(sourceRecord.checksum_sha256 === master.terminal_source_sha256, `${masterId} terminal source checksum drifted`);
  if (master.status === "derived") {
    const flat = await fileRecord(root, master.flat_master_path);
    assert(flat.checksum_sha256 === master.flat_master_sha256, `${masterId} flat master drifted`);
    for (const outputRef of master.outputs) {
      const output = findOutput(ledger, outputRef.asset_key);
      const actual = await inspectArtworkFile(root, output, ledger.palette_rgb);
      assert(actual.checksum_sha256 === output.checksum_sha256, `${output.asset_key} checksum drifted`);
      assert(actual.pixel_sha256 === output.pixel_sha256, `${output.asset_key} pixel checksum drifted`);
      assert(actual.size_bytes === output.size_bytes, `${output.asset_key} size drifted`);
    }
    return ledger;
  }
  let flatBuffer = null;
  let flatInput;
  let flatChecksum;
  if (master.pilot) {
    const existingFlat = await fileRecord(root, master.flat_master_path);
    assert(existingFlat.checksum_sha256 === master.pilot.assets.flat_master.sha256, `${masterId} promoted flat master drifted`);
    flatInput = existingFlat.contents;
    flatChecksum = existingFlat.checksum_sha256;
  } else {
    const masterBackground = master.background_rgb ? assertRecipeRgb(master.background_rgb, ledger.palette_rgb, `${master.id} background`) : BLUE;
    flatBuffer = await encodeFlatPng(sourceRecord.contents, ledger.palette_rgb, masterBackground);
    flatInput = flatBuffer;
    flatChecksum = sha256(flatBuffer);
  }
  const candidates = [];
  for (const outputRef of master.outputs) {
    const output = findOutput(ledger, outputRef.asset_key);
    if (master.pilot && output.provenance.promoted_pilot_sha256) {
      const promoted = await inspectArtworkFile(root, output, ledger.palette_rgb);
      assert(promoted.checksum_sha256 === output.provenance.promoted_pilot_sha256, `${output.asset_key} promoted pilot derivative drifted`);
      candidates.push({
        output,
        promoted: true,
        record: promoted,
        buffer: promoted.contents,
      });
      continue;
    }
    const buffer = await encodeDerivedWebp(flatInput, outputRef.recipe, ledger.palette_rgb);
    const inspected = await inspectArtworkBuffer(output, ledger.palette_rgb, buffer);
    candidates.push({
      output,
      promoted: false,
      buffer,
      record: {
        contents: buffer,
        checksum_sha256: sha256(buffer),
        pixel_sha256: inspected.pixel_sha256,
        size_bytes: buffer.length,
      },
    });
  }
  const posterPixels = [
    ...ledger.assets
      .filter((asset) => asset.kind === "video-poster" && asset.checksum_sha256 && asset.provenance.master_id !== master.id)
      .map((asset) => asset.pixel_sha256),
    ...candidates.filter((candidate) => candidate.output.kind === "video-poster").map((candidate) => candidate.record.pixel_sha256),
  ];
  assert(new Set(posterPixels).size === posterPixels.length, "Derived poster duplicates an existing poster's decoded pixels");

  if (!master.pilot) {
    const flatPath = resolveRepoPath(root, master.flat_master_path);
    if (await pathExists(flatPath)) {
      const existing = await fileRecord(root, master.flat_master_path);
      const allowed = [master.flat_master_sha256, master.flat_replacement_authorized_checksum, flatChecksum].filter(Boolean);
      assert(allowed.includes(existing.checksum_sha256), `${masterId} flat master is an orphan or mismatched restart artifact`);
      if (existing.checksum_sha256 !== flatChecksum) {
        assert(existing.checksum_sha256 === master.flat_replacement_authorized_checksum, `${masterId} flat replacement was not explicitly authorized`);
        await writeBufferAtomic(flatPath, flatBuffer, root);
      }
    } else {
      await writeBufferAtomic(flatPath, flatBuffer, root);
    }
  }
  master.flat_master_sha256 = flatChecksum;
  master.flat_replacement_authorized_checksum = null;

  for (const candidate of candidates) {
    const { output, record, buffer } = candidate;
    if (!candidate.promoted) {
      const candidateSha = record.checksum_sha256;
      const outputPath = resolveRepoPath(root, output.manifest_path);
      if (await pathExists(outputPath)) {
        const existing = await fileRecord(root, output.manifest_path);
        const allowed = [output.checksum_sha256, output.replacement_authorized_checksum, candidateSha].filter(Boolean);
        assert(allowed.includes(existing.checksum_sha256), `${output.asset_key} is an orphan or mismatched restart artifact`);
        if (existing.checksum_sha256 !== candidateSha) {
          assert(existing.checksum_sha256 === output.replacement_authorized_checksum, `${output.asset_key} replacement was not explicitly authorized`);
          await writeBufferAtomic(outputPath, buffer, root);
        }
      } else {
        await writeBufferAtomic(outputPath, buffer, root);
      }
    }
    output.checksum_sha256 = record.checksum_sha256;
    output.pixel_sha256 = record.pixel_sha256;
    output.size_bytes = record.size_bytes;
    output.approval_status = MISSING;
    output.replacement_authorized_checksum = null;
    applyOutputProvenance(output, master);
  }
  master.status = "derived";
  master.review = baseReview();
  ledger.updated_at = new Date().toISOString();
  return ledger;
}

export async function reviewMaster({ root, ledger, masterId, decision, reviewedBy, reviewedAt, evidence }) {
  const master = findMaster(ledger, masterId);
  assert(master.status === "derived", `${masterId} must be derived before review`);
  assertString(reviewedBy, "reviewed_by");
  assertIso(reviewedAt, "reviewed_at");
  assertString(evidence, "review evidence");
  assert([APPROVED, "changes_requested"].includes(decision), "review decision must be approved or changes_requested");
  assert(Date.parse(reviewedAt) >= Date.parse(master.lineage.at(-1).completed_at), `${masterId} review predates generation`);
  const required = [master.id, master.terminal_source_sha256, master.flat_master_sha256];
  for (const outputRef of master.outputs) {
    const output = findOutput(ledger, outputRef.asset_key);
    const actual = await inspectArtworkFile(root, output, ledger.palette_rgb);
    assert(actual.checksum_sha256 === output.checksum_sha256, `${output.asset_key} changed before review`);
    required.push(output.asset_key, output.checksum_sha256, output.pixel_sha256);
  }
  const evidenceRecord = await validateEvidence(root, evidence, required);
  master.review = {
    status: decision,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAt,
    evidence,
    evidence_sha256: evidenceRecord.sha256,
  };
  for (const outputRef of master.outputs) applyOutputProvenance(findOutput(ledger, outputRef.asset_key), master);
  ledger.updated_at = reviewedAt;
  return ledger;
}

export function reconcileManifestFromLedger(ledger, manifest) {
  assert(ledger.status === "finalized", "Manifest reconciliation requires a finalized ledger");
  const nextManifest = clone(manifest);
  const manifestByKey = new Map(nextManifest.assets.map((asset) => [asset.source_key, asset]));
  for (const asset of ledger.assets) {
    assert(SHA256.test(asset.checksum_sha256), `${asset.asset_key} has no production checksum`);
    assert(Number.isInteger(asset.size_bytes) && asset.size_bytes > 0, `${asset.asset_key} has no production size`);
    const manifestAsset = manifestByKey.get(asset.asset_key);
    assert(manifestAsset && manifestAsset.local_path === asset.manifest_path, `${asset.asset_key} manifest mapping drifted`);
    const extension = path.posix.extname(asset.base_storage_path);
    const stem = asset.base_storage_path.slice(0, -extension.length);
    const addressedStoragePath = `${stem}-${asset.checksum_sha256}${extension}`;
    assert(asset.approval_status === APPROVED, `${asset.asset_key} is not approved in finalized ledger`);
    assert(asset.storage_path === addressedStoragePath, `${asset.asset_key} canonical storage path drifted`);
    manifestAsset.checksum_sha256 = asset.checksum_sha256;
    manifestAsset.size_bytes = asset.size_bytes;
    manifestAsset.storage_path = addressedStoragePath;
    manifestAsset.approval_status = APPROVED;
  }
  return nextManifest;
}

export async function finalizeArtwork({ root, ledger, manifest, approvedBy, approvedAt, evidence }) {
  assert(ledger.status !== "finalized", "Artwork ledger is already finalized");
  assert(ledger.pilot_approval.status === APPROVED, "Finalization requires pilot approval");
  assertString(approvedBy, "approved_by");
  assertIso(approvedAt, "approved_at");
  assertString(evidence, "final approval evidence");
  assert(
    ledger.masters.every((master) => master.status === "derived"),
    "Every artwork master must be derived",
  );
  assert(
    ledger.masters.every((master) => master.review.status === APPROVED),
    "Every artwork master requires human review",
  );
  for (const asset of ledger.assets) {
    const actual = await inspectArtworkFile(root, asset, ledger.palette_rgb);
    assert(actual.checksum_sha256 === asset.checksum_sha256, `${asset.asset_key} checksum changed before finalization`);
    assert(actual.size_bytes === asset.size_bytes, `${asset.asset_key} size changed before finalization`);
  }
  const posterHashes = ledger.assets.filter((asset) => asset.kind === "video-poster").map((asset) => asset.checksum_sha256);
  assert(new Set(posterHashes).size === EXPECTED_COUNTS.posters, "Every video poster must have unique pixels");
  assert(new Set(ledger.assets.map((asset) => asset.checksum_sha256)).size === 49, "Every final artwork file must have a unique SHA-256");
  assert(
    new Set(ledger.assets.filter((asset) => asset.kind === "video-poster").map((asset) => asset.pixel_sha256)).size === 29,
    "Every decoded poster pixel checksum must be unique",
  );
  const evidenceRecord = await validateEvidence(
    root,
    evidence,
    ledger.assets.flatMap((asset) => [asset.asset_key, asset.checksum_sha256, asset.pixel_sha256]),
  );
  const latestReview = Math.max(...ledger.masters.map((master) => Date.parse(master.review.reviewed_at)));
  assert(Date.parse(approvedAt) >= latestReview, "Final approval predates an artwork review");
  for (const asset of ledger.assets) {
    const extension = path.posix.extname(asset.base_storage_path);
    const stem = asset.base_storage_path.slice(0, -extension.length);
    asset.storage_path = `${stem}-${asset.checksum_sha256}${extension}`;
    asset.approval_status = APPROVED;
  }
  ledger.final_approval = {
    status: APPROVED,
    approved_by: approvedBy,
    approved_at: approvedAt,
    evidence,
    evidence_sha256: evidenceRecord.sha256,
  };
  ledger.status = "finalized";
  ledger.updated_at = approvedAt;
  const nextManifest = reconcileManifestFromLedger(ledger, manifest);
  return { ledger, manifest: nextManifest };
}

export async function loadWorkflow(root) {
  const [inventory, ledger, manifest] = await Promise.all([
    readJson(resolveRepoPath(root, DEFAULT_PATHS.inventory)),
    readJson(resolveRepoPath(root, DEFAULT_PATHS.ledger)),
    readJson(resolveRepoPath(root, DEFAULT_PATHS.manifest)),
  ]);
  return { inventory, ledger, manifest };
}

export function summarizeLedger(ledger) {
  return {
    status: ledger.status,
    pilot_approval: ledger.pilot_approval.status,
    masters: {
      total: ledger.masters.length,
      missing: ledger.masters.filter((master) => master.status === "missing").length,
      source_ready: ledger.masters.filter((master) => master.status === "source-ready").length,
      derived: ledger.masters.filter((master) => master.status === "derived").length,
      reviewed: ledger.masters.filter((master) => master.review.status === APPROVED).length,
    },
    assets: {
      total: ledger.assets.length,
      produced: ledger.assets.filter((asset) => asset.checksum_sha256).length,
      approved: ledger.assets.filter((asset) => asset.approval_status === APPROVED).length,
    },
    planned_generation_calls: ledger.counts.planned_generation_calls,
    promoted_pilots: ledger.counts.promoted_pilots,
  };
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
