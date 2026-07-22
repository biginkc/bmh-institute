import { createHash, randomUUID } from "node:crypto";
import { copyFile, link, lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import lockfile from "proper-lockfile";

import { compareArtworkAssetKeys, deterministicArtworkLabelSvg } from "./deterministic-artwork-label.mjs";
import {
  DEFAULT_MASTER_REVIEW_INDEX_PATH,
  DEFAULT_MASTER_REVIEW_SHEET_PATHS,
  validateMasterReviewSurface,
} from "../../docs/course-production/thumbnail-pilots/qa/master-review/build-master-review.mjs";

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
  contactSheet: "docs/course-production/thumbnail-pilots/qa/current-artwork-contact-sheet-2026-07-17.png",
  contactSheetIndex: "docs/course-production/thumbnail-pilots/qa/current-artwork-contact-sheet-2026-07-17.json",
  masterReviewIndex: DEFAULT_MASTER_REVIEW_INDEX_PATH,
  masterReviewSheets: DEFAULT_MASTER_REVIEW_SHEET_PATHS,
  finalReviewRequest: "docs/course-production/thumbnail-pilots/approvals/final-artwork-review-request-v4.json",
});

const APPROVED = "approved";
const MISSING = "missing";
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const BLUE = [103, 182, 255];
const YELLOW = [255, 211, 1];
const LOCKED_BACKGROUND_RGB = new Set([BLUE.join(","), YELLOW.join(",")]);
export const FINAL_ARTWORK_APPROVAL_RESPONSE =
  "Approved: I reviewed and approve all 28 artwork masters shown in the four exact checksum-bound master review sheets and all 49 derived assets shown in the exact checksum-bound derivative contact sheet, for promotion into the BMH Institute course manifest.";
export const FINAL_ARTWORK_CONTEXTUAL_APPROVAL_PROMPT =
  "Do you approve all 28 exact masters, or which numbered masters need revision?";
export const FINAL_ARTWORK_CONTEXTUAL_SCOPE_STATEMENT =
  "Approved: I approve all 28 exact artwork masters shown in the four checksum-bound master review sheets.";
const FINAL_ARTWORK_REVIEW_INSTRUCTION =
  `Only after visibly reviewing all four checksum-bound master sheets and the exact checksum-bound 49-asset derivative contact sheet, approve all 28 masters and all 49 exact derived assets for course-manifest promotion by responding exactly: ${FINAL_ARTWORK_APPROVAL_RESPONSE}`;
const FINAL_REVIEW_COLUMNS = 4;
const FINAL_REVIEW_TILE_WIDTH = 320;
const FINAL_REVIEW_ARTWORK_HEIGHT = 200;
const FINAL_REVIEW_LABEL_HEIGHT = 44;
const FINAL_REVIEW_GUTTER = 12;
const FINAL_REVIEW_MARGIN = 20;

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

function assertPaletteRgb(value, palette, label) {
  assert(Array.isArray(value) && value.length === 3 && value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255), `${label} must be an RGB triplet`);
  const key = value.join(",");
  assert(Array.isArray(palette) && palette.some((color) => Array.isArray(color) && color.join(",") === key), `${label} must belong to the locked artwork palette`);
  return clone(value);
}

function assertRecipeRgb(value, palette, label) {
  const color = assertPaletteRgb(value, palette, label);
  assert(LOCKED_BACKGROUND_RGB.has(color.join(",")), `${label} must be locked blue or yellow`);
  return color;
}

function assertArtDirection(value, palette, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} art direction is required`);
  assertString(value.pose_id, `${label} pose_id`);
  assert(value.people_count === 1, `${label} must depict exactly one person`);
  assert(["andrea-approved", "recurring-seller-approved"].includes(value.character_id), `${label} character must be Andrea or the recurring seller`);
  assert(value.skin_fill === "pure white", `${label} skin fill must be pure white`);
  for (const field of ["posture", "orientation", "gesture", "placement", "prop", "lesson_or_video_cue", "pose_instruction"]) {
    assertString(value[field], `${label} ${field}`);
  }
  assert(/exactly one person/i.test(value.pose_instruction), `${label} pose instruction must state the one-person rule`);
  assertRecipeRgb(value.background_rgb, palette, `${label} background`);
  return clone(value);
}

function assertFlatFillCleanup(value, palette, label) {
  if (value === undefined) return [];
  assert(Array.isArray(value) && value.length > 0, `${label} flat-fill cleanup must be a nonempty array`);
  const ids = new Set();
  return value.map((cleanup, index) => {
    const cleanupLabel = `${label} flat-fill cleanup ${index + 1}`;
    assertString(cleanup?.id, `${cleanupLabel} id`);
    assert(!ids.has(cleanup.id), `${label} flat-fill cleanup ids must be unique`);
    ids.add(cleanup.id);
    assert(
      Array.isArray(cleanup.seed_xy) && cleanup.seed_xy.length === 2 && cleanup.seed_xy.every((coordinate) => Number.isInteger(coordinate) && coordinate >= 0),
      `${cleanupLabel} seed_xy must be two nonnegative integers`,
    );
    assert(
      Array.isArray(cleanup.accepted_rgb) && cleanup.accepted_rgb.length >= 2,
      `${cleanupLabel} accepted_rgb must contain at least two colors`,
    );
    const accepted = cleanup.accepted_rgb.map((color, colorIndex) =>
      assertPaletteRgb(color, palette, `${cleanupLabel} accepted color ${colorIndex + 1}`));
    assert(new Set(accepted.map(paletteKey)).size === accepted.length, `${cleanupLabel} accepted colors must be unique`);
    const replacement = assertPaletteRgb(cleanup.replacement_rgb, palette, `${cleanupLabel} replacement`);
    assert(accepted.some((color) => paletteKey(color) === paletteKey(replacement)), `${cleanupLabel} replacement must be accepted`);
    assert(Number.isInteger(cleanup.expected_pixel_count) && cleanup.expected_pixel_count > 0, `${cleanupLabel} expected_pixel_count is invalid`);
    assert(Number.isInteger(cleanup.expected_changed_pixel_count) && cleanup.expected_changed_pixel_count > 0, `${cleanupLabel} expected_changed_pixel_count is invalid`);
    assert(cleanup.expected_changed_pixel_count < cleanup.expected_pixel_count, `${cleanupLabel} changed pixels must be a strict subset of the cleaned region`);
    assertString(cleanup.source_pixel_baseline_path, `${cleanupLabel} source_pixel_baseline_path`);
    assert(SHA256.test(cleanup.source_pixel_baseline_sha256), `${cleanupLabel} source_pixel_baseline_sha256 is invalid`);
    assertString(cleanup.flat_pixel_baseline_path, `${cleanupLabel} flat_pixel_baseline_path`);
    assert(SHA256.test(cleanup.flat_pixel_baseline_sha256), `${cleanupLabel} flat_pixel_baseline_sha256 is invalid`);
    assert(
      Array.isArray(cleanup.expected_bounds) && cleanup.expected_bounds.length === 4 &&
        cleanup.expected_bounds.every((coordinate) => Number.isInteger(coordinate) && coordinate >= 0) &&
        cleanup.expected_bounds[0] <= cleanup.expected_bounds[2] && cleanup.expected_bounds[1] <= cleanup.expected_bounds[3],
      `${cleanupLabel} expected_bounds is invalid`,
    );
    return {
      id: cleanup.id,
      seed_xy: clone(cleanup.seed_xy),
      accepted_rgb: accepted,
      replacement_rgb: replacement,
      expected_pixel_count: cleanup.expected_pixel_count,
      expected_changed_pixel_count: cleanup.expected_changed_pixel_count,
      source_pixel_baseline_path: cleanup.source_pixel_baseline_path,
      source_pixel_baseline_sha256: cleanup.source_pixel_baseline_sha256,
      flat_pixel_baseline_path: cleanup.flat_pixel_baseline_path,
      flat_pixel_baseline_sha256: cleanup.flat_pixel_baseline_sha256,
      expected_bounds: clone(cleanup.expected_bounds),
    };
  });
}

export function resolveRepoPath(root, relativePath) {
  assertString(relativePath, "repository path");
  assert(!path.isAbsolute(relativePath), `Path must be repository-relative: ${relativePath}`);
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, relativePath);
  assert(resolved === normalizedRoot || resolved.startsWith(`${normalizedRoot}${path.sep}`), `Path escapes repository: ${relativePath}`);
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

export async function writeJsonAtomicCreateOrExact(filePath, value, { root = null } = {}) {
  await prepareSafeWriteParent(root, filePath);
  const expected = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  try {
    const existing = await readFile(filePath);
    assert(existing.equals(expected), `Write-once artifact already exists with different bytes: ${filePath}`);
    return { status: "reused", checksum_sha256: sha256(existing) };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(expected);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, filePath);
    await syncDirectory(path.dirname(filePath));
    return { status: "created", checksum_sha256: sha256(expected) };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readFile(filePath);
    assert(existing.equals(expected), `Write-once artifact concurrently appeared with different bytes: ${filePath}`);
    return { status: "reused", checksum_sha256: sha256(existing) };
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function writeBufferAtomic(filePath, buffer, root) {
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
    ...(asset.art_direction ? { art_direction: clone(asset.art_direction) } : {}),
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
  assert(Array.isArray(derivative.crop_pixels_after_normalize) && derivative.crop_pixels_after_normalize.length === 4, `${poster.asset_key} fixed pixel crop is required`);
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
  artDirection,
  flatFillCleanup,
  videoEvidence,
  contactSheetInput,
  requireVideoEvidence = false,
  pilot,
  outputs,
}) {
  if (requireVideoEvidence && kind !== "course-cover-master") {
    assert(Array.isArray(videoEvidence) && videoEvidence.length > 0, `${id} requires exact mapped source-video evidence`);
    assert(
      videoEvidence.every(
        (evidence) =>
          (evidence?.path && SHA256.test(evidence.sha256)) ||
          (evidence?.asset_key && evidence?.local_path && SHA256.test(evidence.checksum_sha256)),
      ),
      `${id} source-video evidence is invalid`,
    );
    assert(contactSheetInput?.id && contactSheetInput?.path && SHA256.test(contactSheetInput.sha256), `${id} contact-sheet input is invalid`);
    assert(referenceIds.includes(contactSheetInput.id), `${id} contact-sheet input is not a required generation reference`);
    const lockedReference = referenceInputs.find((reference) => reference.id === contactSheetInput.id);
    assert(
      lockedReference?.path === contactSheetInput.path && lockedReference?.sha256 === contactSheetInput.sha256,
      `${id} contact-sheet reference provenance drifted`,
    );
  }
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
    ...(artDirection ? { art_direction: clone(artDirection) } : {}),
    ...(flatFillCleanup?.length ? { flat_fill_cleanup: clone(flatFillCleanup) } : {}),
    video_evidence: clone(videoEvidence ?? []),
    contact_sheet_input: contactSheetInput ? clone(contactSheetInput) : null,
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

function isTwoIdentityPilotLineage(lineage) {
  return typeof lineage?.character_id === "string" && lineage?.generation && !Array.isArray(lineage.character_id);
}

const TWO_IDENTITY_PILOT_CHARACTERS = Object.freeze({
  orientation: "andrea-approved",
  "opening-the-call": "andrea-approved",
  "objection-architecture": "recurring-seller-approved",
});

function assertTwoIdentityContract(pilotReview, label, poseVariation = false) {
  const expectedSchema = poseVariation ? "bmh-thumbnail-pilot-lineage/v4-candidate" : "bmh-thumbnail-pilot-lineage/v3-candidate";
  assert(pilotReview.lineage_schema_version === expectedSchema, `${label} ${poseVariation ? "v4" : "v3"} lineage schema is invalid`);
  assert(pilotReview.identity_contract?.people_per_thumbnail === 1, `${label} must depict exactly one person`);
  assert(JSON.stringify(pilotReview.identity_contract?.allowed_characters) === JSON.stringify(["andrea", "recurring-seller"]), `${label} allowed character ids drifted`);
  assert(pilotReview.identity_contract?.selection_rule === "Andrea or the recurring seller, never both; the lesson and exact source video determine the character and cue", `${label} Andrea-or-seller selection rule drifted`);
  const roots = pilotReview.identity_roots;
  assert(Array.isArray(roots) && roots.length === 2, `${label} requires exactly two identity roots`);
  assert(new Set(roots.map((root) => root.id)).size === 2, `${label} identity roots cannot be mixed or duplicated`);
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  for (const [id, expectedPath] of [
    ["andrea-approved", "docs/course-production/thumbnail-pilots/references/v5-cast/andrea-approved.png"],
    ["recurring-seller-approved", "docs/course-production/thumbnail-pilots/references/v5-cast/recurring-seller.png"],
  ]) {
    const root = rootsById.get(id);
    assert(root?.path === expectedPath && SHA256.test(root?.sha256), `${label} identity root ${id} is invalid`);
  }
  const lineage = pilotReview.generation_lineage;
  const expectedCharacter = TWO_IDENTITY_PILOT_CHARACTERS[lineage.slug];
  assert(expectedCharacter && lineage.character_id === expectedCharacter, `${label} exact character id drifted`);
  assert(!("character_ids" in lineage), `${label} violates the one-person character contract`);
  assert(rootsById.has(lineage.character_id), `${label} character does not resolve to an identity root`);
  assert(Array.isArray(lineage.video_evidence) && lineage.video_evidence.length > 0, `${label} source-video evidence is missing`);
  assert(
    lineage.video_evidence.every((input) => input?.path && SHA256.test(input.sha256)),
    `${label} source-video evidence is invalid`,
  );
  assert(lineage.contact_sheet_input?.path && SHA256.test(lineage.contact_sheet_input.sha256), `${label} contact sheet is invalid`);
  assert(["generate", "edit"].includes(lineage.generation?.operation), `${label} generation operation is invalid`);
  assertString(lineage.generation?.prompt_path, `${label} generation prompt path`);
  assert(SHA256.test(lineage.generation?.prompt_sha256), `${label} generation prompt checksum is invalid`);
  assertString(lineage.generation?.output_path, `${label} generation output path`);
  assert(SHA256.test(lineage.generation?.output_sha256), `${label} generation output checksum is invalid`);
  assertString(lineage.generation?.tool_output_id, `${label} tool output id`);
  assert(lineage.generation.output_path === pilotReview.assets?.source?.path, `${label} source path drifted from lineage`);
  assert(lineage.generation.output_sha256 === pilotReview.assets?.source?.sha256, `${label} source checksum drifted from lineage`);
  if (lineage.generation.operation === "edit") {
    assertString(lineage.generation.parent_path, `${label} edit parent path`);
    assert(SHA256.test(lineage.generation.parent_sha256), `${label} edit parent checksum is invalid`);
    assert(lineage.generation.parent_sha256 !== lineage.generation.output_sha256, `${label} edit parent cannot equal its output`);
  } else {
    assert(lineage.generation.parent_path === undefined && lineage.generation.parent_sha256 === undefined, `${label} generation cannot have an edit parent`);
  }
  if (poseVariation) {
    assertString(lineage.pose_label, `${label} pose_label`);
    assertString(lineage.pose_signature, `${label} pose_signature`);
    assert(!("deterministic_character_lock" in lineage), `${label} v4 cannot use an identical-pixel character lock`);
  }
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
    checksum_record_path: pilotReview.checksum_record_path,
    lineage_record_path: pilotReview.generation_lineage_record_path,
  };
  if (pilotReview.lineage_schema_version === "bmh-thumbnail-pilot-lineage/v3-candidate" || pilotReview.lineage_schema_version === "bmh-thumbnail-pilot-lineage/v4-candidate") {
    assertTwoIdentityContract(pilotReview, plan.slug, pilotReview.lineage_schema_version === "bmh-thumbnail-pilot-lineage/v4-candidate");
    plan.lineage_schema_version = pilotReview.lineage_schema_version;
    plan.identity_contract = clone(pilotReview.identity_contract);
    plan.identity_roots = clone(pilotReview.identity_roots);
    return plan;
  }
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
      Array.isArray(step.inputs) && (index > 0 || step.inputs[0]?.id === sharedParent.id) && step.inputs[0]?.path === parentOutput.path && step.inputs[0]?.sha256 === parentOutput.sha256,
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
  assert(
    inventory.schema_version === "bmh-artwork-production/v1" ||
      inventory.schema_version === "bmh-artwork-production/v2" ||
      inventory.schema_version === "bmh-artwork-production/v3-candidate" ||
      inventory.schema_version === "bmh-artwork-production/v4-candidate",
    "Unsupported artwork inventory",
  );
  const inventoryV2 = inventory.schema_version === "bmh-artwork-production/v2";
  const inventoryV3 = inventory.schema_version === "bmh-artwork-production/v3-candidate";
  const inventoryV4 = inventory.schema_version === "bmh-artwork-production/v4-candidate";
  const inventoryHasLockedBackgrounds = inventoryV2 || inventoryV3 || inventoryV4;
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
  const coverBackground = inventoryHasLockedBackgrounds ? assertRecipeRgb(inventory.course_cover.background_rgb, palette, "course-cover master background") : null;
  const coverArtDirection = inventoryV4 ? assertArtDirection(inventory.course_cover.art_direction, palette, "course-cover") : null;
  const coverFlatFillCleanup = assertFlatFillCleanup(inventory.course_cover.flat_fill_cleanup, palette, "course-cover");
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
      artDirection: coverArtDirection,
      flatFillCleanup: coverFlatFillCleanup,
      requireVideoEvidence: inventoryV4,
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
    const lessonBackground = inventoryHasLockedBackgrounds ? assertRecipeRgb(lesson.master.background_rgb, palette, `${lesson.master.id} background`) : null;
    const lessonArtDirection = inventoryV4 ? assertArtDirection(lesson.master.art_direction, palette, lesson.master.id) : null;
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
        artDirection: lessonArtDirection,
        videoEvidence: lesson.master.video_evidence,
        contactSheetInput: lesson.master.contact_sheet_input,
        requireVideoEvidence: inventoryV4,
        pilot: lesson.pilot ? pilotPlan(lesson.pilot_review) : null,
        outputs: masterOutputs,
      }),
    );

    for (const poster of lesson.posters.filter((entry) => entry.direct_master)) {
      const direct = poster.direct_master;
      const directId = direct.id;
      const directBackground = inventoryHasLockedBackgrounds ? assertRecipeRgb(direct.background_rgb, palette, `${directId} background`) : null;
      const directArtDirection = inventoryV4 ? assertArtDirection(direct.art_direction, palette, directId) : null;
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
          artDirection: directArtDirection,
          videoEvidence: direct.video_evidence,
          contactSheetInput: direct.contact_sheet_input,
          requireVideoEvidence: inventoryV4,
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
  assert(counts.planned_generation_calls === 25, "Expected exactly 25 new generation calls");
  assert(counts.promoted_pilots === 3, "Expected exactly three promoted pilots");
  assert(new Set(outputs.map((asset) => asset.asset_key)).size === 49, "Artwork keys must be unique");
  assert(new Set(outputs.map((asset) => asset.manifest_path)).size === 49, "Artwork paths must be unique");
  const recipeIds = outputs.map((asset) => asset.derivative.recipe.id);
  assert(new Set(recipeIds).size === 49, "Artwork recipe IDs must be globally unique");
  const masterIds = masters.map((master) => master.id);
  assert(masters.length === 28 && new Set(masterIds).size === 28, "Expected exactly 28 unique source masters");
  const masterPaths = masters.flatMap((master) => [master.source_path, master.flat_master_path]);
  assert(new Set(masterPaths).size === masterPaths.length, "Source and flat-master paths must be globally unique");
  const plannedCallIds = masters.map((master) => master.planned_generation_call_id).filter(Boolean);
  assert(new Set(plannedCallIds).size === 25, "Planned generation call IDs must be unique");
  assert(
    masters
      .filter((master) => master.pilot)
      .every(
        (master) =>
          isSharedPilotLineage(master.pilot.lineage) === inventoryV2 &&
          isTwoIdentityPilotLineage(master.pilot.lineage) === (inventoryV3 || inventoryV4),
      ),
    `Artwork inventory ${inventory.schema_version} has an incompatible pilot lineage schema`,
  );
  if (inventoryV3 || inventoryV4) {
    const pilots = masters.filter((master) => master.pilot);
    assert(
      JSON.stringify(pilots.map((master) => [master.pilot.slug, master.pilot.lineage.character_id])) ===
        JSON.stringify([
          ["orientation", "andrea-approved"],
          ["opening-the-call", "andrea-approved"],
          ["objection-architecture", "recurring-seller-approved"],
        ]),
      `Artwork inventory ${inventoryV4 ? "v4" : "v3"} mixed the exact pilot character identities`,
    );
    assert(new Set(pilots.flatMap((master) => master.pilot.identity_roots.map((root) => root.id))).size === 2, `Artwork inventory ${inventoryV4 ? "v4" : "v3"} identity roots drifted`);
  }
  if (inventoryV4) {
    const poseIds = masters.map((master) => master.art_direction.pose_id);
    assert(new Set(poseIds).size === masters.length, "Artwork inventory v4 repeats an independently generated pose_id");
    for (const master of masters) {
      assert(JSON.stringify(master.art_direction.background_rgb) === JSON.stringify(master.background_rgb), `${master.id} art direction background drifts from its render background`);
      for (const outputBinding of master.outputs) {
        const output = outputs.find((candidate) => candidate.asset_key === outputBinding.asset_key);
        assert(JSON.stringify(output?.art_direction) === JSON.stringify(master.art_direction), `${outputBinding.asset_key} must inherit its source master's exact art direction`);
      }
    }
    const pilots = masters.filter((master) => master.pilot);
    const poseLabels = pilots.map((master) => master.pilot.lineage.pose_label);
    const poseSignatures = pilots.map((master) => master.pilot.lineage.pose_signature);
    assert(new Set(poseLabels).size === pilots.length, "Artwork inventory v4 pilot pose labels must be globally unique");
    assert(new Set(poseSignatures).size === pilots.length, "Artwork inventory v4 pilot pose signatures must be globally unique");
    for (const master of pilots) {
      assert(master.art_direction.pose_id === master.pilot.lineage.pose_label, `${master.pilot.slug} pose label drifts from production art direction`);
      assert(master.art_direction.lineage_pose_signature === master.pilot.lineage.pose_signature, `${master.pilot.slug} pose signature drifts from production art direction`);
    }
    const andreaPilots = pilots.filter((master) => master.pilot.lineage.character_id === "andrea-approved");
    assert(andreaPilots.length === 2 && andreaPilots[0].pilot.lineage.pose_signature !== andreaPilots[1].pilot.lineage.pose_signature, "Artwork inventory v4 must vary Andrea's pose between pilots");
  }
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

export function isPristinePreapprovalLedger(ledger) {
  const pendingApproval = (approval) =>
    approval?.status === "pending" &&
    approval.approved_by === null &&
    approval.approved_at === null &&
    approval.evidence === null &&
    approval.evidence_sha256 === null;
  return (
    ledger?.schema_version === SCHEMA_VERSION &&
    ledger.status === "preapproval" &&
    pendingApproval(ledger.pilot_approval) &&
    pendingApproval(ledger.final_approval) &&
    Array.isArray(ledger.masters) &&
    ledger.masters.every(
      (master) =>
        master.status === "missing" &&
        master.terminal_source_sha256 === null &&
        master.flat_master_sha256 === null &&
        master.flat_replacement_authorized_checksum === null &&
        Array.isArray(master.flat_history) &&
        master.flat_history.length === 0 &&
        Array.isArray(master.lineage) &&
        master.lineage.length === 0 &&
        master.review?.status === "pending" &&
        master.review.reviewed_by === null &&
        master.review.reviewed_at === null &&
        master.review.evidence === null &&
        master.review.evidence_sha256 === null,
    ) &&
    Array.isArray(ledger.assets) &&
    ledger.assets.every(
      (asset) =>
        asset.checksum_sha256 === null &&
        asset.pixel_sha256 === null &&
        asset.size_bytes === null &&
        asset.approval_status === "missing" &&
        asset.storage_path === null &&
        asset.replacement_authorized_checksum === null &&
        Array.isArray(asset.history) &&
        asset.history.length === 0,
    )
  );
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

async function assertLockedFile(root, record, label) {
  assertString(record?.path, `${label} path`);
  assert(SHA256.test(record?.sha256), `${label} checksum is invalid`);
  const actual = await fileRecord(root, record.path);
  assert(actual.checksum_sha256 === record.sha256, `${label} exact bytes drifted`);
  if (record.dimensions) {
    const metadata = await sharp(actual.contents).metadata();
    assert(JSON.stringify([metadata.width, metadata.height]) === JSON.stringify(record.dimensions), `${label} dimensions drifted`);
  }
  return actual;
}

async function validateTwoIdentityPilotFiles(root, pilot) {
  if (!isTwoIdentityPilotLineage(pilot.lineage)) return;
  for (const identityRoot of pilot.identity_roots) {
    await assertLockedFile(root, identityRoot, `${pilot.slug} identity root ${identityRoot.id}`);
  }
  await assertLockedFile(root, pilot.lineage.contact_sheet_input, `${pilot.slug} contact sheet`);
  const prompt = await fileRecord(root, pilot.lineage.generation.prompt_path);
  assert(prompt.checksum_sha256 === pilot.lineage.generation.prompt_sha256, `${pilot.slug} generation prompt exact bytes drifted`);
  if (pilot.lineage.generation.operation === "edit") {
    await assertLockedFile(
      root,
      {
        path: pilot.lineage.generation.parent_path,
        sha256: pilot.lineage.generation.parent_sha256,
      },
      `${pilot.slug} edit parent`,
    );
  }
  await assertLockedFile(
    root,
    {
      path: pilot.lineage.generation.output_path,
      sha256: pilot.lineage.generation.output_sha256,
    },
    `${pilot.slug} generation output`,
  );
  const expectedAssetCharacter = pilot.lineage.character_id === "andrea-approved" ? "andrea" : "recurring-seller";
  assert(pilot.assets.character === expectedAssetCharacter, `${pilot.slug} checksum character drifted`);
  for (const kind of ["source", "flat_master", "lesson_card", "video_poster"]) {
    await assertLockedFile(root, pilot.assets[kind], `${pilot.slug} ${kind}`);
  }
  const checksumRecord = await fileRecord(root, pilot.checksum_record_path);
  const checksums = JSON.parse(checksumRecord.contents.toString("utf8"));
  const lockedAsset = checksums.assets?.find((asset) => asset.slug === pilot.slug);
  assert(JSON.stringify(lockedAsset) === JSON.stringify(pilot.assets), `${pilot.slug} checksum record drifted`);
  const lineageRecord = await fileRecord(root, pilot.lineage_record_path);
  const lineage = JSON.parse(lineageRecord.contents.toString("utf8"));
  const lockedLineage = lineage.records?.find((record) => record.slug === pilot.slug);
  assert(JSON.stringify(lockedLineage) === JSON.stringify(pilot.lineage), `${pilot.slug} lineage record drifted`);
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

function assertExactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), `${label} fields are invalid`);
}

function finalReviewMasterBindings(ledger) {
  return ledger.masters.map((master) => {
    let contactSheetInput = null;
    if (master.contact_sheet_input) {
      assertString(master.contact_sheet_input.id, `${master.id} contact-sheet input id`);
      assertString(master.contact_sheet_input.path, `${master.id} contact-sheet input path`);
      assert(!path.isAbsolute(master.contact_sheet_input.path) && !master.contact_sheet_input.path.split("/").includes(".."), `${master.id} contact-sheet input path is unsafe`);
      assert(SHA256.test(master.contact_sheet_input.sha256), `${master.id} contact-sheet input checksum is invalid`);
      contactSheetInput = {
        id: master.contact_sheet_input.id,
        path: master.contact_sheet_input.path,
        sha256: master.contact_sheet_input.sha256,
      };
    }
    return {
      master_id: master.id,
      terminal_source_sha256: master.terminal_source_sha256,
      flat_master_sha256: master.flat_master_sha256,
      video_evidence: master.video_evidence.map((entry, index) => {
      const evidencePath = entry.local_path ?? entry.path;
      const evidenceSha256 = entry.checksum_sha256 ?? entry.sha256;
      assertString(evidencePath, `${master.id} video evidence ${index + 1} path`);
      assert(!path.isAbsolute(evidencePath) && !evidencePath.split("/").includes(".."), `${master.id} video evidence ${index + 1} path is unsafe`);
      assert(SHA256.test(evidenceSha256), `${master.id} video evidence ${index + 1} checksum is invalid`);
      return {
        asset_key: entry.asset_key ?? null,
        path: evidencePath,
        sha256: evidenceSha256,
      };
    }),
      contact_sheet_input: contactSheetInput,
    };
  });
}

function finalReviewAssetBindings(ledger) {
  return ledger.assets.map((asset) => ({
    asset_key: asset.asset_key,
    output_path: asset.output_path,
    checksum_sha256: asset.checksum_sha256,
    pixel_sha256: asset.pixel_sha256,
  }));
}

function finalReviewBindings(ledger) {
  const masters = finalReviewMasterBindings(ledger);
  const assets = finalReviewAssetBindings(ledger);
  return { masters, assets };
}

async function parseStructuredJson(record, label) {
  try {
    return JSON.parse(record.contents.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} must be structured JSON`, { cause: error });
  }
}

function assertFinalReviewLedgerReady(ledger) {
  assert(["production", "finalized"].includes(ledger.status), "Final artwork review requires the production or finalized ledger state");
  assert(ledger.masters.length === 28, "Final artwork review request requires exactly 28 masters");
  assert(ledger.assets.length === 49, "Final artwork review request requires exactly 49 assets");
  assert(ledger.masters.every((master) => master.status === "derived"), "Final artwork review request requires every master to be derived");
  for (const master of ledger.masters) {
    assert(SHA256.test(master.terminal_source_sha256), `${master.id} terminal source checksum is missing from final review`);
    assert(SHA256.test(master.flat_master_sha256), `${master.id} flat-master checksum is missing from final review`);
  }
  for (const asset of ledger.assets) {
    assert(SHA256.test(asset.checksum_sha256), `${asset.asset_key} encoded checksum is missing from final review`);
    assert(SHA256.test(asset.pixel_sha256), `${asset.asset_key} pixel checksum is missing from final review`);
  }
}

function finalReviewLabelSvg(label) {
  return deterministicArtworkLabelSvg(label, {
    width: FINAL_REVIEW_TILE_WIDTH,
    height: FINAL_REVIEW_LABEL_HEIGHT,
  });
}

export async function buildDeterministicFinalContactSheet({ root, ledger }) {
  const assets = [...ledger.assets].sort((left, right) => compareArtworkAssetKeys(left.asset_key, right.asset_key));
  assert(assets.length === 49, "Final contact sheet requires exactly 49 assets");
  const rows = Math.ceil(assets.length / FINAL_REVIEW_COLUMNS);
  const cellHeight = FINAL_REVIEW_ARTWORK_HEIGHT + FINAL_REVIEW_LABEL_HEIGHT;
  const canvasWidth = FINAL_REVIEW_MARGIN * 2 + FINAL_REVIEW_COLUMNS * FINAL_REVIEW_TILE_WIDTH + (FINAL_REVIEW_COLUMNS - 1) * FINAL_REVIEW_GUTTER;
  const canvasHeight = FINAL_REVIEW_MARGIN * 2 + rows * cellHeight + (rows - 1) * FINAL_REVIEW_GUTTER;
  const composites = [];
  const indexAssets = [];
  for (const [position, asset] of assets.entries()) {
    const source = await readFile(resolveRepoPath(root, asset.output_path));
    assert(sha256(source) === asset.checksum_sha256, `${asset.asset_key} source bytes drifted before contact-sheet review`);
    const image = await sharp(source)
      .resize(FINAL_REVIEW_TILE_WIDTH, FINAL_REVIEW_ARTWORK_HEIGHT, {
        fit: "contain",
        background: { r: 245, g: 245, b: 245, alpha: 1 },
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();
    const column = position % FINAL_REVIEW_COLUMNS;
    const row = Math.floor(position / FINAL_REVIEW_COLUMNS);
    const left = FINAL_REVIEW_MARGIN + column * (FINAL_REVIEW_TILE_WIDTH + FINAL_REVIEW_GUTTER);
    const top = FINAL_REVIEW_MARGIN + row * (cellHeight + FINAL_REVIEW_GUTTER);
    composites.push({ input: image, left, top });
    composites.push({ input: finalReviewLabelSvg(asset.asset_key), left, top: top + FINAL_REVIEW_ARTWORK_HEIGHT });
    indexAssets.push({
      position: position + 1,
      asset_key: asset.asset_key,
      output_path: asset.output_path,
      ledger_checksum_sha256: asset.checksum_sha256,
      rendered_input_sha256: sha256(source),
      approval_status: MISSING,
    });
  }
  const contents = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 229, g: 231, b: 235 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return {
    contents,
    index: {
      schema_version: "bmh-current-artwork-contact-sheet/v1",
      ledger_path: DEFAULT_PATHS.ledger,
      asset_count: indexAssets.length,
      columns: FINAL_REVIEW_COLUMNS,
      contact_sheet_path: null,
      contact_sheet_sha256: sha256(contents),
      assets: indexAssets,
    },
  };
}

async function validateContactSheetIndex({ root, ledger, contactSheetPath, contactSheetIndexPath }) {
  const [contactSheet, indexRecord, rebuilt] = await Promise.all([
    fileRecord(root, contactSheetPath),
    fileRecord(root, contactSheetIndexPath),
    buildDeterministicFinalContactSheet({ root, ledger }),
  ]);
  const index = await parseStructuredJson(indexRecord, "Final artwork contact-sheet index");
  assertExactKeys(index, ["schema_version", "ledger_path", "asset_count", "columns", "contact_sheet_path", "contact_sheet_sha256", "assets"], "Final artwork contact-sheet index");
  assert(index?.schema_version === "bmh-current-artwork-contact-sheet/v1", "Final artwork contact-sheet index schema is invalid");
  assert(index.contact_sheet_path === contactSheetPath, "Final artwork contact-sheet path drifted");
  assert(index.contact_sheet_sha256 === contactSheet.checksum_sha256, "Final artwork contact-sheet checksum drifted");
  assert(index.ledger_path === DEFAULT_PATHS.ledger, "Final artwork contact-sheet ledger path drifted");
  assert(index.columns === FINAL_REVIEW_COLUMNS, "Final artwork contact-sheet must use exactly four columns");
  assert(index.asset_count === 49 && Array.isArray(index.assets) && index.assets.length === 49, "Final artwork contact-sheet index must bind 49 assets");
  for (const [position, item] of index.assets.entries()) {
    assertExactKeys(item, ["position", "asset_key", "output_path", "ledger_checksum_sha256", "rendered_input_sha256", "approval_status"], `Final artwork contact-sheet index asset ${position + 1}`);
    assert(item.position === position + 1, `Final artwork contact-sheet position ${position + 1} drifted`);
  }
  assert(
    JSON.stringify(index.assets) === JSON.stringify(rebuilt.index.assets),
    "Final artwork contact-sheet 49-position asset mapping is not the deterministic ledger mapping",
  );
  assert(
    index.contact_sheet_sha256 === rebuilt.index.contact_sheet_sha256,
    "Final artwork contact-sheet deterministic rebuild checksum differs from the tracked index",
  );
  assert(contactSheet.contents.equals(rebuilt.contents), "Final artwork contact-sheet bytes are not the deterministic rebuild");
  const [actualPixels, expectedPixels] = await Promise.all([
    sharp(contactSheet.contents).removeAlpha().raw().toBuffer(),
    sharp(rebuilt.contents).removeAlpha().raw().toBuffer(),
  ]);
  assert(actualPixels.equals(expectedPixels), "Final artwork contact-sheet pixels are not the deterministic rebuild");
  return { contactSheet, indexRecord };
}

async function validateMasterReviewBinding({
  root,
  masterReviewIndexPath = DEFAULT_PATHS.masterReviewIndex,
  masterReviewSheetPaths = DEFAULT_PATHS.masterReviewSheets,
}) {
  const rebuilt = await validateMasterReviewSurface({
    root,
    indexPath: masterReviewIndexPath,
    sheetPaths: masterReviewSheetPaths,
  });
  assert(rebuilt.index.counts.masters === 28, "Final artwork master review must show exactly 28 masters");
  assert(rebuilt.sheets.length === 4, "Final artwork master review must use exactly four sheets");
  assert(rebuilt.sheets.every((sheet) => sheet.positions.length === 7), "Final artwork master review must show exactly seven masters per sheet");
  const indexRecord = await fileRecord(root, masterReviewIndexPath);
  const sheets = await Promise.all(rebuilt.sheets.map(async (sheet, position) => {
    const record = await fileRecord(root, sheet.path);
    assert(record.checksum_sha256 === sheet.sha256, `Final artwork master review sheet ${position + 1} checksum drifted`);
    return {
      sheet_number: position + 1,
      path: sheet.path,
      sha256: record.checksum_sha256,
      master_count: sheet.positions.length,
      first_position: sheet.positions[0],
      last_position: sheet.positions.at(-1),
    };
  }));
  const surfaceSha256 = sha256(JSON.stringify({
    index_path: masterReviewIndexPath,
    index_sha256: indexRecord.checksum_sha256,
    sheets,
  }));
  return {
    schema_version: "bmh-artwork-master-review-surface/v1",
    index_path: masterReviewIndexPath,
    index_sha256: indexRecord.checksum_sha256,
    surface_sha256: surfaceSha256,
    master_count: 28,
    sheet_count: 4,
    masters_per_sheet: 7,
    sheets,
  };
}

export async function buildFinalReviewRequest({
  root,
  ledger,
  contactSheetPath = DEFAULT_PATHS.contactSheet,
  contactSheetIndexPath = DEFAULT_PATHS.contactSheetIndex,
  masterReviewIndexPath = DEFAULT_PATHS.masterReviewIndex,
  masterReviewSheetPaths = DEFAULT_PATHS.masterReviewSheets,
}) {
  assertFinalReviewLedgerReady(ledger);
  assert(ledger.status === "production", "Final artwork review request requires the production ledger state");
  assert(ledger.masters.every((master) => master.review.status === "pending"), "Final artwork review request must be prepared before any master review is recorded");
  const [{ contactSheet: contactSheetRecord, indexRecord }, masterReviewSurface, inventoryRecord, ledgerRecord] = await Promise.all([
    validateContactSheetIndex({ root, ledger, contactSheetPath, contactSheetIndexPath }),
    validateMasterReviewBinding({ root, masterReviewIndexPath, masterReviewSheetPaths }),
    fileRecord(root, DEFAULT_PATHS.inventory),
    fileRecord(root, DEFAULT_PATHS.ledger),
  ]);
  const bindings = finalReviewBindings(ledger);
  const contactSheet = {
    path: contactSheetPath,
    sha256: contactSheetRecord.checksum_sha256,
    index_path: contactSheetIndexPath,
    index_sha256: indexRecord.checksum_sha256,
  };
  const inventorySnapshot = {
    path: DEFAULT_PATHS.inventory,
    sha256: inventoryRecord.checksum_sha256,
  };
  const ledgerSnapshot = {
    path: DEFAULT_PATHS.ledger,
    sha256: ledgerRecord.checksum_sha256,
  };
  const bindingsSha256 = sha256(JSON.stringify({
    schema_version: "bmh-artwork-final-review-request/v2",
    status: "pending-human-review",
    review_instruction: FINAL_ARTWORK_REVIEW_INSTRUCTION,
    master_review_surface: masterReviewSurface,
    contact_sheet: contactSheet,
    inventory_snapshot: inventorySnapshot,
    ledger_snapshot: ledgerSnapshot,
    masters: bindings.masters,
    assets: bindings.assets,
  }));
  return {
    schema_version: "bmh-artwork-final-review-request/v2",
    status: "pending-human-review",
    request_id: `bmh-artwork-final-review-${bindingsSha256}`,
    review_instruction: FINAL_ARTWORK_REVIEW_INSTRUCTION,
    master_review_surface: masterReviewSurface,
    contact_sheet: contactSheet,
    inventory_snapshot: inventorySnapshot,
    ledger_snapshot: ledgerSnapshot,
    bindings_sha256: bindingsSha256,
    masters: bindings.masters,
    assets: bindings.assets,
  };
}

export async function validateFinalReviewRequest({ root, ledger, request, requireLedgerSnapshot = false }) {
  assertFinalReviewLedgerReady(ledger);
  assertExactKeys(request, [
    "schema_version", "status", "request_id", "review_instruction", "master_review_surface", "contact_sheet",
    "inventory_snapshot", "ledger_snapshot", "bindings_sha256", "masters", "assets",
  ], "Final artwork review request");
  assert(request.schema_version === "bmh-artwork-final-review-request/v2", "Final artwork review request schema is invalid");
  assert(request.status === "pending-human-review", "Final artwork review request must remain pending");
  assertString(request.request_id, "final artwork review request_id");
  assert(/^bmh-artwork-final-review-[a-f0-9]{64}$/.test(request.request_id), "Final artwork review request_id is invalid");
  assert(request.review_instruction === FINAL_ARTWORK_REVIEW_INSTRUCTION, "Final artwork review instruction drifted");
  assertExactKeys(request.master_review_surface, [
    "schema_version", "index_path", "index_sha256", "surface_sha256", "master_count",
    "sheet_count", "masters_per_sheet", "sheets",
  ], "Final artwork master review surface binding");
  assert(request.master_review_surface.schema_version === "bmh-artwork-master-review-surface/v1", "Final artwork master review surface schema is invalid");
  assert(request.master_review_surface.master_count === 28, "Final artwork master review surface must bind 28 masters");
  assert(request.master_review_surface.sheet_count === 4, "Final artwork master review surface must bind four sheets");
  assert(request.master_review_surface.masters_per_sheet === 7, "Final artwork master review surface must bind seven masters per sheet");
  assert(Array.isArray(request.master_review_surface.sheets) && request.master_review_surface.sheets.length === 4, "Final artwork master review sheet bindings are incomplete");
  for (const [position, sheet] of request.master_review_surface.sheets.entries()) {
    assertExactKeys(sheet, ["sheet_number", "path", "sha256", "master_count", "first_position", "last_position"], `Final artwork master review sheet ${position + 1}`);
    assert(sheet.sheet_number === position + 1, `Final artwork master review sheet ${position + 1} number drifted`);
    assertString(sheet.path, `Final artwork master review sheet ${position + 1} path`);
    assert(SHA256.test(sheet.sha256), `Final artwork master review sheet ${position + 1} checksum is invalid`);
    assert(sheet.master_count === 7, `Final artwork master review sheet ${position + 1} must bind seven masters`);
    assert(sheet.first_position === position * 7 + 1 && sheet.last_position === position * 7 + 7, `Final artwork master review sheet ${position + 1} position range drifted`);
  }
  assertExactKeys(request.contact_sheet, ["path", "sha256", "index_path", "index_sha256"], "Final artwork contact-sheet binding");
  assertExactKeys(request.inventory_snapshot, ["path", "sha256"], "Final artwork inventory snapshot");
  assertExactKeys(request.ledger_snapshot, ["path", "sha256"], "Final artwork ledger snapshot");
  assert(request.inventory_snapshot.path === DEFAULT_PATHS.inventory, "Final artwork inventory path drifted");
  assert(request.ledger_snapshot.path === DEFAULT_PATHS.ledger, "Final artwork ledger path drifted");
  for (const [label, value] of [
    ["contact-sheet", request.contact_sheet.sha256],
    ["contact-sheet index", request.contact_sheet.index_sha256],
    ["master review index", request.master_review_surface.index_sha256],
    ["master review surface", request.master_review_surface.surface_sha256],
    ["inventory snapshot", request.inventory_snapshot.sha256],
    ["ledger snapshot", request.ledger_snapshot.sha256],
    ["binding", request.bindings_sha256],
  ]) assert(SHA256.test(value), `Final artwork ${label} checksum is invalid`);
  const [{ contactSheet, indexRecord }, masterReviewSurface, inventoryRecord] = await Promise.all([
    validateContactSheetIndex({
      root,
      ledger,
      contactSheetPath: request.contact_sheet.path,
      contactSheetIndexPath: request.contact_sheet.index_path,
    }),
    validateMasterReviewBinding({
      root,
      masterReviewIndexPath: request.master_review_surface.index_path,
      masterReviewSheetPaths: request.master_review_surface.sheets.map((sheet) => sheet.path),
    }),
    fileRecord(root, DEFAULT_PATHS.inventory),
  ]);
  assert(contactSheet.checksum_sha256 === request.contact_sheet.sha256, "Final artwork contact-sheet request binding drifted");
  assert(indexRecord.checksum_sha256 === request.contact_sheet.index_sha256, "Final artwork contact-sheet index request binding drifted");
  assert(JSON.stringify(masterReviewSurface) === JSON.stringify(request.master_review_surface), "Final artwork master review surface request binding drifted");
  assert(inventoryRecord.checksum_sha256 === request.inventory_snapshot.sha256, "Final artwork inventory snapshot drifted");
  const bindings = finalReviewBindings(ledger);
  assert(JSON.stringify(request.masters) === JSON.stringify(bindings.masters), "Final artwork master bindings drifted");
  assert(JSON.stringify(request.assets) === JSON.stringify(bindings.assets), "Final artwork asset bindings drifted");
  const bindingsSha256 = sha256(JSON.stringify({
    schema_version: request.schema_version,
    status: request.status,
    review_instruction: request.review_instruction,
    master_review_surface: request.master_review_surface,
    contact_sheet: request.contact_sheet,
    inventory_snapshot: request.inventory_snapshot,
    ledger_snapshot: request.ledger_snapshot,
    masters: bindings.masters,
    assets: bindings.assets,
  }));
  assert(request.bindings_sha256 === bindingsSha256, "Final artwork binding checksum drifted");
  assert(request.request_id === `bmh-artwork-final-review-${bindingsSha256}`, "Final artwork request_id no longer matches its full bindings");
  if (requireLedgerSnapshot || ledger.masters.every((master) => master.review.status === "pending")) {
    const ledgerRecord = await fileRecord(root, DEFAULT_PATHS.ledger);
    assert(ledgerRecord.checksum_sha256 === request.ledger_snapshot.sha256, "Final artwork ledger snapshot drifted before review began");
  }
  return request;
}

export async function validateFinalApprovalArtifact({ root, ledger, evidence, approvedBy, approvedAt }) {
  assert(approvedBy === "Jarrad Henry", "Final approval requires approver Jarrad Henry");
  assertIso(approvedAt, "final approval timestamp");
  const approvalRecord = await fileRecord(root, evidence);
  const artifact = await parseStructuredJson(approvalRecord, "Final artwork approval evidence");
  assertExactKeys(artifact, ["schema_version", "decision", "approver", "approved_at", "request_binding", "response_binding"], "Final artwork approval artifact");
  assert(artifact.schema_version === "bmh-artwork-final-approval/v2", "Final artwork approval schema is invalid");
  assert(artifact.decision === APPROVED, "Final artwork approval decision must be approved");
  assert(artifact.approver === "Jarrad Henry" && artifact.approver === approvedBy, "Final artwork approval approver is invalid");
  assert(artifact.approved_at === approvedAt, "Final artwork approval timestamp does not match the controller request");
  assertIso(artifact.approved_at, "final artwork approval approved_at");
  assertExactKeys(artifact.request_binding, ["request_id", "request_path", "request_sha256", "bindings_sha256"], "Final artwork approval request binding");
  assertExactKeys(artifact.response_binding, ["response_path", "response_sha256"], "Final artwork approval response binding");
  for (const [label, value] of [
    ["request", artifact.request_binding.request_sha256],
    ["bindings", artifact.request_binding.bindings_sha256],
    ["response", artifact.response_binding.response_sha256],
  ]) assert(SHA256.test(value), `Final artwork approval ${label} checksum is invalid`);
  assertString(artifact.request_binding.request_path, "final artwork approval request path");
  assertString(artifact.response_binding.response_path, "final artwork approval response path");
  assert(evidence !== artifact.request_binding.request_path && evidence !== artifact.response_binding.response_path, "Final artwork approval, request, and response artifacts must be distinct");
  assert(artifact.request_binding.request_path !== artifact.response_binding.response_path, "Final artwork request and response artifacts must be distinct");
  const [requestRecord, responseRecord] = await Promise.all([
    fileRecord(root, artifact.request_binding.request_path),
    fileRecord(root, artifact.response_binding.response_path),
  ]);
  assert(requestRecord.checksum_sha256 === artifact.request_binding.request_sha256, "Final artwork approval request file drifted");
  assert(responseRecord.checksum_sha256 === artifact.response_binding.response_sha256, "Final artwork preserved user response drifted");
  const request = await parseStructuredJson(requestRecord, "Final artwork review request");
  await validateFinalReviewRequest({ root, ledger, request });
  assert(artifact.request_binding.request_id === request.request_id, "Final artwork approval request_id drifted");
  assert(artifact.request_binding.bindings_sha256 === request.bindings_sha256, "Final artwork approval binding checksum drifted");
  const response = await parseStructuredJson(responseRecord, "Final artwork preserved user response");
  const contextualApproval = response.schema_version === "bmh-artwork-final-review-response/v3";
  assertExactKeys(
    response,
    contextualApproval
      ? ["schema_version", "decision", "respondent", "responded_at", "request_binding", "scope", "response_text", "response_context"]
      : ["schema_version", "decision", "respondent", "responded_at", "request_binding", "scope", "response_text"],
    "Final artwork preserved user response",
  );
  assert(
    response.schema_version === "bmh-artwork-final-review-response/v2" || contextualApproval,
    "Final artwork preserved user response schema is invalid",
  );
  assert(response.decision === APPROVED, "Final artwork preserved user response must be affirmative");
  assert(response.respondent === "Jarrad Henry", "Final artwork preserved user response respondent is invalid");
  assert(response.responded_at === artifact.approved_at, "Final artwork preserved user response timestamp drifted");
  assertIso(response.responded_at, "final artwork user response responded_at");
  assertExactKeys(response.request_binding, ["request_id", "request_path", "request_sha256", "bindings_sha256"], "Final artwork user response request binding");
  assert(JSON.stringify(response.request_binding) === JSON.stringify(artifact.request_binding), "Final artwork preserved user response targets a different request");
  assertExactKeys(
    response.scope,
    contextualApproval
      ? ["master_count", "master_review_sheet_count", "masters_per_sheet", "master_review_surface_sha256", "derived_asset_count", "derivative_promotion_policy"]
      : ["master_count", "master_review_sheet_count", "masters_per_sheet", "master_review_surface_sha256", "asset_count", "manifest_promotion"],
    "Final artwork preserved user response scope",
  );
  const exactMasterScope =
    response.scope.master_count === 28 &&
    response.scope.master_review_sheet_count === 4 &&
    response.scope.masters_per_sheet === 7 &&
    response.scope.master_review_surface_sha256 === request.master_review_surface.surface_sha256;
  assert(
    exactMasterScope &&
      (contextualApproval
        ? response.scope.derived_asset_count === 49 &&
          response.scope.derivative_promotion_policy === "deterministic-bound-outputs-of-approved-masters"
        : response.scope.asset_count === 49 && response.scope.manifest_promotion === true),
    "Final artwork preserved user response scope is incomplete",
  );
  if (contextualApproval) {
    assertExactKeys(response.response_context, ["controller_prompt", "normalized_scope_statement"], "Final artwork contextual approval evidence");
    assert(response.response_text === "approved", "Final artwork contextual approval must preserve the exact short affirmative response");
    assert(
      response.response_context.controller_prompt === FINAL_ARTWORK_CONTEXTUAL_APPROVAL_PROMPT,
      "Final artwork contextual approval prompt is invalid",
    );
    assert(
      response.response_context.normalized_scope_statement === FINAL_ARTWORK_CONTEXTUAL_SCOPE_STATEMENT,
      "Final artwork contextual approval scope normalization is invalid",
    );
  } else {
    assert(response.response_text === FINAL_ARTWORK_APPROVAL_RESPONSE, "Final artwork preserved user response must use the exact scoped affirmative statement");
  }
  return { evidenceRecord: approvalRecord, artifact, request, response };
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

export function solidifyEdgeConnectedBackground(flat, background) {
  const { data, width, height } = flat;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const thresholdSquared = 70 ** 2;
  const isBackgroundFamily = (pixel) => {
    const offset = pixel * 3;
    const distance =
      (data[offset] - background[0]) ** 2 +
      (data[offset + 1] - background[1]) ** 2 +
      (data[offset + 2] - background[2]) ** 2;
    return distance <= thresholdSquared;
  };
  const enqueue = (pixel) => {
    if (visited[pixel] || !isBackgroundFamily(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let column = 0; column < width; column += 1) {
    enqueue(column);
    enqueue((height - 1) * width + column);
  }
  for (let row = 1; row < height - 1; row += 1) {
    enqueue(row * width);
    enqueue(row * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const offset = pixel * 3;
    data[offset] = background[0];
    data[offset + 1] = background[1];
    data[offset + 2] = background[2];
    const row = Math.floor(pixel / width);
    const column = pixel - row * width;
    if (column > 0) enqueue(pixel - 1);
    if (column + 1 < width) enqueue(pixel + 1);
    if (row > 0) enqueue(pixel - width);
    if (row + 1 < height) enqueue(pixel + width);
  }
  return flat;
}

function normalizeEnclosedFillTexture(flat, palette) {
  const { data, width, height } = flat;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const paletteIndex = new Map(palette.map((color, index) => [paletteKey(color), index]));
  const colorFamilies = [
    new Set([paletteIndex.get("254,255,198"), paletteIndex.get("255,255,255")].filter(Number.isInteger)),
    new Set([paletteIndex.get("255,211,1"), paletteIndex.get("255,174,1"), paletteIndex.get("255,110,0")].filter(Number.isInteger)),
  ];
  const blackIndex = paletteIndex.get("0,0,0");
  const indexAt = (pixel) => paletteIndex.get(`${data[pixel * 3]},${data[pixel * 3 + 1]},${data[pixel * 3 + 2]}`);

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start]) continue;
    const startColor = indexAt(start);
    const family = colorFamilies.find((candidate) => candidate.has(startColor));
    if (!family || startColor === blackIndex) {
      visited[start] = 1;
      continue;
    }
    let head = 0;
    let tail = 0;
    let touchesEdge = false;
    const counts = new Map();
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++];
      const row = Math.floor(pixel / width);
      const column = pixel - row * width;
      if (row === 0 || column === 0 || row === height - 1 || column === width - 1) touchesEdge = true;
      const color = indexAt(pixel);
      counts.set(color, (counts.get(color) ?? 0) + 1);
      const enqueue = (neighbor) => {
        if (visited[neighbor] || !family.has(indexAt(neighbor))) return;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      };
      if (column > 0) enqueue(pixel - 1);
      if (column + 1 < width) enqueue(pixel + 1);
      if (row > 0) enqueue(pixel - width);
      if (row + 1 < height) enqueue(pixel + width);
    }
    if (touchesEdge || tail < 9 || counts.size < 2) continue;
    const [dominant, dominantCount] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (dominantCount / tail < 0.55) continue;
    const replacement = palette[dominant];
    for (let index = 0; index < tail; index += 1) {
      const offset = queue[index] * 3;
      data[offset] = replacement[0];
      data[offset + 1] = replacement[1];
      data[offset + 2] = replacement[2];
    }
  }
  return flat;
}

function seededFlatFillComponent(flat, cleanup) {
  const { data, width, height } = flat;
  const colorAt = (pixel) => `${data[pixel * 3]},${data[pixel * 3 + 1]},${data[pixel * 3 + 2]}`;
  const [seedX, seedY] = cleanup.seed_xy;
  assert(seedX < width && seedY < height, `${cleanup.id} flat-fill cleanup seed is outside the image`);
  const accepted = new Set(cleanup.accepted_rgb.map(paletteKey));
  const start = seedY * width + seedX;
  assert(accepted.has(colorAt(start)), `${cleanup.id} flat-fill cleanup seed color drifted`);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  visited[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const pixel = queue[head++];
    const row = Math.floor(pixel / width);
    const column = pixel - row * width;
    minX = Math.min(minX, column);
    maxX = Math.max(maxX, column);
    minY = Math.min(minY, row);
    maxY = Math.max(maxY, row);
    const enqueue = (neighbor) => {
      if (visited[neighbor] || !accepted.has(colorAt(neighbor))) return;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    };
    if (column > 0) enqueue(pixel - 1);
    if (column + 1 < width) enqueue(pixel + 1);
    if (row > 0) enqueue(pixel - width);
    if (row + 1 < height) enqueue(pixel + width);
  }
  assert(tail === cleanup.expected_pixel_count, `${cleanup.id} flat-fill cleanup pixel count drifted`);
  assert(
    JSON.stringify([minX, minY, maxX, maxY]) === JSON.stringify(cleanup.expected_bounds),
    `${cleanup.id} flat-fill cleanup bounds drifted`,
  );
  return { visited, pixels: queue.subarray(0, tail) };
}

export function normalizeSeededFlatFillCleanup(flat, cleanups = []) {
  const { data } = flat;
  for (const cleanup of cleanups) {
    const component = seededFlatFillComponent(flat, cleanup);
    const replacement = cleanup.replacement_rgb;
    for (const pixel of component.pixels) {
      const offset = pixel * 3;
      data[offset] = replacement[0];
      data[offset + 1] = replacement[1];
      data[offset + 2] = replacement[2];
    }
  }
  return flat;
}

export async function encodeFlatPng(input, palette, background = BLUE, cleanups = []) {
  const flat = normalizeSeededFlatFillCleanup(normalizeEnclosedFillTexture(solidifyEdgeConnectedBackground(
    await quantizeBuffer(input, palette, background),
    background,
  ), palette), cleanups);
  return sharp(flat.data, {
    raw: { width: flat.width, height: flat.height, channels: 3 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

export async function assertFlatFillCleanupDelta(before, after, cleanups) {
  const [previous, next] = await Promise.all([
    sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(after).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert(
    previous.info.width === next.info.width && previous.info.height === next.info.height,
    "Flat-fill cleanup cannot change image dimensions",
  );
  const components = cleanups.map((cleanup) => ({
    cleanup,
    visited: seededFlatFillComponent({
      data: previous.data,
      width: previous.info.width,
      height: previous.info.height,
    }, cleanup).visited,
  }));
  const changedByCleanup = new Map(cleanups.map((cleanup) => [cleanup.id, 0]));
  for (let pixel = 0; pixel < previous.info.width * previous.info.height; pixel += 1) {
    const offset = pixel * 3;
    const prior = [previous.data[offset], previous.data[offset + 1], previous.data[offset + 2]];
    const current = [next.data[offset], next.data[offset + 1], next.data[offset + 2]];
    if (paletteKey(prior) === paletteKey(current)) continue;
    const row = Math.floor(pixel / previous.info.width);
    const column = pixel - row * previous.info.width;
    assert(
      paletteKey(prior) !== "0,0,0" && paletteKey(current) !== "0,0,0",
      `Flat-fill cleanup changed a black outline at ${column},${row}`,
    );
    const owners = components.filter((component) => component.visited[pixel]).map((component) => component.cleanup);
    assert(owners.length === 1, `Flat-fill cleanup changed an out-of-mask or overlapping pixel at ${column},${row}`);
    const owner = owners[0];
    assert(paletteKey(current) === paletteKey(owner.replacement_rgb), `${owner.id} flat-fill cleanup introduced an unexpected color at ${column},${row}`);
    changedByCleanup.set(owner.id, changedByCleanup.get(owner.id) + 1);
  }
  for (const cleanup of cleanups) {
    assert(
      changedByCleanup.get(cleanup.id) === cleanup.expected_changed_pixel_count,
      `${cleanup.id} flat-fill cleanup changed-pixel count drifted`,
    );
  }
}

export async function assertDecodedArtworkPixelsEqual(left, right, label) {
  const [first, second] = await Promise.all([
    sharp(left).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(right).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert(
    first.info.width === second.info.width && first.info.height === second.info.height && first.data.equals(second.data),
    `${label} decoded pixels drifted`,
  );
}

export async function assertPosterSafeEdges(contents, background, label = "video poster", borderWidth = 4) {
  const { data, info } = await sharp(contents).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert(info.width > borderWidth * 2 && info.height > borderWidth * 2, `${label} is too small for edge inspection`);
  const expected = background.join(",");
  for (let row = 0; row < info.height; row += 1) {
    for (let column = 0; column < info.width; column += 1) {
      if (row >= borderWidth && row < info.height - borderWidth && column >= borderWidth && column < info.width - borderWidth) continue;
      const offset = (row * info.width + column) * 3;
      const actual = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
      assert(actual === expected, `${label} has non-background pixels in its ${borderWidth}px safe edge at ${column},${row}: ${actual}`);
    }
  }
  return true;
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
  const quantized = normalizeEnclosedFillTexture(solidifyEdgeConnectedBackground(
    await quantizeBuffer(intermediate, palette, normalizeBackground),
    normalizeBackground,
  ), palette);
  return sharp(quantized.data, {
    raw: { width: quantized.width, height: quantized.height, channels: 3 },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

export async function preparePipelineReprocess({ root, ledger, masterId }) {
  const master = findMaster(ledger, masterId);
  assert(!master.pilot, `${masterId} approved pilot bytes must not be rewritten by pipeline reprocess`);
  assert(master.status === "derived", `${masterId} must be derived before pipeline reprocess`);
  assert(SHA256.test(master.flat_master_sha256), `${masterId} has no recorded flat master to reprocess`);
  const sequence = master.lineage.length;
  const flat = await fileRecord(root, master.flat_master_path);
  assert(flat.checksum_sha256 === master.flat_master_sha256, `${masterId} flat master drifted before pipeline reprocess`);
  const flatVersion = master.flat_history.length + 1;
  const flatArchive = path.posix.join(path.posix.dirname(master.source_path), "lineage", master.id, "flat-masters", `pipeline-version-${String(flatVersion).padStart(3, "0")}-${path.posix.basename(master.flat_master_path)}`);
  if (!(await assertAbsentOrExact(root, flatArchive, flat.contents, `${masterId} pipeline historical flat master`))) {
    await writeBufferAtomic(resolveRepoPath(root, flatArchive), flat.contents, root);
  }
  master.flat_history.push({
    version: flatVersion,
    checksum_sha256: master.flat_master_sha256,
    archived_path: flatArchive,
    lineage_sequence: sequence,
  });
  master.flat_replacement_authorized_checksum = master.flat_master_sha256;
  master.flat_master_sha256 = null;

  for (const outputRef of master.outputs) {
    const output = findOutput(ledger, outputRef.asset_key);
    const actual = await inspectArtworkFile(root, output, ledger.palette_rgb);
    assert(actual.checksum_sha256 === output.checksum_sha256, `${output.asset_key} drifted before pipeline reprocess`);
    const version = output.history.length + 1;
    const archive = path.posix.join(path.posix.dirname(master.source_path), "lineage", master.id, "derivatives", `pipeline-version-${String(version).padStart(3, "0")}-${path.posix.basename(output.manifest_path)}`);
    if (!(await assertAbsentOrExact(root, archive, actual.contents, `${output.asset_key} pipeline historical derivative`))) {
      await writeBufferAtomic(resolveRepoPath(root, archive), actual.contents, root);
    }
    output.history.push({
      version,
      checksum_sha256: output.checksum_sha256,
      pixel_sha256: output.pixel_sha256,
      archived_path: archive,
      recipe_sha256: output.derivative.recipe_sha256,
      lineage_sequence: output.provenance.lineage_steps,
    });
    output.replacement_authorized_checksum = output.checksum_sha256;
    output.checksum_sha256 = null;
    output.pixel_sha256 = null;
    output.size_bytes = null;
    output.approval_status = MISSING;
    clearOutputReviewProvenance(output);
  }
  master.status = "source-ready";
  master.review = baseReview();
  ledger.updated_at = new Date().toISOString();
  return ledger;
}

async function inspectArtworkBuffer(asset, palette, contents) {
  const metadata = await sharp(contents).metadata();
  assert(metadata.width === asset.dimensions[0] && metadata.height === asset.dimensions[1], `${asset.asset_key} dimensions are ${metadata.width}x${metadata.height}; expected ${asset.dimensions.join("x")}`);
  assert(metadata.format === "webp", `${asset.asset_key} must be WebP`);
  assert(!metadata.hasAlpha, `${asset.asset_key} must not contain alpha`);
  assert((metadata.pages ?? 1) === 1, `${asset.asset_key} must not be animated`);
  const riff = contents.toString("ascii");
  assert(!riff.includes("ANIM"), `${asset.asset_key} must be a non-animated WebP`);
  const { data, info } = await sharp(contents).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (asset.redesign_replacement !== undefined) {
    assert(
      asset.redesign_replacement.schema_version === "bmh-thumbnail-redesign-replacement/v1",
      `${asset.asset_key} thumbnail redesign replacement schema is invalid`,
    );
    assert(
      sha256(data) === asset.redesign_replacement.output_pixel_sha256,
      `${asset.asset_key} thumbnail redesign decoded pixels drifted`,
    );
    return { pixel_sha256: sha256(data) };
  }
  if (asset.poster_redesign_replacement !== undefined) {
    assert(
      asset.poster_redesign_replacement.schema_version === "bmh-video-poster-redesign-replacement/v1",
      `${asset.asset_key} video poster redesign replacement schema is invalid`,
    );
    assert(
      sha256(data) === asset.poster_redesign_replacement.output_pixel_sha256,
      `${asset.asset_key} video poster redesign decoded pixels drifted`,
    );
    return { pixel_sha256: sha256(data) };
  }
  assert(riff.includes("VP8L"), `${asset.asset_key} must be lossless WebP`);
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
        assert(data[offset] === padding[0] && data[offset + 1] === padding[1] && data[offset + 2] === padding[2], `${asset.asset_key} does not preserve exact recipe padding`);
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

async function validateThumbnailRedesignApproval({ root, ledger, inspectFiles, allowLegacyRedesignProvenance = false }) {
  const approval = ledger.thumbnail_redesign_approval;
  const replacements = ledger.assets.filter((asset) => asset.redesign_replacement !== undefined);
  if (approval === undefined) {
    assert(replacements.length === 0, "Thumbnail redesign replacements require a bound approval artifact");
    return;
  }

  assert(["production", "finalized"].includes(ledger.status), "Thumbnail redesign approval requires production or finalized artwork state");
  assert(approval.schema_version === "bmh-thumbnail-redesign-ledger-approval/v1", "Thumbnail redesign ledger approval schema is invalid");
  assert(approval.status === APPROVED, "Thumbnail redesign ledger approval must be approved");
  assert(approval.approved_by === "Jarrad Henry", "Thumbnail redesign approval requires Jarrad Henry");
  assertIso(approval.approved_at, "thumbnail redesign approved_at");
  assertString(approval.evidence, "thumbnail redesign approval evidence");
  assert(SHA256.test(approval.evidence_sha256), "Thumbnail redesign approval evidence checksum is invalid");
  assert(approval.assignment_policy === "assignments-remain-thumbnail-free", "Thumbnail redesign assignment policy drifted");
  assert(replacements.length === 19, "Thumbnail redesign must replace exactly 19 content thumbnails");

  const evidenceRecord = await fileRecord(root, approval.evidence);
  assert(evidenceRecord.checksum_sha256 === approval.evidence_sha256, "Thumbnail redesign approval evidence drifted");
  const artifact = await parseStructuredJson(evidenceRecord, "Thumbnail redesign approval artifact");
  assert(artifact.schema_version === "bmh-thumbnail-redesign-approval/v1", "Thumbnail redesign approval artifact schema is invalid");
  assert(artifact.decision === APPROVED, "Thumbnail redesign approval artifact is not affirmative");
  assert(artifact.approver === approval.approved_by, "Thumbnail redesign approval artifact approver drifted");
  assert(artifact.approved_at === approval.approved_at, "Thumbnail redesign approval artifact timestamp drifted");
  assert(artifact.response_text === "Okay you have my approval for the thumbnails Go ahead and get them iInto the application", "Thumbnail redesign preserved approval response drifted");
  assert(artifact.assignment_policy === approval.assignment_policy, "Thumbnail redesign approval assignment policy drifted");
  assert(Array.isArray(artifact.assets) && artifact.assets.length === 19, "Thumbnail redesign approval must bind 19 content thumbnails");
  assert(Array.isArray(artifact.review_surface?.files) && artifact.review_surface.files.length === 3, "Thumbnail redesign approval review surface is incomplete");

  for (const surface of artifact.review_surface.files) {
    assertString(surface.path, "thumbnail redesign review surface path");
    assert(SHA256.test(surface.sha256), "Thumbnail redesign review surface checksum is invalid");
    if (inspectFiles) {
      const record = await fileRecord(root, surface.path);
      assert(record.checksum_sha256 === surface.sha256, `Thumbnail redesign review surface drifted: ${surface.path}`);
    }
  }

  const artifactByKey = new Map(artifact.assets.map((asset) => [asset.asset_key, asset]));
  assert(artifactByKey.size === 19, "Thumbnail redesign approval asset keys must be unique");
  for (const output of replacements) {
    assert(output.kind === "lesson-card", `${output.asset_key} thumbnail redesign can only replace lesson cards`);
    const binding = artifactByKey.get(output.asset_key);
    assert(binding, `${output.asset_key} is not bound by the thumbnail redesign approval`);
    const replacement = output.redesign_replacement;
    assert(replacement.schema_version === "bmh-thumbnail-redesign-replacement/v1", `${output.asset_key} redesign replacement schema is invalid`);
    assert(replacement.source_path === binding.source_path, `${output.asset_key} redesign source path drifted`);
    assert(replacement.source_sha256 === binding.source_sha256, `${output.asset_key} redesign source checksum drifted`);
    assert(replacement.approval_evidence === approval.evidence, `${output.asset_key} redesign approval path drifted`);
    assert(replacement.approval_evidence_sha256 === approval.evidence_sha256, `${output.asset_key} redesign approval checksum drifted`);
    assert(replacement.approved_by === approval.approved_by && replacement.approved_at === approval.approved_at, `${output.asset_key} redesign reviewer binding drifted`);
    assert(replacement.output_checksum_sha256 === output.checksum_sha256, `${output.asset_key} redesign output checksum drifted`);
    assert(replacement.output_pixel_sha256 === output.pixel_sha256, `${output.asset_key} redesign output pixel checksum drifted`);
    assert(output.history.some((entry) => entry.checksum_sha256 === replacement.replaced_checksum_sha256), `${output.asset_key} redesign did not archive the replaced bytes`);
    const current = output.current_replacement_provenance;
    if (!current && !allowLegacyRedesignProvenance) {
      assert(false, `${output.asset_key} current redesign provenance is missing`);
    }
    if (current) {
      assert(current.schema_version === "bmh-thumbnail-redesign-current-provenance/v1", `${output.asset_key} current redesign provenance schema is invalid`);
      assert(current.source?.path === binding.source_path && current.source?.sha256 === binding.source_sha256, `${output.asset_key} current redesign source drifted`);
      assert(JSON.stringify(current.source?.dimensions) === JSON.stringify([1280, 800]) && current.source?.format === "png", `${output.asset_key} current redesign source format drifted`);
      assert(current.derivative?.recipe?.operation === "encode-approved-png-as-display-webp", `${output.asset_key} current redesign derivative operation drifted`);
      assert(current.derivative?.recipe?.source_path === binding.source_path && current.derivative?.recipe?.source_sha256 === binding.source_sha256, `${output.asset_key} current redesign derivative source drifted`);
      assert(current.derivative?.recipe?.quality === 90 && current.derivative?.recipe?.output_format === "webp", `${output.asset_key} current redesign display encoding drifted`);
      assert(current.derivative?.recipe_sha256 === sha256(JSON.stringify(current.derivative.recipe)), `${output.asset_key} current redesign recipe checksum drifted`);
      assert(current.review?.status === APPROVED && current.review?.reviewed_by === approval.approved_by && current.review?.reviewed_at === approval.approved_at, `${output.asset_key} current redesign review drifted`);
      assert(current.review?.evidence === approval.evidence && current.review?.evidence_sha256 === approval.evidence_sha256, `${output.asset_key} current redesign review evidence drifted`);
      assert(current.output?.checksum_sha256 === output.checksum_sha256 && current.output?.pixel_sha256 === output.pixel_sha256 && current.output?.size_bytes === output.size_bytes, `${output.asset_key} current redesign output provenance drifted`);
      assert(output.legacy_provenance?.schema_version === "bmh-thumbnail-redesign-legacy-provenance/v1", `${output.asset_key} legacy provenance is missing`);
    }
    if (inspectFiles) {
      const source = await fileRecord(root, replacement.source_path);
      assert(source.checksum_sha256 === replacement.source_sha256, `${output.asset_key} approved PNG source drifted`);
      const current = await fileRecord(root, output.manifest_path);
      const metadata = await sharp(current.contents).metadata();
      assert(metadata.format === "webp" && metadata.width === 1280 && metadata.height === 800 && !metadata.hasAlpha, `${output.asset_key} approved display derivative is invalid`);
    }
  }
  if (!allowLegacyRedesignProvenance || replacements.every((output) => output.current_replacement_provenance)) {
    const totalDisplayBytes = replacements.reduce((sum, output) => sum + output.size_bytes, 0);
    assert(totalDisplayBytes <= 1_500_000, `Thumbnail display payload exceeds 1.5 MB: ${totalDisplayBytes}`);
  }
}

async function validateVideoPosterRedesignApproval({ root, ledger, inspectFiles }) {
  const approval = ledger.video_poster_redesign_approval;
  const replacements = ledger.assets.filter((asset) => asset.poster_redesign_replacement !== undefined);
  if (approval === undefined) {
    assert(replacements.length === 0, "Video poster redesign replacements require a bound approval artifact");
    return;
  }

  assert(["production", "finalized"].includes(ledger.status), "Video poster redesign approval requires production or finalized artwork state");
  assert(approval.schema_version === "bmh-video-poster-redesign-ledger-approval/v1", "Video poster redesign ledger approval schema is invalid");
  assert(approval.status === APPROVED, "Video poster redesign ledger approval must be approved");
  assert(approval.approved_by === "Jarrad Henry", "Video poster redesign approval requires Jarrad Henry");
  assertIso(approval.approved_at, "video poster redesign approved_at");
  assertString(approval.evidence, "video poster redesign approval evidence");
  assert(SHA256.test(approval.evidence_sha256), "Video poster redesign approval evidence checksum is invalid");
  assertString(approval.source_approval_evidence, "video poster source approval evidence");
  assert(SHA256.test(approval.source_approval_evidence_sha256), "Video poster source approval checksum is invalid");
  assert(replacements.length === 29, "Video poster redesign must replace exactly 29 posters");

  const [evidenceRecord, sourceApprovalRecord] = await Promise.all([
    fileRecord(root, approval.evidence),
    fileRecord(root, approval.source_approval_evidence),
  ]);
  assert(evidenceRecord.checksum_sha256 === approval.evidence_sha256, "Video poster redesign approval evidence drifted");
  assert(sourceApprovalRecord.checksum_sha256 === approval.source_approval_evidence_sha256, "Video poster source approval evidence drifted");
  const artifact = await parseStructuredJson(evidenceRecord, "Video poster redesign approval artifact");
  assert(artifact.schema_version === "bmh-video-poster-redesign-approval/v1", "Video poster redesign approval artifact schema is invalid");
  assert(artifact.decision === APPROVED && artifact.approver === approval.approved_by, "Video poster redesign approval artifact is not affirmative");
  assert(artifact.approved_at === approval.approved_at, "Video poster redesign approval timestamp drifted");
  assert(artifact.response_text === "They should be swapped out", "Video poster redesign approval response drifted");
  assert(artifact.source_approval?.path === approval.source_approval_evidence, "Video poster source approval path drifted");
  assert(artifact.source_approval?.sha256 === approval.source_approval_evidence_sha256, "Video poster source approval binding drifted");
  assert(Array.isArray(artifact.assets) && artifact.assets.length === 29, "Video poster redesign approval must bind 29 posters");

  const artifactByKey = new Map(artifact.assets.map((asset) => [asset.poster_asset_key, asset]));
  assert(artifactByKey.size === 29, "Video poster redesign asset keys must be unique");
  for (const output of replacements) {
    assert(output.kind === "video-poster", `${output.asset_key} video poster redesign can only replace posters`);
    const binding = artifactByKey.get(output.asset_key);
    assert(binding, `${output.asset_key} is not bound by the video poster redesign approval`);
    const replacement = output.poster_redesign_replacement;
    assert(replacement.schema_version === "bmh-video-poster-redesign-replacement/v1", `${output.asset_key} video poster replacement schema is invalid`);
    assert(replacement.source_thumbnail_asset_key === binding.source_thumbnail_asset_key, `${output.asset_key} source thumbnail key drifted`);
    assert(replacement.source_path === binding.source_path && replacement.source_sha256 === binding.source_sha256, `${output.asset_key} source thumbnail drifted`);
    assert(JSON.stringify(replacement.crop) === JSON.stringify(binding.crop), `${output.asset_key} poster crop drifted`);
    assert(replacement.approval_evidence === approval.evidence && replacement.approval_evidence_sha256 === approval.evidence_sha256, `${output.asset_key} poster approval binding drifted`);
    assert(replacement.approved_by === approval.approved_by && replacement.approved_at === approval.approved_at, `${output.asset_key} poster reviewer binding drifted`);
    assert(replacement.output_checksum_sha256 === output.checksum_sha256 && replacement.output_pixel_sha256 === output.pixel_sha256, `${output.asset_key} poster output binding drifted`);
    assert(output.history.some((entry) => entry.checksum_sha256 === replacement.replaced_checksum_sha256), `${output.asset_key} did not archive the replaced poster`);
    assert(output.poster_legacy_provenance?.schema_version === "bmh-video-poster-redesign-legacy-provenance/v1", `${output.asset_key} legacy poster provenance is missing`);

    const current = output.current_poster_replacement_provenance;
    assert(current?.schema_version === "bmh-video-poster-redesign-current-provenance/v1", `${output.asset_key} current poster provenance is missing`);
    assert(current.source?.thumbnail_asset_key === binding.source_thumbnail_asset_key, `${output.asset_key} current source thumbnail key drifted`);
    assert(current.source?.path === binding.source_path && current.source?.sha256 === binding.source_sha256, `${output.asset_key} current poster source drifted`);
    assert(JSON.stringify(current.source?.dimensions) === JSON.stringify([1280, 800]) && current.source?.format === "png", `${output.asset_key} current poster source format drifted`);
    assert(current.derivative?.recipe?.operation === "crop-approved-thumbnail-png-as-video-poster-webp", `${output.asset_key} current poster derivative operation drifted`);
    assert(JSON.stringify(current.derivative?.recipe?.crop) === JSON.stringify(binding.crop), `${output.asset_key} current poster derivative crop drifted`);
    assert(current.derivative?.recipe?.quality === 90 && current.derivative?.recipe?.output_format === "webp", `${output.asset_key} current poster encoding drifted`);
    assert(current.derivative?.recipe_sha256 === sha256(JSON.stringify(current.derivative.recipe)), `${output.asset_key} current poster recipe checksum drifted`);
    assert(current.review?.status === APPROVED && current.review?.reviewed_by === approval.approved_by && current.review?.reviewed_at === approval.approved_at, `${output.asset_key} current poster review drifted`);
    assert(current.review?.evidence === approval.evidence && current.review?.evidence_sha256 === approval.evidence_sha256, `${output.asset_key} current poster review evidence drifted`);
    assert(current.output?.checksum_sha256 === output.checksum_sha256 && current.output?.pixel_sha256 === output.pixel_sha256 && current.output?.size_bytes === output.size_bytes, `${output.asset_key} current poster output provenance drifted`);
    if (inspectFiles) {
      const source = await fileRecord(root, replacement.source_path);
      assert(source.checksum_sha256 === replacement.source_sha256, `${output.asset_key} approved thumbnail source drifted`);
      const currentFile = await fileRecord(root, output.manifest_path);
      const metadata = await sharp(currentFile.contents).metadata();
      assert(metadata.format === "webp" && metadata.width === 1280 && metadata.height === 720 && !metadata.hasAlpha, `${output.asset_key} redesigned poster is invalid`);
    }
  }
}

async function validateHistoricalFinalApprovalArtifact({ root, ledger, evidence, approvedBy, approvedAt }) {
  assert(ledger.thumbnail_redesign_approval !== undefined, "Historical final approval validation is only valid after a bound thumbnail redesign");
  const approvalRecord = await fileRecord(root, evidence);
  const artifact = await parseStructuredJson(approvalRecord, "Historical final artwork approval evidence");
  assertExactKeys(artifact, ["schema_version", "decision", "approver", "approved_at", "request_binding", "response_binding"], "Historical final artwork approval artifact");
  assert(artifact.schema_version === "bmh-artwork-final-approval/v2", "Historical final artwork approval schema is invalid");
  assert(artifact.decision === APPROVED, "Historical final artwork approval is not affirmative");
  assert(artifact.approver === "Jarrad Henry" && artifact.approver === approvedBy, "Historical final artwork approver drifted");
  assert(artifact.approved_at === approvedAt, "Historical final artwork approval timestamp drifted");
  assertIso(artifact.approved_at, "historical final artwork approved_at");
  assertExactKeys(artifact.request_binding, ["request_id", "request_path", "request_sha256", "bindings_sha256"], "Historical final artwork request binding");
  assertExactKeys(artifact.response_binding, ["response_path", "response_sha256"], "Historical final artwork response binding");
  assert(/^bmh-artwork-final-review-[a-f0-9]{64}$/.test(artifact.request_binding.request_id), "Historical final artwork request_id is invalid");
  for (const checksum of [artifact.request_binding.request_sha256, artifact.request_binding.bindings_sha256, artifact.response_binding.response_sha256]) {
    assert(SHA256.test(checksum), "Historical final artwork binding checksum is invalid");
  }
  const [requestRecord, responseRecord] = await Promise.all([
    fileRecord(root, artifact.request_binding.request_path),
    fileRecord(root, artifact.response_binding.response_path),
  ]);
  assert(requestRecord.checksum_sha256 === artifact.request_binding.request_sha256, "Historical final artwork request drifted");
  assert(responseRecord.checksum_sha256 === artifact.response_binding.response_sha256, "Historical final artwork response drifted");
  const [request, response] = await Promise.all([
    parseStructuredJson(requestRecord, "Historical final artwork request"),
    parseStructuredJson(responseRecord, "Historical final artwork response"),
  ]);
  assertExactKeys(request, [
    "schema_version", "status", "request_id", "review_instruction", "master_review_surface", "contact_sheet",
    "inventory_snapshot", "ledger_snapshot", "bindings_sha256", "masters", "assets",
  ], "Historical final artwork review request");
  assert(request.schema_version === "bmh-artwork-final-review-request/v2" && request.status === "pending-human-review", "Historical final artwork request schema or status drifted");
  assert(request.review_instruction === FINAL_ARTWORK_REVIEW_INSTRUCTION, "Historical final artwork review instruction drifted");
  assert(Array.isArray(request.masters) && request.masters.length === 28, "Historical final artwork master bindings are incomplete");
  assert(Array.isArray(request.assets) && request.assets.length === 49, "Historical final artwork asset bindings are incomplete");
  assert(JSON.stringify(request.masters) === JSON.stringify(finalReviewMasterBindings(ledger)), "Historical final artwork master bindings drifted");
  const historicalAssets = ledger.assets.map((asset) => {
    if (asset.redesign_replacement === undefined && asset.poster_redesign_replacement === undefined) {
      return { asset_key: asset.asset_key, output_path: asset.output_path, checksum_sha256: asset.checksum_sha256, pixel_sha256: asset.pixel_sha256 };
    }
    const replacedChecksum = asset.redesign_replacement?.replaced_checksum_sha256 ?? asset.poster_redesign_replacement?.replaced_checksum_sha256;
    const historical = asset.history.find((entry) => entry.checksum_sha256 === replacedChecksum);
    assert(historical, `${asset.asset_key} historical approval bytes are missing`);
    return { asset_key: asset.asset_key, output_path: asset.output_path, checksum_sha256: historical.checksum_sha256, pixel_sha256: historical.pixel_sha256 };
  });
  assert(JSON.stringify(request.assets) === JSON.stringify(historicalAssets), "Historical final artwork asset bindings drifted");
  const bindingChecksum = sha256(JSON.stringify({
    schema_version: request.schema_version,
    status: request.status,
    review_instruction: request.review_instruction,
    master_review_surface: request.master_review_surface,
    contact_sheet: request.contact_sheet,
    inventory_snapshot: request.inventory_snapshot,
    ledger_snapshot: request.ledger_snapshot,
    masters: request.masters,
    assets: historicalAssets,
  }));
  assert(request.bindings_sha256 === bindingChecksum, "Historical final artwork binding checksum drifted");
  assert(request.request_id === `bmh-artwork-final-review-${bindingChecksum}`, "Historical final artwork request_id no longer matches its bindings");
  assert(request.request_id === artifact.request_binding.request_id, "Historical final artwork request_id drifted");
  assert(request.bindings_sha256 === artifact.request_binding.bindings_sha256, "Historical final artwork bindings drifted");
  const surfaceFiles = [
    [request.contact_sheet.path, request.contact_sheet.sha256],
    [request.contact_sheet.index_path, request.contact_sheet.index_sha256],
    [request.master_review_surface.index_path, request.master_review_surface.index_sha256],
    ...request.master_review_surface.sheets.map((sheet) => [sheet.path, sheet.sha256]),
  ];
  for (const [surfacePath, expectedChecksum] of surfaceFiles) {
    const record = await fileRecord(root, surfacePath);
    assert(record.checksum_sha256 === expectedChecksum, `Historical final artwork review surface drifted: ${surfacePath}`);
  }
  assertExactKeys(response, ["schema_version", "decision", "respondent", "responded_at", "request_binding", "scope", "response_text", "response_context"], "Historical final artwork response");
  assert(response.schema_version === "bmh-artwork-final-review-response/v3", "Historical final artwork response schema drifted");
  assert(response.decision === APPROVED && response.respondent === "Jarrad Henry", "Historical final artwork response is invalid");
  assert(response.responded_at === approvedAt, "Historical final artwork response timestamp drifted");
  assertIso(response.responded_at, "historical final artwork response timestamp");
  assert(JSON.stringify(response.request_binding) === JSON.stringify(artifact.request_binding), "Historical final artwork response targets a different request");
  assertExactKeys(response.scope, ["master_count", "master_review_sheet_count", "masters_per_sheet", "master_review_surface_sha256", "derived_asset_count", "derivative_promotion_policy"], "Historical final artwork response scope");
  assert(response.scope.master_count === 28 && response.scope.master_review_sheet_count === 4 && response.scope.masters_per_sheet === 7, "Historical final artwork response master scope drifted");
  assert(response.scope.master_review_surface_sha256 === request.master_review_surface.surface_sha256, "Historical final artwork response surface scope drifted");
  assert(response.scope.derived_asset_count === 49 && response.scope.derivative_promotion_policy === "deterministic-bound-outputs-of-approved-masters", "Historical final artwork response asset scope drifted");
  assertExactKeys(response.response_context, ["controller_prompt", "normalized_scope_statement"], "Historical final artwork response context");
  assert(response.response_text === "approved", "Historical final artwork response text drifted");
  assert(response.response_context.controller_prompt === FINAL_ARTWORK_CONTEXTUAL_APPROVAL_PROMPT, "Historical final artwork approval prompt drifted");
  assert(response.response_context.normalized_scope_statement === FINAL_ARTWORK_CONTEXTUAL_SCOPE_STATEMENT, "Historical final artwork approval scope normalization drifted");
  return { evidenceRecord: approvalRecord, artifact, request, response };
}

export async function recordApprovedTextureExceptions({ root, ledger, evidence }) {
  assert(ledger.status === "production", "Texture exceptions require active production state");
  const evidenceRecord = await fileRecord(root, evidence);
  const artifact = JSON.parse(evidenceRecord.contents.toString("utf8"));
  assert(artifact.schema_version === "bmh-artwork-approved-texture-exceptions/v1", "Texture exception artifact schema invalid");
  assert(artifact.scope === "checksum-specific-v8-pilot-bytes-only", "Texture exception scope must remain checksum-specific");
  assert(artifact.approval_inheritance === "forbidden", "Texture exception approval inheritance must be forbidden");
  assert(Array.isArray(artifact.assets) && artifact.assets.length === 4, "Texture exception artifact must bind exactly four V8 assets");
  const allowedMasters = new Set(["master-slot-07", "master-slot-09"]);
  for (const exception of artifact.assets) {
    assert(allowedMasters.has(exception.master_id), `${exception.asset_key} is outside the approved texture-exception masters`);
    const output = findOutput(ledger, exception.asset_key);
    assert(output.provenance.master_id === exception.master_id, `${exception.asset_key} texture-exception owner drifted`);
    if (output.redesign_replacement !== undefined || output.poster_redesign_replacement !== undefined) {
      assert(
        output.history.some((entry) => entry.checksum_sha256 === exception.checksum_sha256 && entry.pixel_sha256 === exception.pixel_sha256),
        `${exception.asset_key} texture-exception bytes are not preserved in redesign history`,
      );
    } else {
      assert(output.checksum_sha256 === exception.checksum_sha256, `${exception.asset_key} texture-exception checksum drifted`);
      assert(output.pixel_sha256 === exception.pixel_sha256, `${exception.asset_key} texture-exception pixel checksum drifted`);
    }
    assert(output.provenance.promoted_pilot_sha256 === exception.checksum_sha256, `${exception.asset_key} is not an exact promoted V8 byte exception`);
    output.provenance.approved_texture_exception = {
      scope: artifact.scope,
      defect: artifact.defect,
      approval_inheritance: artifact.approval_inheritance,
      evidence,
      evidence_sha256: evidenceRecord.checksum_sha256,
      checksum_sha256: exception.checksum_sha256,
      pixel_sha256: exception.pixel_sha256,
    };
  }
  ledger.approved_texture_exceptions = artifact.assets.map((exception) => ({
    ...clone(exception),
    defect: artifact.defect,
    scope: artifact.scope,
    approval_inheritance: artifact.approval_inheritance,
    evidence,
    evidence_sha256: evidenceRecord.checksum_sha256,
  }));
  ledger.updated_at = new Date().toISOString();
  return ledger;
}

function expectedOutputGenerationSequence(master, assetKey) {
  for (let index = master.lineage.length - 1; index >= 0; index -= 1) {
    const preserved = new Set(master.lineage[index].preserved_output_keys ?? []);
    if (!preserved.has(assetKey)) return index + 1;
  }
  return null;
}

function flatMasterChecksumsForOutputSequence(master, sequence) {
  const checksums = new Set();
  if (sequence === master.lineage.length && master.flat_master_sha256) {
    checksums.add(master.flat_master_sha256);
  }
  for (const entry of master.flat_history.filter((candidate) => candidate.lineage_sequence === sequence)) {
    checksums.add(entry.checksum_sha256);
  }
  return checksums;
}

export function validateOutputGenerationProvenance(output, master) {
  const sequence = expectedOutputGenerationSequence(master, output.asset_key);
  assert(Number.isInteger(sequence) && sequence > 0, `${output.asset_key} has no producing generation sequence`);
  assert(output.provenance.lineage_steps === sequence, `${output.asset_key} generation sequence drifted`);
  const step = master.lineage[sequence - 1];
  assert(step?.sequence === sequence, `${output.asset_key} generation sequence does not resolve`);
  assert(output.provenance.prompt_sha256 === step.prompt_sha256, `${output.asset_key} generation prompt provenance drifted`);
  assert(JSON.stringify(output.provenance.reference_inputs) === JSON.stringify(step.reference_inputs), `${output.asset_key} generation reference provenance drifted`);
  assert(
    JSON.stringify(output.provenance.reference_ids) === JSON.stringify(step.reference_inputs.map((input) => input.id)),
    `${output.asset_key} generation reference ids drifted`,
  );
  assert(output.provenance.terminal_source_sha256 === step.output_sha256, `${output.asset_key} generation terminal source provenance drifted`);
  assert(
    flatMasterChecksumsForOutputSequence(master, sequence).has(output.provenance.flat_master_sha256),
    `${output.asset_key} generation flat-master provenance is not bound to sequence ${sequence}`,
  );
  return true;
}

function applyOutputGenerationProvenance(output, master) {
  const sequence = master.lineage.length;
  const step = master.lineage[sequence - 1];
  assert(step?.sequence === sequence, `${output.asset_key} has no current generation sequence`);
  output.provenance = {
    ...output.provenance,
    prompt_sha256: step.prompt_sha256,
    reference_ids: step.reference_inputs.map((input) => input.id),
    reference_inputs: clone(step.reference_inputs),
    terminal_source_sha256: step.output_sha256,
    flat_master_sha256: master.flat_master_sha256,
    lineage_steps: sequence,
  };
  delete output.provenance.preserved_from_flat_master_sha256;
}

function clearOutputReviewProvenance(output) {
  output.provenance = {
    ...output.provenance,
    reviewed_by: null,
    reviewed_at: null,
    review_evidence: null,
    review_evidence_sha256: null,
  };
  delete output.review_provenance;
}

function applyOutputReviewProvenance(output, master) {
  output.provenance = {
    ...output.provenance,
    reviewed_by: master.review.reviewed_by,
    reviewed_at: master.review.reviewed_at,
    review_evidence: master.review.evidence,
    review_evidence_sha256: master.review.evidence_sha256 ?? null,
  };
  output.review_provenance = {
    lineage_sequence: master.lineage.length,
    video_evidence: clone(master.video_evidence),
    contact_sheet_input: master.contact_sheet_input ? clone(master.contact_sheet_input) : null,
    reviewed_by: master.review.reviewed_by,
    reviewed_at: master.review.reviewed_at,
    evidence: master.review.evidence,
    evidence_sha256: master.review.evidence_sha256 ?? null,
  };
}

function lockedPilotBindings(ledger) {
  const bySlug = new Map(ledger.masters.filter((master) => master.pilot).map((master) => [master.pilot.slug, master]));
  return ["orientation", "opening-the-call", "objection-architecture"].map((slug) => {
    const master = bySlug.get(slug);
    assert(master, `Missing locked pilot ${slug}`);
    return {
      slug,
      terminal_output_sha256: master.pilot.lineage.terminal_output_sha256 ?? master.pilot.lineage.generation?.output_sha256,
      flat_master_sha256: master.pilot.assets.flat_master.sha256,
      lesson_card_sha256: master.pilot.assets.lesson_card.sha256,
      video_poster_sha256: master.pilot.assets.video_poster.sha256,
    };
  });
}

function pilotBindingsSha256(bindings) {
  return sha256(bindings.map((binding) => `${binding.slug}|${binding.terminal_output_sha256}|${binding.flat_master_sha256}|${binding.lesson_card_sha256}|${binding.video_poster_sha256}\n`).join(""));
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
  const approvedInventorySha256 = ledger.pilot_approval?.approved_inventory_sha256 ?? artifact.inventory_sha256;
  assert(SHA256.test(approvedInventorySha256), "Pilot approval inventory checksum is invalid");
  assert(artifact.inventory_sha256 === approvedInventorySha256, "Pilot approval inventory checksum drifted from its approval-time snapshot");
  const lineagePaths = new Set(ledger.masters.filter((master) => master.pilot).map((master) => master.pilot.lineage_record_path));
  assert(lineagePaths.size === 1, "Pilot approval requires one exact generation lineage record");
  const lineageRecord = await fileRecord(root, [...lineagePaths][0]);
  assert(artifact.generation_lineage_sha256 === lineageRecord.checksum_sha256, "Pilot approval lineage checksum drifted");
  return { evidenceRecord, artifact, bindingsSha256 };
}

export async function validateLedger({ root, inventory, manifest, ledger, inspectFiles = true, allowLegacyRedesignProvenance = false }) {
  assert(ledger.schema_version === SCHEMA_VERSION, "Unsupported production ledger");
  const expected = createInitialLedger(inventory);
  assert(ledger.inventory_path === expected.inventory_path, "Ledger inventory path drifted");
  assert(ledger.manifest_path === expected.manifest_path, "Ledger manifest path drifted");
  assert(JSON.stringify(ledger.palette_rgb) === JSON.stringify(expected.palette_rgb), "Locked artwork palette drifted");
  assert(JSON.stringify(ledger.counts) === JSON.stringify(expected.counts), "Locked artwork counts drifted");
  assert(["preapproval", "pilot-approved", "production", "finalized"].includes(ledger.status), "Ledger lifecycle status is invalid");
  if (ledger.status === "finalized") {
    if (ledger.final_approval?.status === APPROVED) {
      assert(
        ledger.final_approval.approved_by === "Jarrad Henry",
        "Final approval requires approver Jarrad Henry",
      );
    }
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
      validateOutputGenerationProvenance(asset, owner);
      assert(asset.provenance.reviewed_by === owner.review.reviewed_by, `${asset.asset_key} reviewer provenance drifted`);
      assert(asset.provenance.reviewed_at === owner.review.reviewed_at, `${asset.asset_key} review timestamp provenance drifted`);
      assert(asset.provenance.review_evidence === owner.review.evidence, `${asset.asset_key} review evidence provenance drifted`);
      assert(asset.provenance.review_evidence_sha256 === owner.review.evidence_sha256, `${asset.asset_key} review evidence checksum provenance drifted`);
      if (owner.review.status === "pending") {
        assert(asset.review_provenance === undefined, `${asset.asset_key} pending review retains bound review provenance`);
      } else {
        assert(JSON.stringify(asset.review_provenance) === JSON.stringify({
          lineage_sequence: owner.lineage.length,
          video_evidence: owner.video_evidence,
          contact_sheet_input: owner.contact_sheet_input,
          reviewed_by: owner.review.reviewed_by,
          reviewed_at: owner.review.reviewed_at,
          evidence: owner.review.evidence,
          evidence_sha256: owner.review.evidence_sha256,
        }), `${asset.asset_key} current-context review provenance drifted`);
      }
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
      if (asset.redesign_replacement === undefined && asset.poster_redesign_replacement === undefined) {
        assert(historical.recipe_sha256 === asset.derivative.recipe_sha256, `${asset.asset_key} history recipe drifted`);
      } else {
        assert(SHA256.test(historical.recipe_sha256), `${asset.asset_key} historical redesign recipe checksum is invalid`);
      }
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
      assert(asset.history.at(-1)?.checksum_sha256 === asset.replacement_authorized_checksum, `${asset.asset_key} replacement authorization is not tied to history`);
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
      assert(asset.replacement_authorized_checksum && existing.checksum_sha256 === asset.replacement_authorized_checksum, `${asset.asset_key} is an orphan production output not recorded by the ledger`);
    }
  }
  await validateThumbnailRedesignApproval({ root, ledger, inspectFiles, allowLegacyRedesignProvenance });
  await validateVideoPosterRedesignApproval({ root, ledger, inspectFiles });
  if (ledger.approved_texture_exceptions !== undefined) {
    assert(Array.isArray(ledger.approved_texture_exceptions) && ledger.approved_texture_exceptions.length === 4, "Approved texture exceptions must bind exactly four assets");
    const allowedMasters = new Set(["master-slot-07", "master-slot-09"]);
    const exceptionKeys = new Set();
    for (const exception of ledger.approved_texture_exceptions) {
      assert(!exceptionKeys.has(exception.asset_key), `Duplicate approved texture exception ${exception.asset_key}`);
      exceptionKeys.add(exception.asset_key);
      assert(allowedMasters.has(exception.master_id), `${exception.asset_key} approved texture exception is outside slots 07/09`);
      assert(exception.scope === "checksum-specific-v8-pilot-bytes-only", `${exception.asset_key} approved texture exception scope drifted`);
      assert(exception.approval_inheritance === "forbidden", `${exception.asset_key} approved texture exception inheritance drifted`);
      assertString(exception.defect, `${exception.asset_key} approved texture exception defect`);
      assert(SHA256.test(exception.evidence_sha256), `${exception.asset_key} approved texture exception evidence checksum invalid`);
      const output = ledger.assets.find((asset) => asset.asset_key === exception.asset_key);
      assert(output?.provenance.master_id === exception.master_id, `${exception.asset_key} approved texture exception owner drifted`);
      if (output.redesign_replacement !== undefined || output.poster_redesign_replacement !== undefined) {
        assert(
          output.history.some((entry) => entry.checksum_sha256 === exception.checksum_sha256 && entry.pixel_sha256 === exception.pixel_sha256),
          `${exception.asset_key} approved texture exception is not preserved in redesign history`,
        );
      } else {
        assert(output.checksum_sha256 === exception.checksum_sha256 && output.pixel_sha256 === exception.pixel_sha256, `${exception.asset_key} approved texture exception no longer matches current bytes`);
      }
      assert(output.provenance.promoted_pilot_sha256 === exception.checksum_sha256, `${exception.asset_key} approved texture exception is not a promoted V8 checksum`);
      assert(JSON.stringify(output.provenance.approved_texture_exception) === JSON.stringify({
        scope: exception.scope,
        defect: exception.defect,
        approval_inheritance: exception.approval_inheritance,
        evidence: exception.evidence,
        evidence_sha256: exception.evidence_sha256,
        checksum_sha256: exception.checksum_sha256,
        pixel_sha256: exception.pixel_sha256,
      }), `${exception.asset_key} approved texture exception provenance drifted`);
      if (inspectFiles) {
        const evidence = await fileRecord(root, exception.evidence);
        assert(evidence.checksum_sha256 === exception.evidence_sha256, `${exception.asset_key} approved texture exception evidence drifted`);
        for (const binding of [exception.asset_key, exception.checksum_sha256, exception.pixel_sha256]) {
          assert(evidence.contents.toString("utf8").includes(binding), `${exception.asset_key} approved texture exception evidence does not bind ${binding}`);
        }
      }
    }
  }
  const sharedPilotParents = canonicalSharedPilotParents(ledger.masters);
  const invocationIds = sharedPilotParents.map((parent) => parent.tool_evidence.invocation_call_id);
  const toolOutputIds = sharedPilotParents.map((parent) => parent.tool_evidence.tool_output_id);
  const lineageOutputHashes = sharedPilotParents.map((parent) => parent.output.sha256);
  const recordedReviews = ledger.masters.filter((master) => master.review.status !== "pending");
  let recordedFinalApproval = null;
  if (recordedReviews.length > 0) {
    const first = recordedReviews[0].review;
    assert(first.status === APPROVED, "Final artwork batch contains a non-approved master review");
    for (const master of recordedReviews) {
      assert(master.review.status === APPROVED, "Final artwork batch contains a non-approved master review");
      assert(master.review.evidence === first.evidence, "Every recorded final artwork review must use one approval artifact path");
      assert(master.review.evidence_sha256 === first.evidence_sha256, "Every recorded final artwork review must use one approval artifact checksum");
      assert(master.review.reviewed_by === first.reviewed_by && master.review.reviewed_at === first.reviewed_at, "Every recorded final artwork review must use one approver and timestamp");
    }
    recordedFinalApproval = ledger.thumbnail_redesign_approval === undefined
      ? await validateFinalApprovalArtifact({
          root,
          ledger,
          evidence: first.evidence,
          approvedBy: first.reviewed_by,
          approvedAt: first.reviewed_at,
        })
      : await validateHistoricalFinalApprovalArtifact({
          root,
          ledger,
          evidence: first.evidence,
          approvedBy: first.reviewed_by,
          approvedAt: first.reviewed_at,
        });
  }
  for (const master of ledger.masters) {
    const planned = expected.masters.find((candidate) => candidate.id === master.id);
    assert(planned, `Unexpected ledger master ${master.id}`);
    assert(master.source_path === planned.source_path, `${master.id} source path drifted`);
    assert(master.flat_master_path === planned.flat_master_path, `${master.id} flat-master path drifted`);
    assert(JSON.stringify(master.background_rgb) === JSON.stringify(planned.background_rgb), `${master.id} background drifted`);
    assert(JSON.stringify(master.flat_fill_cleanup ?? []) === JSON.stringify(planned.flat_fill_cleanup ?? []), `${master.id} flat-fill cleanup drifted`);
    assert(master.prompt_sha256 === planned.prompt_sha256, `${master.id} prompt checksum drifted`);
    assert(JSON.stringify(master.reference_ids) === JSON.stringify(planned.reference_ids), `${master.id} references drifted`);
    assert(JSON.stringify(master.reference_inputs) === JSON.stringify(planned.reference_inputs), `${master.id} reference provenance drifted`);
    assert(JSON.stringify(master.video_evidence) === JSON.stringify(planned.video_evidence), `${master.id} source-video evidence drifted`);
    assert(JSON.stringify(master.contact_sheet_input) === JSON.stringify(planned.contact_sheet_input), `${master.id} contact-sheet input drifted`);
    assert(master.kind === planned.kind, `${master.id} kind drifted`);
    assert(master.source_mode === planned.source_mode, `${master.id} source mode drifted`);
    assert(master.planned_generation_call_id === planned.planned_generation_call_id, `${master.id} planned call drifted`);
    assert(JSON.stringify(master.pilot) === JSON.stringify(planned.pilot), `${master.id} pilot plan drifted`);
    assert(JSON.stringify(master.outputs) === JSON.stringify(planned.outputs), `${master.id} output/recipe plan drifted`);
    if (inspectFiles && master.status !== "missing" && master.flat_fill_cleanup?.length > 0) {
      const cleanup = master.flat_fill_cleanup[0];
      const baselineSource = await fileRecord(root, cleanup.source_pixel_baseline_path);
      const baselineFlat = await fileRecord(root, cleanup.flat_pixel_baseline_path);
      assert(baselineSource.checksum_sha256 === cleanup.source_pixel_baseline_sha256, `${master.id} source-pixel baseline checksum drifted`);
      assert(baselineFlat.checksum_sha256 === cleanup.flat_pixel_baseline_sha256, `${master.id} flat-pixel baseline checksum drifted`);
      const currentSource = await fileRecord(root, master.source_path);
      await assertDecodedArtworkPixelsEqual(currentSource.contents, baselineSource.contents, `${master.id} restored source`);
      if (master.status === "derived") {
        const currentFlat = await fileRecord(root, master.flat_master_path);
        await assertFlatFillCleanupDelta(baselineFlat.contents, currentFlat.contents, master.flat_fill_cleanup);
      }
    }
    if (inspectFiles && master.pilot) await validateTwoIdentityPilotFiles(root, master.pilot);
    assert(["missing", "source-ready", "derived"].includes(master.status), `${master.id} status is invalid`);
    const sharedPilotParent = master.pilot && isSharedPilotLineage(master.pilot.lineage) ? master.pilot.shared_generation_parent : null;
    const twoIdentityPilotParent = master.pilot && isTwoIdentityPilotLineage(master.pilot.lineage) && master.pilot.lineage.generation.operation === "edit" ? master.pilot.lineage.generation.parent_sha256 : null;
    let previous = sharedPilotParent?.output.sha256 ?? twoIdentityPilotParent;
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
        assertString(input.id, `${master.id} lineage input id`);
        assertString(input.role, `${master.id} lineage input role`);
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
      if (index > 0 || sharedPilotParent || twoIdentityPilotParent) {
        assert(step.parent_source_sha256 === previous, `${master.id} correction parent checksum mismatch`);
      } else {
        assert(step.parent_source_sha256 === null, `${master.id} initial generation cannot have a parent`);
      }
      if (index === 0 && sharedPilotParent) {
        assert(step.operation === "pilot-correction", `${master.id} shared-parent pilot must begin with an edit`);
        assert(step.reference_inputs[0]?.sha256 === sharedPilotParent.output.sha256, `${master.id} shared-parent pilot input is disconnected`);
      }
      if (index === 0 && twoIdentityPilotParent) {
        assert(step.operation === "pilot-correction", `${master.id} two-identity pilot edit must remain a correction`);
        assert(step.reference_inputs[0]?.sha256 === twoIdentityPilotParent, `${master.id} two-identity pilot input is disconnected`);
      }
      if (step.operation.includes("correction")) {
        assertString(step.correction_prompt_path, `${master.id} correction prompt path`);
        assert(SHA256.test(step.correction_prompt_sha256), `${master.id} correction prompt checksum invalid`);
        if (inspectFiles) {
          const prompt = await fileRecord(root, step.correction_prompt_path);
          const promptChecksum = step.operation.startsWith("pilot-") && !isTwoIdentityPilotLineage(master.pilot?.lineage) ? sha256(prompt.contents.toString("utf8").replace(/\r?\n$/, "")) : prompt.checksum_sha256;
          assert(promptChecksum === step.correction_prompt_sha256, `${master.id} correction prompt checksum drifted`);
        }
      }
      if (step.preserved_output_keys !== undefined) {
        assert(Array.isArray(step.preserved_output_keys) && new Set(step.preserved_output_keys).size === step.preserved_output_keys.length, `${master.id} preserved output keys invalid`);
        for (const assetKey of step.preserved_output_keys) assert(master.outputs.some((output) => output.asset_key === assetKey), `${master.id} preserved unrelated output ${assetKey}`);
      }
      if (step.postapproval_defect_remediation === true) {
        assert(master.pilot, `${master.id} postapproval remediation must belong to a pilot`);
        assert(step.operation === "correction", `${master.id} postapproval remediation must be explicit correction lineage`);
        assertString(step.defect_evidence, `${master.id} postapproval defect evidence`);
        assert(SHA256.test(step.defect_evidence_sha256), `${master.id} postapproval defect evidence checksum invalid`);
        if (inspectFiles) {
          const evidence = await fileRecord(root, step.defect_evidence);
          assert(evidence.checksum_sha256 === step.defect_evidence_sha256, `${master.id} postapproval defect evidence drifted`);
          for (const binding of [master.id, step.parent_source_sha256]) {
            assert(evidence.contents.toString("utf8").includes(binding), `${master.id} postapproval defect evidence does not bind ${binding}`);
          }
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
      assert(master.flat_master_sha256 === null && master.flat_replacement_authorized_checksum === null, `${master.id} missing state retains flat-master state`);
      assert(master.flat_history.length === 0, `${master.id} missing state retains flat history`);
      assert(master.review.status === "pending", `${master.id} missing state retains review`);
    } else {
      assert(master.lineage.length > 0 && SHA256.test(master.terminal_source_sha256), `${master.id} active state lacks lineage`);
    }
    if (master.status === "derived") {
      assert(SHA256.test(master.flat_master_sha256), `${master.id} derived state lacks flat master`);
      for (const outputRef of master.outputs) {
        assert(SHA256.test(ledger.assets.find((asset) => asset.asset_key === outputRef.asset_key)?.checksum_sha256), `${master.id} derived state lacks output ${outputRef.asset_key}`);
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
      assert(recordedFinalApproval, `${master.id} structured final approval was not validated`);
      assert(recordedFinalApproval.evidenceRecord.checksum_sha256 === master.review.evidence_sha256, `${master.id} review evidence drifted`);
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
    assert(masterIds.filter((id) => id === asset.derivative?.source_master_id).length === 1, `${asset.asset_key} derivative source_master_id must resolve exactly once`);
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
    assert(ledger.pilot_approval.approved_inventory_sha256 === artifact.inventory_sha256, "Stored pilot approval inventory checksum drifted");
    const latestPilotGeneration = Math.max(...ledger.masters.filter((master) => master.pilot).flatMap((master) => (master.pilot.lineage.steps ?? []).map((step) => Date.parse(step.tool_evidence.completed_at))));
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
    assert(
      ledger.final_approval.approved_by === "Jarrad Henry",
      "Final approval requires approver Jarrad Henry",
    );
    assert(SHA256.test(ledger.final_approval.evidence_sha256), "Final evidence checksum invalid");
    assert(new Set(ledger.assets.map((asset) => asset.checksum_sha256)).size === 49, "Final artwork file checksums must be unique");
    assert(new Set(ledger.assets.filter((asset) => asset.kind === "video-poster").map((asset) => asset.pixel_sha256)).size === 29, "Final poster pixels must be unique");
    const approval = ledger.thumbnail_redesign_approval === undefined
      ? await validateFinalApprovalArtifact({
          root,
          ledger,
          evidence: ledger.final_approval.evidence,
          approvedBy: ledger.final_approval.approved_by,
          approvedAt: ledger.final_approval.approved_at,
        })
      : await validateHistoricalFinalApprovalArtifact({
          root,
          ledger,
          evidence: ledger.final_approval.evidence,
          approvedBy: ledger.final_approval.approved_by,
          approvedAt: ledger.final_approval.approved_at,
        });
    assert(approval.evidenceRecord.checksum_sha256 === ledger.final_approval.evidence_sha256, "Final evidence drifted");
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
  assert(approvedBy === "Jarrad Henry", "Pilot approval requires approver Jarrad Henry");
  assertIso(approvedAt, "approved_at");
  assertString(evidence, "evidence");
  const pilotCompletionTimes = ledger.masters.filter((master) => master.pilot).flatMap((master) => (master.pilot.lineage.steps ?? []).map((step) => Date.parse(step.tool_evidence.completed_at)));
  if (pilotCompletionTimes.length > 0) {
    assert(Date.parse(approvedAt) >= Math.max(...pilotCompletionTimes), "Pilot approval predates pilot generation completion");
  }
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
    approved_inventory_sha256: artifact.inventory_sha256,
  };
  ledger.status = "pilot-approved";
  ledger.updated_at = approvedAt;
  return ledger;
}

function pilotLineage(master, ledger) {
  if (isTwoIdentityPilotLineage(master.pilot.lineage)) {
    const candidate = master.pilot.lineage;
    const generation = candidate.generation;
    const referenceInputs = [
      ...(generation.operation === "edit"
        ? [{
            id: `pilot-parent-${candidate.slug}`,
            role: "checksum-bound approved pilot edit parent",
            path: generation.parent_path,
            sha256: generation.parent_sha256,
          }]
        : []),
      ...master.pilot.identity_roots,
      candidate.contact_sheet_input,
    ].map((input, index) => ({
      id: input.id ?? `pilot-input-${candidate.slug}-${index + 1}`,
      role: input.role ?? "checksum-bound approved pilot generation input",
      path: input.path,
      sha256: input.sha256,
    }));
    return [
      {
        sequence: 1,
        operation: generation.operation === "generate" ? "pilot-generate" : "pilot-correction",
        prompt_sha256: generation.prompt_sha256,
        correction_prompt_path: generation.operation === "edit" ? generation.prompt_path : null,
        correction_prompt_sha256: generation.operation === "edit" ? generation.prompt_sha256 : null,
        parent_source_sha256: generation.operation === "edit" ? generation.parent_sha256 : null,
        generation_call_id: `${master.pilot.lineage_schema_version === "bmh-thumbnail-pilot-lineage/v4-candidate" ? "v8" : "v7"}-candidate-${candidate.slug}`,
        tool_output_id: generation.tool_output_id,
        generated_by: "built-in image_gen candidate admitted by Jarrad approval",
        completed_at: ledger.pilot_approval.approved_at,
        archived_output_path: generation.output_path,
        output_sha256: generation.output_sha256,
        reference_inputs: referenceInputs,
      },
    ];
  }
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
    reference_inputs: step.inputs.map((input, inputIndex) => ({
      id: input.id ?? `pilot-input-${master.pilot.slug}-${index + 1}-${inputIndex + 1}`,
      role: input.role ?? "checksum-bound approved pilot generation input",
      path: input.path,
      sha256: input.sha256,
    })),
  }));
}

export async function promotePilots({ root, ledger }) {
  assert(ledger.pilot_approval.status === APPROVED, "Pilot promotion requires explicit pilot approval");
  if (ledger.status === "production") {
    for (const master of ledger.masters.filter((candidate) => candidate.pilot)) {
      assert(["source-ready", "derived"].includes(master.status), `${master.id} is not in a promoted state`);
      assert(master.terminal_source_sha256 === master.pilot.assets.source.sha256, `${master.id} promoted source provenance drifted`);
      assert(master.flat_master_sha256 === master.pilot.assets.flat_master.sha256, `${master.id} promoted flat provenance drifted`);
      assert(JSON.stringify(master.lineage) === JSON.stringify(pilotLineage(master, ledger)), `${master.id} promoted lineage drifted`);
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
    master.lineage = pilotLineage(master, ledger);
    master.terminal_source_sha256 = source.sha256;
    master.flat_master_sha256 = flat.sha256;
    master.status = "source-ready";

    const [cardRef, firstPosterRef] = [master.outputs.find((output) => output.recipe.kind === "lesson-card"), master.outputs.find((output) => output.recipe.kind === "video-poster")];
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
      applyOutputGenerationProvenance(output, master);
      clearOutputReviewProvenance(output);
    }
  }
  ledger.status = "production";
  ledger.updated_at = new Date().toISOString();
  return ledger;
}

export async function ingestGeneration({ root, ledger, masterId, sourceFile, generationCallId, toolOutputId, generatedAt, generatedBy, correctionPromptPath = null, parentSha256 = null, allowPilotRemediation = false, defectEvidencePath = null, preserveOutputKeys = [] }) {
  assert(ledger.pilot_approval.status === APPROVED, "Generation ingest requires pilot approval");
  assert(ledger.status === "production", "Generation ingest requires promoted pilots");
  const master = findMaster(ledger, masterId);
  assert(Array.isArray(preserveOutputKeys) && new Set(preserveOutputKeys).size === preserveOutputKeys.length, `${masterId} preserved output keys must be a unique array`);
  for (const assetKey of preserveOutputKeys) assert(master.outputs.some((output) => output.asset_key === assetKey), `${masterId} cannot preserve unrelated output ${assetKey}`);
  assert(!master.pilot || allowPilotRemediation, "Approved pilots must be promoted, not ingested as new generations");
  if (allowPilotRemediation) assert(master.pilot, "Pilot remediation flag is only valid for an approved pilot master");
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
  if (replay && replay.generation_call_id === generationCallId && replay.tool_output_id === toolOutputId && replay.output_sha256 === outputSha256 && replay.completed_at === generatedAt && replay.generated_by === generatedBy) {
    assert(parentSha256 === replay.parent_source_sha256, `${masterId} replay parent checksum differs from recorded lineage`);
    assert(correctionPromptPath === replay.correction_prompt_path, `${masterId} replay correction prompt path differs from recorded lineage`);
    assert(suppliedCorrectionPromptSha256 === replay.correction_prompt_sha256, `${masterId} replay correction prompt checksum differs from recorded lineage`);
    assert(
      JSON.stringify(preserveOutputKeys) === JSON.stringify(replay.preserved_output_keys ?? []),
      `${masterId} replay preserved output keys differ from recorded lineage`,
    );
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
  let defectEvidence = null;
  if (allowPilotRemediation) {
    assert(correction, `${masterId} pilot remediation must extend the approved lineage`);
    assertString(defectEvidencePath, "pilot remediation defect evidence");
    const defectBindings = [master.id, parentSha256];
    for (const outputRef of master.outputs) {
      const output = findOutput(ledger, outputRef.asset_key);
      if (output.checksum_sha256) defectBindings.push(output.asset_key, output.checksum_sha256);
    }
    defectEvidence = await validateEvidence(root, defectEvidencePath, defectBindings);
  }
  if (correction && master.status === "derived") {
    assert(SHA256.test(master.flat_master_sha256), `${masterId} prior flat master is not recorded`);
    const priorFlat = await fileRecord(root, master.flat_master_path);
    assert(priorFlat.checksum_sha256 === master.flat_master_sha256, `${masterId} prior flat master drifted`);
    const flatArchive = path.posix.join(path.posix.dirname(master.source_path), "lineage", master.id, "flat-masters", `version-${String(sequence - 1).padStart(3, "0")}.png`);
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
      if (preserveOutputKeys.includes(output.asset_key)) {
        continue;
      }
      const archive = path.posix.join(path.posix.dirname(master.source_path), "lineage", master.id, "derivatives", `version-${String(sequence - 1).padStart(3, "0")}-${path.posix.basename(output.manifest_path)}`);
      if (!(await assertAbsentOrExact(root, archive, actual.contents, `${output.asset_key} historical derivative`))) {
        await writeBufferAtomic(resolveRepoPath(root, archive), actual.contents, root);
      }
      output.history.push({
        version: output.history.length + 1,
        lineage_sequence: output.provenance.lineage_steps,
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
    postapproval_defect_remediation: allowPilotRemediation,
    defect_evidence: defectEvidence?.path ?? null,
    defect_evidence_sha256: defectEvidence?.sha256 ?? null,
    preserved_output_keys: clone(preserveOutputKeys),
  });
  master.terminal_source_sha256 = outputSha256;
  master.flat_master_sha256 = preserveOutputKeys.length > 0 ? master.flat_replacement_authorized_checksum : null;
  master.status = "source-ready";
  master.review = baseReview();
  for (const outputRef of master.outputs) {
    const output = findOutput(ledger, outputRef.asset_key);
    clearOutputReviewProvenance(output);
    if (preserveOutputKeys.includes(output.asset_key)) {
      continue;
    }
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
  const remediatedPilot = master.pilot && master.lineage.some((step) => step.operation === "correction" && step.postapproval_defect_remediation === true);
  if (master.pilot && !remediatedPilot) {
    const existingFlat = await fileRecord(root, master.flat_master_path);
    assert(existingFlat.checksum_sha256 === master.pilot.assets.flat_master.sha256, `${masterId} promoted flat master drifted`);
    flatInput = existingFlat.contents;
    flatChecksum = existingFlat.checksum_sha256;
  } else {
    const masterBackground = master.background_rgb ? assertRecipeRgb(master.background_rgb, ledger.palette_rgb, `${master.id} background`) : BLUE;
    if (master.flat_fill_cleanup?.length > 0) {
      const sourceBaselines = new Map(master.flat_fill_cleanup.map((cleanup) => [
        `${cleanup.source_pixel_baseline_path}|${cleanup.source_pixel_baseline_sha256}`,
        cleanup,
      ]));
      assert(sourceBaselines.size === 1, `${master.id} flat-fill cleanups must share one source-pixel baseline`);
      const baseline = master.flat_fill_cleanup[0];
      const baselineSource = await fileRecord(root, baseline.source_pixel_baseline_path);
      assert(baselineSource.checksum_sha256 === baseline.source_pixel_baseline_sha256, `${master.id} source-pixel baseline checksum drifted`);
      await assertDecodedArtworkPixelsEqual(sourceRecord.contents, baselineSource.contents, `${master.id} restored source`);
    }
    flatBuffer = await encodeFlatPng(sourceRecord.contents, ledger.palette_rgb, masterBackground, master.flat_fill_cleanup);
    flatInput = flatBuffer;
    flatChecksum = sha256(flatBuffer);
  }
  const candidates = [];
  const preservedOutputKeys = new Set(master.lineage.at(-1)?.preserved_output_keys ?? []);
  for (const outputRef of master.outputs) {
    const output = findOutput(ledger, outputRef.asset_key);
    if (preservedOutputKeys.has(output.asset_key)) {
      const preserved = await inspectArtworkFile(root, output, ledger.palette_rgb);
      candidates.push({ output, preserved: true, record: preserved, buffer: preserved.contents });
      continue;
    }
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
    ...ledger.assets.filter((asset) => asset.kind === "video-poster" && asset.checksum_sha256 && asset.provenance.master_id !== master.id).map((asset) => asset.pixel_sha256),
    ...candidates.filter((candidate) => candidate.output.kind === "video-poster").map((candidate) => candidate.record.pixel_sha256),
  ];
  assert(new Set(posterPixels).size === posterPixels.length, "Derived poster duplicates an existing poster's decoded pixels");

  if (!master.pilot || remediatedPilot) {
    const flatPath = resolveRepoPath(root, master.flat_master_path);
    if (await pathExists(flatPath)) {
      const existing = await fileRecord(root, master.flat_master_path);
      const allowed = [master.flat_master_sha256, master.flat_replacement_authorized_checksum, flatChecksum].filter(Boolean);
      assert(allowed.includes(existing.checksum_sha256), `${masterId} flat master is an orphan or mismatched restart artifact`);
      if (existing.checksum_sha256 !== flatChecksum) {
        assert(existing.checksum_sha256 === master.flat_replacement_authorized_checksum, `${masterId} flat replacement was not explicitly authorized`);
        if (master.flat_fill_cleanup?.length > 0) {
          const flatBaselines = new Map(master.flat_fill_cleanup.map((cleanup) => [
            `${cleanup.flat_pixel_baseline_path}|${cleanup.flat_pixel_baseline_sha256}`,
            cleanup,
          ]));
          assert(flatBaselines.size === 1, `${master.id} flat-fill cleanups must share one flat-pixel baseline`);
          const baseline = master.flat_fill_cleanup[0];
          const baselineFlat = await fileRecord(root, baseline.flat_pixel_baseline_path);
          assert(baselineFlat.checksum_sha256 === baseline.flat_pixel_baseline_sha256, `${master.id} flat-pixel baseline checksum drifted`);
          await assertFlatFillCleanupDelta(baselineFlat.contents, flatBuffer, master.flat_fill_cleanup);
        }
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
    if (!candidate.promoted && !candidate.preserved) {
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
    if (!candidate.preserved) applyOutputGenerationProvenance(output, master);
    clearOutputReviewProvenance(output);
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
  assert(decision === APPROVED, "Final batch review requires an affirmative approved decision");
  assert(Date.parse(reviewedAt) >= Date.parse(master.lineage.at(-1).completed_at), `${masterId} review predates generation`);
  const approval = await validateFinalApprovalArtifact({
    root,
    ledger,
    evidence,
    approvedBy: reviewedBy,
    approvedAt: reviewedAt,
  });
  for (const reviewed of ledger.masters.filter((candidate) => candidate.review.status !== "pending")) {
    assert(reviewed.review.status === APPROVED, "Final artwork batch contains a non-approved master review");
    assert(reviewed.review.evidence === evidence, "Every final artwork master review must use the same approval artifact path");
    assert(reviewed.review.evidence_sha256 === approval.evidenceRecord.checksum_sha256, "Every final artwork master review must use the same approval artifact bytes");
    assert(reviewed.review.reviewed_by === reviewedBy && reviewed.review.reviewed_at === reviewedAt, "Every final artwork master review must use the same approver and timestamp");
  }
  for (const outputRef of master.outputs) {
    const output = findOutput(ledger, outputRef.asset_key);
    const actual = await inspectArtworkFile(root, output, ledger.palette_rgb);
    assert(actual.checksum_sha256 === output.checksum_sha256, `${output.asset_key} changed before review`);
    if (decision === APPROVED && output.kind === "video-poster") {
      const background = assertRecipeRgb(output.derivative.recipe.normalize_background_rgb, ledger.palette_rgb, `${output.asset_key} review background`);
      await assertPosterSafeEdges(actual.contents, background, output.asset_key);
    }
  }
  master.review = {
    status: decision,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAt,
    evidence,
    evidence_sha256: approval.evidenceRecord.checksum_sha256,
  };
  for (const outputRef of master.outputs) applyOutputReviewProvenance(findOutput(ledger, outputRef.asset_key), master);
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
  assert(approvedBy === "Jarrad Henry", "Final approval requires approver Jarrad Henry");
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
  assert(new Set(ledger.assets.filter((asset) => asset.kind === "video-poster").map((asset) => asset.pixel_sha256)).size === 29, "Every decoded poster pixel checksum must be unique");
  const approval = await validateFinalApprovalArtifact({
    root,
    ledger,
    evidence,
    approvedBy,
    approvedAt,
  });
  for (const master of ledger.masters) {
    assert(master.review.evidence === evidence, "Finalization requires one approval artifact path for every master review");
    assert(master.review.evidence_sha256 === approval.evidenceRecord.checksum_sha256, "Finalization requires one approval artifact checksum for every master review");
    assert(master.review.reviewed_by === approvedBy && master.review.reviewed_at === approvedAt, "Finalization requires one approver and timestamp for every master review");
  }
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
    evidence_sha256: approval.evidenceRecord.checksum_sha256,
  };
  ledger.status = "finalized";
  ledger.updated_at = approvedAt;
  const nextManifest = reconcileManifestFromLedger(ledger, manifest);
  return { ledger, manifest: nextManifest };
}

export async function loadWorkflow(root) {
  const [inventory, ledger, manifest] = await Promise.all([readJson(resolveRepoPath(root, DEFAULT_PATHS.inventory)), readJson(resolveRepoPath(root, DEFAULT_PATHS.ledger)), readJson(resolveRepoPath(root, DEFAULT_PATHS.manifest))]);
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
