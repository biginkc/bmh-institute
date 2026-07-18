import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEmptyProductionRecord, sha256, validateProductionRecord } from "./artwork-production-contract.mjs";
import { getArtworkPose, validateArtworkPoseContract } from "./artwork-pose-contract.mjs";
import { applyDistinctPosterInventoryOverlay } from "./sync-distinct-poster-inventory.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(repoRoot, "content/course-manifests/bmh-employee-training.v1.json");
const outputPath = path.join(repoRoot, "docs/course-production/thumbnail-pilots/production-inventory.json");
const pilotChecksumsRecordPath = "docs/course-production/thumbnail-pilots/v8-checksums.json";
const pilotGenerationLineageRecordPath = "docs/course-production/thumbnail-pilots/v8-generation-lineage.json";
const videoContactSheetsRecordPath =
  "docs/course-production/thumbnail-pilots/references/production-video-stills/contact-sheets.json";
const distinctPosterContactSheetsRecordPath =
  "docs/course-production/thumbnail-pilots/references/production-video-stills/distinct-posters/contact-sheets.json";
const pilotChecksumsPath = path.join(repoRoot, pilotChecksumsRecordPath);
const pilotGenerationLineagePath = path.join(repoRoot, pilotGenerationLineageRecordPath);
const videoContactSheetsPath = path.join(repoRoot, videoContactSheetsRecordPath);
const distinctPosterContactSheetsPath = path.join(repoRoot, distinctPosterContactSheetsRecordPath);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== "--check");
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}
const checkMode = args.includes("--check");

const [manifest, pilotChecksums, pilotGenerationLineage, videoContactSheets, distinctPosterContactSheets] = await Promise.all([
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(pilotChecksumsPath, "utf8").then(JSON.parse),
  readFile(pilotGenerationLineagePath, "utf8").then(JSON.parse),
  readFile(videoContactSheetsPath, "utf8").then(JSON.parse),
  readFile(distinctPosterContactSheetsPath, "utf8").then(JSON.parse),
]);
const course = manifest.program.courses[0];
const lessons = course.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.type === "content"));
const manifestAssets = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));

const BLUE_RGB = [103, 182, 255];
const YELLOW_RGB = [255, 211, 1];
const ALLOWED_BACKGROUND_RGB = new Set([BLUE_RGB.join(","), YELLOW_RGB.join(",")]);

validateArtworkPoseContract();

const baseReferences = [
  {
    id: "style-ref-1",
    role: "canonical BMH Sticker System style",
    path: "docs/design/style-ref-1.png",
    sha256: "d65ce4c3fc84a0a52b08e513d42d978f94d5db2f6e59034aedbbd1e9486c18ca",
  },
  {
    id: "style-ref-2",
    role: "canonical BMH Sticker System style",
    path: "docs/design/style-ref-2.png",
    sha256: "f1affc2ab6b931be8cfd6920165dff330d49b79e6f4abfe5568e67e70c6934a6",
  },
  {
    id: "orientation-building",
    role: "Orientation subject reference only",
    path: "docs/course-production/thumbnail-pilots/references/mV0_LV0_s10_bmh-lowangle.png",
    sha256: "438bab4f68f7b71e5daec17def6ea1ceb091e010b57c135968746fba92ba42dc",
  },
  {
    id: "opening-phone-shapes",
    role: "Opening the Call subject reference only",
    path: "docs/course-production/thumbnail-pilots/references/m05_L5A_phones.png",
    sha256: "2d59d64e913c43b1fba45080b0bf59c9e51356f1d4b057c5d2831bfa0f7af6e8",
  },
  {
    id: "objection-character",
    role: "Objection Architecture character reference only",
    path: "docs/course-production/thumbnail-pilots/references/m07_L7A_b03_reframe.png",
    sha256: "57fe03b31eca46336c664c2ca78cf877b8db3138443964e7976ce70eb91db311",
  },
];

function repoPath(localPath) {
  const candidate = path.resolve(repoRoot, localPath);
  if (candidate !== repoRoot && !candidate.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Pilot lineage path escapes the repository: ${localPath}`);
  }
  return candidate;
}

function pngDimensions(contents, localPath) {
  const signature = "89504e470d0a1a0a";
  if (contents.length < 24 || contents.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`Pilot lineage output is not a PNG: ${localPath}`);
  }
  return [contents.readUInt32BE(16), contents.readUInt32BE(20)];
}

function validateBackgroundRgb(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255) || !ALLOWED_BACKGROUND_RGB.has(value.join(","))) {
    throw new Error(`${label} must be the locked blue or yellow RGB value`);
  }
  return value;
}

function lessonVideoBlocks(slot) {
  const lesson = lessons.find((candidate) => candidate.source_key === `lesson-content-${slot}`);
  if (!lesson) throw new Error(`Manifest content lesson is missing for ${slot}`);
  return lesson.blocks.filter((block) => block.type === "video");
}

function mappedVideoBlocksForMaster(masterId) {
  if (masterId === "master-poster-video-slot-07-fact-find") {
    return lessonVideoBlocks("slot-07").filter((block) => block.content.asset_key === "video-slot-07-fact-find");
  }
  const slot = masterId.match(/^master-(slot-\d{2})$/)?.[1];
  if (!slot) throw new Error(`Unsupported video-evidence master id: ${masterId}`);
  return lessonVideoBlocks(slot);
}

function expectedNonPilotMasterIds() {
  const ids = lessons
    .map((lesson) => lesson.source_key.match(/(slot-\d{2})$/)?.[1])
    .filter((slot) => slot && !["slot-01", "slot-07", "slot-09"].includes(slot))
    .map((slot) => `master-${slot}`);
  ids.splice(5, 0, "master-poster-video-slot-07-fact-find");
  return ids;
}

async function validateVideoContactSheets() {
  if (
    videoContactSheets.schema_version !== "bmh-artwork-video-contact-sheets/v1" ||
    videoContactSheets.generator !== "ffmpeg fixed-ratio frames plus sharp lossless PNG tiling" ||
    JSON.stringify(videoContactSheets.frame_positions) !== JSON.stringify([0.2, 0.5, 0.8]) ||
    JSON.stringify(videoContactSheets.tile_dimensions) !== JSON.stringify([320, 180]) ||
    videoContactSheets.columns !== 3
  ) {
    throw new Error("Production video contact-sheet contract drifted");
  }
  const expectedIds = expectedNonPilotMasterIds();
  const records = videoContactSheets.records;
  if (
    !Array.isArray(records) ||
    records.length !== expectedIds.length ||
    JSON.stringify(records.map((record) => record.master_id)) !== JSON.stringify(expectedIds) ||
    new Set(records.map((record) => record.master_id)).size !== records.length
  ) {
    throw new Error("Production video contact sheets must cover all 17 non-pilot masters exactly once and in course order");
  }

  const byMasterId = new Map();
  const references = [];
  for (const record of records) {
    const expectedBlocks = mappedVideoBlocksForMaster(record.master_id);
    const expectedFrameCount = expectedBlocks.length * videoContactSheets.frame_positions.length;
    const expectedDimensions = [
      videoContactSheets.tile_dimensions[0] * videoContactSheets.columns,
      videoContactSheets.tile_dimensions[1] * Math.ceil(expectedFrameCount / videoContactSheets.columns),
    ];
    const input = record.contact_sheet_input;
    const contactSheetStem = path.basename(input?.path ?? "", ".png").replace(/-contact-sheet$/, "");
    if (
      input?.id !== `video-contact-sheet-${contactSheetStem}` ||
      input?.role !== "checksum-bound exact mapped-video contact sheet" ||
      !input.path?.startsWith("docs/course-production/thumbnail-pilots/references/production-video-stills/") ||
      !/^[a-f0-9]{64}$/.test(input.sha256 ?? "") ||
      JSON.stringify(input.dimensions) !== JSON.stringify(expectedDimensions) ||
      input.frame_count !== expectedFrameCount
    ) {
      throw new Error(`${record.master_id} contact-sheet metadata is invalid`);
    }
    const contactSheetBytes = await readFile(repoPath(input.path));
    if (
      sha256(contactSheetBytes) !== input.sha256 ||
      JSON.stringify(pngDimensions(contactSheetBytes, input.path)) !== JSON.stringify(expectedDimensions)
    ) {
      throw new Error(`${record.master_id} contact-sheet bytes do not match their checksum and dimensions`);
    }
    if (!Array.isArray(record.video_evidence) || record.video_evidence.length !== expectedBlocks.length) {
      throw new Error(`${record.master_id} source-video evidence does not match its mapped videos`);
    }
    for (const [index, block] of expectedBlocks.entries()) {
      const evidence = record.video_evidence[index];
      const asset = manifestAssets.get(block.content.asset_key);
      const expectedTimestamps = videoContactSheets.frame_positions.map((ratio) => Number((block.content.duration_seconds * ratio).toFixed(3)));
      if (
        !asset ||
        evidence?.asset_key !== asset.source_key ||
        evidence?.local_path !== asset.local_path ||
        evidence?.checksum_sha256 !== asset.checksum_sha256 ||
        evidence?.size_bytes !== asset.size_bytes ||
        evidence?.approval_status !== asset.approval_status ||
        evidence?.duration_seconds !== block.content.duration_seconds ||
        JSON.stringify(evidence?.frame_timestamps_seconds) !== JSON.stringify(expectedTimestamps)
      ) {
        throw new Error(`${record.master_id} video evidence ${index + 1} drifted from the exact mapped manifest source`);
      }
    }
    byMasterId.set(record.master_id, record);
    references.push(input);
  }
  return { byMasterId, references };
}

function validateToolEvidence(evidence, label) {
  const invokedAt = Date.parse(evidence?.invoked_at ?? "");
  const completedAt = Date.parse(evidence?.completed_at ?? "");
  if (
    !evidence?.thread_id ||
    !evidence?.agent_path ||
    !evidence?.invocation_call_id ||
    !evidence?.tool_output_call_id ||
    !evidence?.tool_output_id ||
    !Number.isFinite(invokedAt) ||
    !Number.isFinite(completedAt) ||
    completedAt < invokedAt
  ) {
    throw new Error(`${label} tool evidence is incomplete`);
  }
}

async function validateLineageInput(input, label, { requireId = false } = {}) {
  if (requireId && (!input?.id || !input?.role)) {
    throw new Error(`${label} must have a stable id and role`);
  }
  const contents = await readFile(repoPath(input.path));
  if (sha256(contents) !== input.sha256) {
    throw new Error(`${label} checksum changed: ${input.path}`);
  }
}

async function validateLineageOutput(output, label) {
  const outputContents = await readFile(repoPath(output.path));
  if (sha256(outputContents) !== output.sha256 || outputContents.length !== output.size_bytes || JSON.stringify(pngDimensions(outputContents, output.path)) !== JSON.stringify(output.dimensions)) {
    throw new Error(`${label} output checksum, size, or dimensions changed`);
  }
}

async function readAndValidatePrompt(promptPath, promptSha256, label, { exactBytes = false } = {}) {
  const promptBytes = await readFile(repoPath(promptPath), "utf8");
  const prompt = exactBytes ? promptBytes : promptBytes.replace(/\r?\n$/, "");
  if (sha256(prompt) !== promptSha256) {
    throw new Error(`${label} prompt checksum changed`);
  }
  return prompt;
}

async function validatePilotGenerationLineage() {
  const schemaVersion = pilotGenerationLineage.schema_version;
  if (
    schemaVersion !== "bmh-thumbnail-pilot-lineage/v1" &&
    schemaVersion !== "bmh-thumbnail-pilot-lineage/v2" &&
    schemaVersion !== "bmh-thumbnail-pilot-lineage/v3-candidate" &&
    schemaVersion !== "bmh-thumbnail-pilot-lineage/v4-candidate"
  ) {
    throw new Error("Pilot generation lineage schema is invalid");
  }
  const version = schemaVersion.endsWith("/v4-candidate") ? 4 : schemaVersion.endsWith("/v3-candidate") ? 3 : schemaVersion.endsWith("/v2") ? 2 : 1;
  if (pilotGenerationLineage.status !== "awaiting-jarrad-approval") {
    throw new Error("Pilot generation lineage must remain awaiting Jarrad approval");
  }
  if (!Array.isArray(pilotGenerationLineage.records)) {
    throw new Error("Pilot generation lineage records are missing");
  }
  const expectedSlugs = Object.values(pilotSlugBySlot);
  if (
    pilotGenerationLineage.records.length !== expectedSlugs.length ||
    new Set(pilotGenerationLineage.records.map((record) => record.slug)).size !== expectedSlugs.length ||
    expectedSlugs.some((slug) => !pilotGenerationLineage.records.some((record) => record.slug === slug))
  ) {
    throw new Error("Pilot generation lineage must cover each pilot exactly once");
  }

  const sharedParentsById = new Map();
  const v2InvocationIds = new Set();
  const v2ToolOutputIds = new Set();
  const promptBySlug = new Map();
  const referenceIdsBySlug = new Map();
  const additionalReferences = [];
  if (version >= 3) {
    const expectedIdentityRoots = new Map([
      ["andrea-approved", "docs/course-production/thumbnail-pilots/references/v5-cast/andrea-approved.png"],
      ["recurring-seller-approved", "docs/course-production/thumbnail-pilots/references/v5-cast/recurring-seller.png"],
    ]);
    const expectedCharacters = new Map([
      ["orientation", "andrea-approved"],
      ["opening-the-call", "andrea-approved"],
      ["objection-architecture", "recurring-seller-approved"],
    ]);
    const expectedVideoKeys = new Map([
      ["orientation", ["video-slot-01-welcome", "video-slot-01-mindset"]],
      ["opening-the-call", ["video-slot-07-opening", "video-slot-07-fact-find"]],
      ["objection-architecture", ["video-slot-09-objection-architecture"]],
    ]);
    if (
      pilotGenerationLineage.generator !== "built-in image_gen" ||
      pilotGenerationLineage.contract?.people_per_thumbnail !== 1 ||
      JSON.stringify(pilotGenerationLineage.contract?.allowed_characters) !== JSON.stringify(["andrea", "recurring-seller"]) ||
      pilotGenerationLineage.contract?.selection_rule !== "Andrea or the recurring seller, never both; the lesson and exact source video determine the character and cue" ||
      pilotGenerationLineage.contract?.skin_fill !== "pure white"
    ) {
      throw new Error(`Pilot lineage v${version} single-character identity contract drifted`);
    }
    if (!Array.isArray(pilotGenerationLineage.identity_roots) || pilotGenerationLineage.identity_roots.length !== 2 || new Set(pilotGenerationLineage.identity_roots.map((root) => root.id)).size !== 2) {
      throw new Error(`Pilot lineage v${version} requires exactly two honest identity roots`);
    }
    for (const root of pilotGenerationLineage.identity_roots) {
      if (expectedIdentityRoots.get(root.id) !== root.path) {
        throw new Error(`Pilot lineage v3 identity root is invalid: ${root.id}`);
      }
      await validateLineageInput(root, `Pilot identity root ${root.id}`);
      additionalReferences.push({
        id: root.id,
        role: root.id === "andrea-approved" ? "approved Andrea identity root" : "approved recurring seller identity root",
        path: root.path,
        sha256: root.sha256,
      });
    }
    const identityRootsById = new Map(pilotGenerationLineage.identity_roots.map((root) => [root.id, root]));
    const usedIdentityRoots = new Set();
    const poseLabels = new Set();
    const poseSignatures = new Set();
    for (const record of pilotGenerationLineage.records) {
      const expectedCharacterId = expectedCharacters.get(record.slug);
      const checksumRecord = pilotChecksums.assets.find((asset) => asset.slug === record.slug);
      if (!expectedCharacterId || record.character_id !== expectedCharacterId || !identityRootsById.has(record.character_id)) {
        throw new Error(`${record.slug} must use its exact approved character id`);
      }
      if ("character_ids" in record || Array.isArray(record.character_id)) {
        throw new Error(`${record.slug} violates the one-person character contract`);
      }
      if (version === 4) {
        if (typeof record.pose_label !== "string" || record.pose_label.length < 5 || poseLabels.has(record.pose_label)) {
          throw new Error(`${record.slug} must have a globally unique pose_label`);
        }
        if (typeof record.pose_signature !== "string" || record.pose_signature.length < 12 || poseSignatures.has(record.pose_signature)) {
          throw new Error(`${record.slug} must have a globally unique pose_signature`);
        }
        if (record.deterministic_character_lock !== undefined) {
          throw new Error(`${record.slug} v4 cannot use an identical-pixel character lock`);
        }
        poseLabels.add(record.pose_label);
        poseSignatures.add(record.pose_signature);
      }
      usedIdentityRoots.add(record.character_id);
      const expectedChecksumCharacter = expectedCharacterId === "andrea-approved" ? "andrea" : "recurring-seller";
      if (checksumRecord?.character !== expectedChecksumCharacter) {
        throw new Error(`${record.slug} checksum character binding drifted`);
      }
      validateBackgroundRgb(record.background_rgb, `${record.slug} background`);
      if (!Array.isArray(record.video_evidence) || record.video_evidence.length === 0) {
        throw new Error(`${record.slug} must retain exact source-video evidence`);
      }
      const expectedEvidence = expectedVideoKeys.get(record.slug).map((assetKey) => manifestAssets.get(assetKey));
      if (record.video_evidence.length !== expectedEvidence.length || expectedEvidence.some((asset) => !asset)) {
        throw new Error(`${record.slug} source-video evidence count drifted from the mapped lesson`);
      }
      for (const [index, evidence] of record.video_evidence.entries()) {
        const expectedAsset = expectedEvidence[index];
        if (
          evidence?.path !== expectedAsset.local_path ||
          evidence?.sha256 !== expectedAsset.checksum_sha256 ||
          !evidence.path.startsWith("course-assets/review-") ||
          !/^[a-f0-9]{64}$/.test(evidence.sha256 ?? "")
        ) {
          throw new Error(`${record.slug} video evidence ${index + 1} drifted from the exact mapped manifest source`);
        }
        repoPath(evidence.path);
      }
      await validateLineageInput(record.contact_sheet_input, `${record.slug} contact sheet`);
      additionalReferences.push({
        id: `v${version + 4}-${record.slug}-contact-sheet`,
        role: `${record.slug} source-video contact sheet`,
        path: record.contact_sheet_input.path,
        sha256: record.contact_sheet_input.sha256,
      });
      const generation = record.generation;
      const expectedOperation = record.slug === "orientation" ? "generate" : "edit";
      if (generation?.operation !== expectedOperation || !generation.tool_output_id?.startsWith("exec-")) {
        throw new Error(`${record.slug} generation record is invalid`);
      }
      const prompt = await readAndValidatePrompt(generation.prompt_path, generation.prompt_sha256, `${record.slug} v${version + 4} generation`, {
        exactBytes: true,
      });
      const outputContents = await readFile(repoPath(generation.output_path));
      if (
        sha256(outputContents) !== generation.output_sha256 ||
        generation.output_path !== checksumRecord?.source?.path ||
        generation.output_sha256 !== checksumRecord?.source?.sha256 ||
        JSON.stringify(pngDimensions(outputContents, generation.output_path)) !== JSON.stringify(checksumRecord?.source?.dimensions)
      ) {
        throw new Error(`${record.slug} v${version + 4} generation output does not match the checksum-locked source`);
      }
      if (expectedOperation === "edit") {
        const parentBytes = await readFile(repoPath(generation.parent_path));
        if (sha256(parentBytes) !== generation.parent_sha256 || generation.parent_sha256 === generation.output_sha256) {
          throw new Error(`${record.slug} edit parent lineage drifted`);
        }
      } else if (generation.parent_path !== undefined || generation.parent_sha256 !== undefined) {
        throw new Error(`${record.slug} initial generation cannot declare an edit parent`);
      }
      if (version === 3 && record.slug === "opening-the-call") {
        const lock = record.deterministic_character_lock;
        const orientation = pilotGenerationLineage.records.find((candidate) => candidate.slug === "orientation");
        if (
          lock?.source_path !== orientation?.generation?.output_path ||
          lock?.source_sha256 !== orientation?.generation?.output_sha256 ||
          !Array.isArray(lock.box) ||
          lock.box.length !== 4 ||
          lock.copied_character_pixels !== 94006 ||
          !/^[a-f0-9]{64}$/.test(lock.pixel_sha256 ?? "") ||
          lock.drift_pixels_flat_master !== 0 ||
          lock.drift_pixels_lesson_card !== 0
        ) {
          throw new Error("Opening v7 Andrea pixel lock drifted");
        }
      }
      if (version === 3 && record.slug === "objection-architecture" && record.deterministic_contour_normalization?.source_pixel_radius !== 1) {
        throw new Error("Objection v7 contour normalization drifted");
      }
      if (version === 4 && record.slug === "opening-the-call") {
        const normalization = record.deterministic_contour_normalization;
        if (
          normalization?.operation !== "erode black contours" ||
          normalization?.source_pixel_radius !== 1 ||
          normalization?.exposure !== "north-or-west-boundary" ||
          normalization?.replacement !== "eight-connected-majority-color" ||
          normalization?.removed_source_pixels !== 8331
        ) {
          throw new Error("Opening v8 contour normalization drifted");
        }
      }
      promptBySlug.set(record.slug, prompt);
      referenceIdsBySlug.set(record.slug, ["style-ref-1", "style-ref-2", record.character_id, `v${version + 4}-${record.slug}-contact-sheet`]);
    }
    if (usedIdentityRoots.size !== 2) {
      throw new Error(`Pilot lineage v${version} must keep both identity roots in honest use`);
    }
    if (version === 4) {
      const orientation = pilotGenerationLineage.records.find((record) => record.slug === "orientation");
      const opening = pilotGenerationLineage.records.find((record) => record.slug === "opening-the-call");
      if (orientation?.character_id !== "andrea-approved" || opening?.character_id !== "andrea-approved" || orientation.pose_signature === opening.pose_signature) {
        throw new Error("Pilot lineage v4 must keep Andrea's identity while changing her pose");
      }
    }
    return {
      version,
      sharedParentsById,
      promptBySlug,
      referenceIdsBySlug,
      additionalReferences,
    };
  }
  if (version === 2) {
    if (!Array.isArray(pilotGenerationLineage.shared_parents) || pilotGenerationLineage.shared_parents.length !== 1) {
      throw new Error("Pilot lineage v2 requires exactly one shared generated cast parent");
    }
    for (const parent of pilotGenerationLineage.shared_parents) {
      if (!parent?.id || sharedParentsById.has(parent.id)) {
        throw new Error("Pilot lineage v2 shared parent ids must be present and unique");
      }
      if (parent.operation !== "generate") {
        throw new Error(`${parent.id} shared parent operation must be generate`);
      }
      if (!Array.isArray(parent.inputs) || parent.inputs.length === 0) {
        throw new Error(`${parent.id} shared parent inputs are missing`);
      }
      await readAndValidatePrompt(parent.prompt_path, parent.prompt_sha256, parent.id);
      for (const input of parent.inputs) {
        await validateLineageInput(input, `${parent.id} shared parent input`, {
          requireId: true,
        });
      }
      validateToolEvidence(parent.tool_evidence, parent.id);
      v2InvocationIds.add(parent.tool_evidence.invocation_call_id);
      v2ToolOutputIds.add(parent.tool_evidence.tool_output_id);
      await validateLineageOutput(parent.output, parent.id);
      sharedParentsById.set(parent.id, parent);
    }
    if (new Set(pilotGenerationLineage.shared_parents.map((parent) => parent.output.sha256)).size !== pilotGenerationLineage.shared_parents.length) {
      throw new Error("Pilot lineage v2 shared parent outputs must be unique");
    }
  } else if (pilotGenerationLineage.shared_parents !== undefined) {
    throw new Error("Pilot lineage v1 cannot declare shared generated parents");
  }

  for (const record of pilotGenerationLineage.records) {
    const checksumRecord = pilotChecksums.assets.find((asset) => asset.slug === record.slug);
    if (!checksumRecord || !Array.isArray(record.steps) || record.steps.length === 0) {
      throw new Error(`Pilot generation lineage is incomplete for ${record.slug}`);
    }

    const sharedParent = version === 2 ? sharedParentsById.get(record.shared_parent_id) : null;
    if (version === 2 && !sharedParent) {
      throw new Error(`${record.slug} does not resolve a shared generated parent`);
    }
    const renderContract = version === 2 ? record.render_contract : null;
    if (version === 2) {
      validateBackgroundRgb(renderContract?.master_background_rgb, `${record.slug} master background`);
      validateBackgroundRgb(renderContract?.lesson_card?.normalize_background_rgb, `${record.slug} lesson-card normalization background`);
      validateBackgroundRgb(renderContract?.lesson_card?.padding_color_rgb, `${record.slug} lesson-card padding`);
      validateBackgroundRgb(renderContract?.video_poster?.normalize_background_rgb, `${record.slug} video-poster normalization background`);
    }

    let priorOutput = version === 2 ? sharedParent.output : null;
    for (const [index, step] of record.steps.entries()) {
      if (step.step !== index + 1) {
        throw new Error(`${record.slug} generation lineage is out of order`);
      }
      const expectedOperation = version === 2 ? "edit" : index === 0 ? "generate" : "edit";
      if (step.operation !== expectedOperation) {
        throw new Error(`${record.slug} generation lineage operation is invalid`);
      }
      const prompt = await readAndValidatePrompt(step.prompt_path, step.prompt_sha256, `${record.slug} generation`);
      if (!Array.isArray(step.inputs) || step.inputs.length === 0) {
        throw new Error(`${record.slug} generation inputs are missing`);
      }
      for (const input of step.inputs) {
        await validateLineageInput(input, `${record.slug} generation input`, {
          requireId: version === 2,
        });
      }
      if ((version === 2 || index > 0) && (step.inputs[0]?.sha256 !== priorOutput?.sha256 || step.inputs[0]?.path !== priorOutput?.path)) {
        throw new Error(`${record.slug} edit step is not tied to the prior output`);
      }
      if (version === 2 && index === 0 && (step.parent_source_sha256 !== sharedParent.output.sha256 || step.inputs[0]?.id !== record.shared_parent_id)) {
        throw new Error(`${record.slug} first edit is not bound to its shared generated parent`);
      }
      if (version === 2 && index > 0 && step.parent_source_sha256 !== priorOutput.sha256) {
        throw new Error(`${record.slug} edit parent checksum is out of order`);
      }

      validateToolEvidence(step.tool_evidence, `${record.slug} generation`);
      if (version === 2 && (v2InvocationIds.has(step.tool_evidence.invocation_call_id) || v2ToolOutputIds.has(step.tool_evidence.tool_output_id))) {
        throw new Error(`${record.slug} reuses image-generation tool evidence`);
      }
      if (version === 2) {
        v2InvocationIds.add(step.tool_evidence.invocation_call_id);
        v2ToolOutputIds.add(step.tool_evidence.tool_output_id);
      }
      await validateLineageOutput(step.output, `${record.slug} generation`);
      priorOutput = step.output;
      if (index === 0) {
        promptBySlug.set(record.slug, prompt);
        referenceIdsBySlug.set(
          record.slug,
          step.inputs.map((input) => input.id),
        );
      }
    }

    const terminal = record.steps.at(-1).output;
    if (record.terminal_output_sha256 !== terminal.sha256 || terminal.sha256 !== checksumRecord.source.sha256 || terminal.path !== checksumRecord.source.path) {
      throw new Error(`${record.slug} terminal generation output does not match the review source`);
    }
  }
  return {
    version,
    sharedParentsById,
    promptBySlug,
    referenceIdsBySlug,
    additionalReferences,
  };
}

function buildProvenance(plannedGenerationCallId, generationCall) {
  return {
    generator: "built-in image_gen",
    generation_call: generationCall,
    planned_generation_call_id: plannedGenerationCallId,
    source_capture_required: true,
    prompt_checksum_required: true,
    reference_checksums_required: true,
    generated_at_required: true,
    generated_by_required: true,
    model_output_path_required: true,
  };
}

const blockedApproval = {
  status: "blocked-pending-pilot-approval",
  approved_by: null,
  approved_at: null,
  evidence: null,
};

const pilotSlugBySlot = {
  "slot-01": "orientation",
  "slot-07": "opening-the-call",
  "slot-09": "objection-architecture",
};

const pilotLineageContract = await validatePilotGenerationLineage();
const usesSharedPilotLineage = pilotLineageContract.version === 2;
const usesLockedPilotContract = pilotLineageContract.version >= 2;
const usesTwoIdentityPilotLineage = pilotLineageContract.version >= 3;
const usesPoseVariationPilotLineage = pilotLineageContract.version === 4;

const pilotReferences = usesTwoIdentityPilotLineage
  ? [...baseReferences.filter((reference) => reference.id === "style-ref-1" || reference.id === "style-ref-2"), ...pilotLineageContract.additionalReferences]
  : usesSharedPilotLineage
    ? (() => {
        const collected = new Map(baseReferences.filter((reference) => reference.id === "style-ref-1" || reference.id === "style-ref-2").map((reference) => [reference.id, reference]));
        for (const parent of pilotLineageContract.sharedParentsById.values()) {
          for (const input of parent.inputs) {
            const existing = collected.get(input.id);
            if (existing && (existing.path !== input.path || existing.sha256 !== input.sha256)) {
              throw new Error(`Pilot lineage v2 reference id drifted: ${input.id}`);
            }
            collected.set(input.id, {
              id: input.id,
              role: input.role,
              path: input.path,
              sha256: input.sha256,
            });
          }
          collected.set(parent.id, {
            id: parent.id,
            role: "shared generated cast parent",
            path: parent.output.path,
            sha256: parent.output.sha256,
          });
        }
        for (const record of pilotGenerationLineage.records) {
          for (const step of record.steps) {
            for (const input of step.inputs) {
              const existing = collected.get(input.id);
              if (existing && (existing.path !== input.path || existing.sha256 !== input.sha256)) {
                throw new Error(`Pilot lineage v2 reference id drifted: ${input.id}`);
              }
              if (!existing) {
                collected.set(input.id, {
                  id: input.id,
                  role: input.role,
                  path: input.path,
                  sha256: input.sha256,
                });
              }
            }
          }
        }
        return [...collected.values()];
      })()
    : baseReferences;

const videoContactSheetContract = await validateVideoContactSheets();
const references = [...pilotReferences, ...videoContactSheetContract.references];
if (new Set(references.map((reference) => reference.id)).size !== references.length) {
  throw new Error("Artwork reference ids must be globally unique");
}

for (const reference of references) {
  const contents = await readFile(path.join(repoRoot, reference.path));
  const actualSha256 = sha256(contents);
  if (actualSha256 !== reference.sha256) {
    throw new Error(`Reference ${reference.id} SHA-256 mismatch: ${actualSha256} != ${reference.sha256}`);
  }
}

const pilotApproval = {
  status: "awaiting-jarrad-approval",
  approved_by: null,
  approved_at: null,
  evidence: null,
};

const pilotPrompts = {
  "slot-01": `Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Orientation thumbnail for a new employee beginning BMH Institute. Show an iconic welcoming BMH training building as one large central sticker, with a simple open doorway, a tiny new learner approaching, a small compass, checklist, and upward path markers floating as separate supporting stickers. The five-second read should be “welcome, direction, begin training.”
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for the recognizable BMH building only. Preserve the flat sticker language from Images 1–2 and simplify the building from Image 3 into an icon rather than a realistic scene.
Scene/backdrop: uninterrupted flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object is an individually croppable sticker
Composition/framing: large building sticker centered slightly right, tiny learner and open-door cue lower left, small compass/checklist/path marks balanced around it; keep all meaningful content inside the central 80% so both 16:9 and 16:10 crops remain intact
Color palette: cornflower blue, golden yellow, orange, cream, white, black, and at most one muted green; 6–8 flat colors maximum
Characters: tiny scale, dot eyes, minimal face, cylindrical limbs, simple silhouette
Constraints: no title, no words, no letters, no logos, no watermark; flat fills only; strong silhouettes; uniform complexity; decorative doodles limited to a few purposeful sparkles and motion marks
Avoid: gradients, texture, lighting, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed architecture, busy interiors, edge-cropped key objects`,
  "slot-07": `Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Opening the Call thumbnail. The five-second read must be “start a confident, human phone conversation.” Use a large friendly telephone handset as the hero sticker bridging two simple speech bubbles, with a tiny headset-wearing employee on one side and a tiny homeowner on the other. Add a small open-door icon and a few purposeful sound-wave marks as supporting stickers.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for phone icon shapes only. Match the loose flat sticker-sheet language of Images 1–2; simplify the phones from Image 3 and do not reproduce a scene.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous room or environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object is independently croppable
Composition/framing: large curved handset near center linking left and right speech bubbles; tiny employee and homeowner separated but visibly connected through the call; open-door icon and sound marks balanced around the hero; keep meaningful content inside the central 80% for safe 16:9 and 16:10 crops
Color palette: cornflower blue, golden yellow, orange, cream, white, and black only; 6 flat colors maximum
Characters: tiny scale, dot eyes, minimal faces, cylindrical limbs, simple hair silhouettes, one headset prop
Constraints: no title, no words, no letters, no numbers, no logos, no watermark; absolutely uniform flat fills; no white sticker border; strong silhouettes; uniform complexity; decorative rhythm limited to speech bubbles, sound marks, and two sparkles
Avoid: any gradient, texture, lighting, glow, shadow, reflection, depth, realistic perspective, photorealism, 3D rendering, detailed smartphone interface, busy interiors, edge-cropped key objects`,
  "slot-09": `Use case: stylized-concept
Asset type: BMH Institute lesson-thumbnail pilot, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the Objection Architecture thumbnail. The five-second read must be “hear an objection, reframe it, build a calm response.” Use a large central bridge or modular arch assembled from three chunky sticker blocks: an ear icon on the left block, a curved reframe arrow on the center block, and a calm speech bubble with a check mark on the right block. Include a tiny thoughtful phone rep below the arch and two small floating puzzle-piece/support-beam icons.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references; Image 3 is a subject reference for the thoughtful phone-rep character only. Preserve the flat, loose sticker-sheet language of Images 1–2, simplify the character from Image 3, and do not reproduce a scene.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; floating sticker composition, never a continuous room, construction site, or environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; every object independently croppable
Composition/framing: three-block arch centered and instantly legible left-to-right; small rep below but not touching an edge; support icons and a few purposeful doodle marks around it; keep all meaningful content inside central 80% for safe 16:9 and 16:10 crops
Color palette: cornflower blue, golden yellow, orange, cream, white, and black only; 6 flat colors maximum
Characters: one tiny rep with dot eyes, minimal facial features, cylindrical limbs, light hair, orange goggles resting on head, phone prop
Constraints: no title, no words, no letters, no numbers, no logos, no watermark; absolutely uniform flat fills; no white sticker border; strong silhouettes; uniform complexity; the three-step visual logic must be obvious without labels
Avoid: any gradient, texture, lighting, glow, shadow, reflection, depth, realistic perspective, photorealism, 3D rendering, complex diagrams, busy masonry, detailed interiors, edge-cropped key objects`,
};

const factFindArtDirection = getArtworkPose("master-poster-video-slot-07-fact-find");
const factFindPosterPrompt = `Use case: stylized-concept
Asset type: BMH Institute Fact Find video-poster master, wide 16:9 artwork generated independently from the Opening the Call lesson-card master
Primary request: Create a focused Fact Find illustration. The five-second read must be “ask with curiosity, listen carefully, and organize the seller facts.” Show a large listening ear, a magnifier, and a clean fact checklist made only from unlabeled lines and check marks. This image must stand on its own as the Fact Find video poster and must not reuse the Opening the Call pilot composition.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references. Image 3 is the approved Andrea identity root. Use it to preserve Andrea's exact face, hair, proportions, clothing language, pure-white skin fill, and line weight while changing her pose. Image 4 is the checksum-bound contact sheet extracted from the exact mapped Fact Find video; use its lesson-specific setting, props, action, and visual emphasis as the content source without copying a still literally. Do not copy another asset's stance or layout.
Character direction: ${factFindArtDirection.pose_instruction}
Lesson/video cue: ${factFindArtDirection.lesson_or_video_cue}.
Scene/backdrop: perfectly uniform flat golden-yellow field with generous active negative space; a floating sticker composition, never a continuous room or realistic environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; strong simple silhouettes; every object independently croppable
Composition/framing: center the listening conversation, keep the ear and magnifier as clearly separate supporting stickers, and place the fact checklist to the right; keep every meaningful object inside the central 80% so the complete 16:9 master can be used without a crop
Color palette: cornflower blue, golden yellow, amber, orange, cream, white, black, and at most one muted green; exactly the locked eight-color palette after deterministic flattening; no extra colors
Characters: exactly one person, Andrea, with pure-white skin fill; no seller and no second person
Constraints: no title, no words, no letters, no numbers, no currency amounts, no logos, no watermark; absolutely uniform flat fills; no white sticker border; no invented software interface; no fixed performance promises; no reuse of the Opening the Call hero handset composition or seated desk stance
Avoid: gradients, texture, lighting, glow, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed screens, tiny unreadable symbols, busy backgrounds, edge-cropped key objects, sales-pressure imagery, and unrelated lesson subjects`;

const lessonSpecs = [
  {
    slot: "slot-01",
    title: "Welcome and Mindset",
    pilot: true,
    references: ["style-ref-1", "style-ref-2", "orientation-building"],
    fiveSecondRead: "welcome, direction, and the calm service mindset",
    scene: "a welcoming training building, learner, compass, checklist, and steady path",
    anchors: [
      ["welcome at the open training doorway", "full-safe"],
      ["learner choosing a steady compass-led path", "left-safe"],
    ],
  },
  {
    slot: "slot-02",
    title: "Real Estate Terms Glossary",
    fiveSecondRead: "turn unfamiliar real estate language into clear shared meaning",
    scene: "an open reference book surrounded by a house, key, contract page, map pin, and speech bubble stickers",
    anchors: [["plain-language real estate reference kit", "full-safe"]],
  },
  {
    slot: "slot-03",
    title: "Tech Stack and Systems",
    fiveSecondRead: "use connected tools as one reliable operating system",
    scene: "a central hub linking a lead card, phone, task checklist, coaching headset, and clean dashboard stickers",
    anchors: [["connected tool hub and reliable handoffs", "full-safe"]],
  },
  {
    slot: "slot-04",
    title: "Humanizing the Lead",
    fiveSecondRead: "see the person and situation before the property",
    scene: "three separate human-first stickers: a homeowner beside a small house, an unfolding story path, and a calm fit lens aligning person, property, and timing",
    anchors: [
      ["homeowner before property details", "left-safe"],
      ["seller story and situation path", "center-safe"],
      ["ideal seller fit lens", "right-safe"],
    ],
  },
  {
    slot: "slot-05",
    title: "The BMH Offer Playbook",
    fiveSecondRead: "match a seller situation to a clear respectful option",
    scene: "two balanced offer stations: a situation-to-option scale and a choice path ending in a calm handshake",
    anchors: [
      ["situation-to-option balance", "left-safe"],
      ["clear choice path and respectful agreement", "right-safe"],
    ],
  },
  {
    slot: "slot-06",
    title: "Sales Pipeline and Stage Ownership",
    fiveSecondRead: "move each conversation through clear owned stages",
    scene: "a pipeline of distinct stage cards passed with a baton, beside a five-step stepping-stone conversation path",
    anchors: [
      ["owned pipeline stages and baton handoff", "left-safe"],
      ["five-step conversation path", "right-safe"],
    ],
  },
  {
    slot: "slot-07",
    title: "Opening the Call",
    pilot: true,
    references: ["style-ref-1", "style-ref-2", "opening-phone-shapes"],
    fiveSecondRead: "start a confident human call and uncover the facts",
    scene: "a friendly handset linking an employee and homeowner, with speech bubbles, an open door, and a small fact-finding checklist",
    anchors: [
      ["confident human call opening", "full-safe"],
      ["curious fact-finding conversation", "right-safe"],
    ],
  },
  {
    slot: "slot-08",
    title: "Discovery and Handoff",
    fiveSecondRead: "listen deeply then transfer clear context without dropping it",
    scene: "a listening magnifier uncovering a seller need, beside two teammates passing a complete context folder across a short bridge",
    anchors: [
      ["listening-led discovery", "left-safe"],
      ["complete context handoff", "right-safe"],
    ],
  },
  {
    slot: "slot-09",
    title: "Objection Architecture",
    pilot: true,
    references: ["style-ref-1", "style-ref-2", "objection-character"],
    fiveSecondRead: "hear, reframe, and build a calm response",
    scene: "a modular arch built from an ear, reframe arrow, and checked speech bubble, with a thoughtful phone rep",
    anchors: [["hear reframe and respond architecture", "full-safe"]],
  },
  {
    slot: "slot-10",
    title: "Objection Scripts Playbook",
    fiveSecondRead: "use a flexible response tool without sounding robotic",
    scene: "a compact toolbox holding modular speech-bubble cards, an ear, a curved response arrow, and a calm rep",
    anchors: [["flexible objection response toolbox", "full-safe"]],
  },
  {
    slot: "slot-11",
    title: "Complex Objections",
    fiveSecondRead: "untangle layered concerns while preserving trust",
    scene: "a rep calmly untangling a knot of house, clock, contract, and price symbols, beside a shield-shaped bridge connecting two people",
    anchors: [
      ["untangling layered objections", "left-safe"],
      ["trust and people bridge", "right-safe"],
    ],
  },
  {
    slot: "slot-12",
    title: "Seller FAQ Decoder",
    fiveSecondRead: "decode common seller questions into clear helpful answers",
    scene: "two question clusters connected to an answer lens: one around process and timing, one around property, contract, and next steps",
    anchors: [
      ["process and timing question cluster", "left-safe"],
      ["property contract and next-step question cluster", "right-safe"],
    ],
  },
  {
    slot: "slot-13",
    title: "Follow-Up Cadence",
    fiveSecondRead: "follow up consistently with purpose and respect",
    scene: "a calendar loop connecting a phone, message bubble, task check, and pause marker around one calm homeowner",
    anchors: [["purposeful respectful follow-up loop", "full-safe"]],
  },
  {
    slot: "slot-14",
    title: "Conversation Flow Mastery",
    fiveSecondRead: "guide a natural conversation from opening to clear next step",
    scene: "a flowing path of listening, discovery, option, agreement, and next-step stickers led by one calm rep",
    anchors: [["natural conversation flow from listen to next step", "full-safe"]],
  },
  {
    slot: "slot-15",
    title: "Closing and Deal Engineering",
    fiveSecondRead: "assemble a sound agreement that works for both sides",
    scene: "two sides of a bridge joined by contract, calendar, house, and handshake puzzle pieces with a final fit check",
    anchors: [["sound agreement and deal-fit bridge", "full-safe"]],
  },
  {
    slot: "slot-16",
    title: "KPIs and Sales Telemetry",
    fiveSecondRead: "use quality signals to improve the work without chasing vanity numbers",
    scene: "a clean signal dashboard with a gauge, conversation-quality waveform, funnel, coaching magnifier, and improvement arrow",
    anchors: [["quality signals coaching and improvement", "full-safe"]],
  },
  {
    slot: "slot-17",
    title: "Compensation Engine",
    fiveSecondRead: "understand how role expectations and verified outcomes connect to the current written plan",
    scene: "a written role sheet connected by gears to quality work, verified outcome, and review check stickers, with no money symbols",
    anchors: [["written role plan linked to verified outcomes", "full-safe"]],
  },
  {
    slot: "slot-18",
    title: "Operator Playbook and Daily Mission Control",
    fiveSecondRead: "own the daily operating rhythm and keep priorities visible",
    scene: "an operator station with an ownership checklist, beside a mission-control board linking calendar, calls, tasks, pipeline, and coaching",
    anchors: [
      ["operator ownership checklist", "left-safe"],
      ["daily mission-control board", "right-safe"],
    ],
  },
  {
    slot: "slot-19",
    title: "Career Growth Path",
    fiveSecondRead: "build capability through practice feedback and increasing ownership",
    scene: "a learner climbing broad steps marked only by practice, coaching, capability, and ownership icons toward a guiding beacon",
    anchors: [["practice coaching capability and ownership path", "full-safe"]],
  },
];

function buildPrompt(spec) {
  if (usesLockedPilotContract && spec.pilot) {
    const prompt = pilotLineageContract.promptBySlug.get(pilotSlugBySlot[spec.slot]);
    if (!prompt) throw new Error(`${spec.slot} pilot prompt is missing from locked lineage`);
    return prompt;
  }
  if (pilotPrompts[spec.slot]) return pilotPrompts[spec.slot];
  const artDirection = getArtworkPose(`master-${spec.slot}`);
  const characterName = artDirection.character_id === "andrea-approved" ? "Andrea" : "the recurring curly-haired seller";
  const anchorSentence = spec.anchors
    .map(([subject, crop], index) => {
      const placement = crop.startsWith("left") ? "left" : crop.startsWith("right") ? "right" : "center";
      return `poster anchor ${index + 1} is ${subject} in the ${placement} safe zone`;
    })
    .join("; ");

  return `Use case: stylized-concept
Asset type: BMH Institute ${spec.title} lesson master, wide 16:9 artwork designed for one 16:10 lesson card and distinct 16:9 video posters
Primary request: Create the ${spec.title} lesson illustration. The five-second read must be “${spec.fiveSecondRead}.” Build the visual around ${spec.scene}. Each requested poster anchor must be visually independent and recognizable without labels.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references. Image 3 is the approved ${characterName} identity root. Use it to preserve the exact face, hair, proportions, clothing language, pure-white skin fill, and line weight while changing pose, posture, and placement. Image 4 is the checksum-bound contact sheet extracted from every exact video mapped to this lesson; use its lesson-specific setting, props, action, and visual emphasis as the content source without copying a still literally. Do not copy another asset's stance or layout.
Character direction: ${artDirection.pose_instruction}
Lesson/video cue: ${artDirection.lesson_or_video_cue}.
Scene/backdrop: perfectly uniform flat ${artDirection.background_rgb.join(",") === YELLOW_RGB.join(",") ? "golden-yellow" : "cornflower-blue"} field with generous active negative space; a floating sticker composition, never a continuous room, landscape, or realistic environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; strong silhouettes; every object independently croppable
Composition/framing: ${anchorSentence}; balance the anchors as one coherent lesson composition; keep all meaningful content inside the central 80% and each named anchor fully inside its assigned safe zone so the 16:10 padded card and focused 16:9 poster crops stay intact
Color palette: cornflower blue, golden yellow, amber, orange, cream, white, black, and at most one muted green; exactly the locked eight-color palette after deterministic flattening; no extra colors
Characters: exactly one person, ${characterName}, with pure-white skin fill; no second person, crowd, duplicate, background figure, or partial extra person
Constraints: no title, no words, no letters, no numbers, no currency amounts, no logos, no watermark; absolutely uniform flat fills; no white sticker border; no invented software interface; no fixed performance promises; no decorative object without a teaching purpose
Avoid: repeated stance or repeated character placement from another master, gradients, texture, lighting, glow, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed screens, tiny unreadable symbols, busy backgrounds, edge-cropped key objects, duplicated poster anchors, and subject matter from another lesson`;
}

function assertAsset(assetKey, localPath) {
  const asset = manifestAssets.get(assetKey);
  if (!asset) throw new Error(`Manifest is missing ${assetKey}`);
  if (asset.local_path !== localPath) {
    throw new Error(`${assetKey} path mismatch: ${asset.local_path} != ${localPath}`);
  }
  if (!["missing", "approved"].includes(asset.approval_status)) {
    throw new Error(`${assetKey} has unsupported artwork approval status ${asset.approval_status}`);
  }
  if (asset.approval_status === "approved") {
    if (!/^[a-f0-9]{64}$/.test(asset.checksum_sha256 ?? "")) {
      throw new Error(`${assetKey} approved artwork is missing a valid SHA-256`);
    }
    if (!Number.isSafeInteger(asset.size_bytes) || asset.size_bytes <= 0) {
      throw new Error(`${assetKey} approved artwork is missing a valid size`);
    }
    if (!asset.storage_path.includes(asset.checksum_sha256)) {
      throw new Error(`${assetKey} approved artwork storage path is not checksum-addressed`);
    }
  }
}

const inventoryLessons = lessonSpecs.map((spec, index) => {
  const lesson = lessons[index];
  if (!lesson || lesson.title !== spec.title) {
    throw new Error(`${spec.slot} title mismatch: expected ${spec.title}, got ${lesson?.title}`);
  }
  const videoBlocks = lesson.blocks.filter((block) => block.type === "video");
  if (videoBlocks.length !== spec.anchors.length) {
    throw new Error(`${spec.slot} video and poster-anchor counts differ`);
  }

  const cardPath = `course-assets/thumbnails/${spec.slot}.webp`;
  assertAsset(lesson.thumbnail_asset_key, cardPath);
  const pilotSlug = spec.pilot ? pilotSlugBySlot[spec.slot] : null;
  const pilotLineage = pilotSlug ? pilotGenerationLineage.records.find((record) => record.slug === pilotSlug) : null;
  const productionVideoEvidence = videoContactSheetContract.byMasterId.get(`master-${spec.slot}`);
  const pilotContactSheetInput =
    usesLockedPilotContract && pilotLineage
      ? {
          id: `v${pilotLineageContract.version + 4}-${pilotSlug}-contact-sheet`,
          role: `${pilotSlug} source-video contact sheet`,
          ...pilotLineage.contact_sheet_input,
        }
      : null;
  const videoEvidence = pilotLineage?.video_evidence ?? productionVideoEvidence?.video_evidence;
  const contactSheetInput = pilotContactSheetInput ?? productionVideoEvidence?.contact_sheet_input;
  if (!videoEvidence?.length || !contactSheetInput) {
    throw new Error(`master-${spec.slot} lacks required exact source-video evidence`);
  }
  const artDirection = getArtworkPose(`master-${spec.slot}`);
  if (usesPoseVariationPilotLineage && pilotLineage && (pilotLineage.pose_label !== artDirection.pose_id || pilotLineage.pose_signature !== artDirection.lineage_pose_signature)) {
    throw new Error(`${spec.slot} pilot pose does not match the production pose contract`);
  }
  const renderContract =
    usesSharedPilotLineage && pilotLineage
      ? pilotLineage.render_contract
      : usesTwoIdentityPilotLineage && pilotLineage
        ? {
            master_background_rgb: pilotLineage.background_rgb,
            lesson_card: {
              normalize_background_rgb: pilotLineage.background_rgb,
              padding_color_rgb: pilotLineage.background_rgb,
            },
            video_poster: {
              normalize_background_rgb: pilotLineage.background_rgb,
            },
          }
        : {
            master_background_rgb: artDirection.background_rgb,
            lesson_card: {
              normalize_background_rgb: artDirection.background_rgb,
              padding_color_rgb: artDirection.background_rgb,
            },
            video_poster: { normalize_background_rgb: artDirection.background_rgb },
          };
  const lessonReferenceIds =
    usesLockedPilotContract && pilotSlug
      ? pilotLineageContract.referenceIdsBySlug.get(pilotSlug)
      : [...new Set([...(spec.references ?? ["style-ref-1", "style-ref-2"]), artDirection.character_id, contactSheetInput.id])];
  const prompt = buildPrompt(spec);
  const plannedGenerationCallId = spec.pilot ? null : `imagegen-lesson-${spec.slot}`;
  const lessonProvenance = buildProvenance(plannedGenerationCallId, spec.pilot ? "promote-existing-pilot-call" : "one-distinct-call");

  const master = {
    id: `master-${spec.slot}`,
    source_path: `course-assets/thumbnails/production/sources/${spec.slot}-generated.png`,
    flat_master_path: `course-assets/thumbnails/production/flat-masters/${spec.slot}-flat-master.png`,
    ...(usesLockedPilotContract ? { background_rgb: renderContract.master_background_rgb } : {}),
    art_direction: artDirection,
    expected_aspect_ratio: "16:9",
    meaningful_content_bounds: {
      x_min_percent: 10,
      x_max_percent: 90,
      y_min_percent: 10,
      y_max_percent: 90,
    },
    production_record: createEmptyProductionRecord(),
    video_evidence: videoEvidence,
    contact_sheet_input: contactSheetInput,
  };

  const posters = videoBlocks.map((block, posterIndex) => {
    const [focusSubject, cropProfile] = spec.anchors[posterIndex];
    const assetKey = block.content.poster_asset_key;
    const outputPath = `course-assets/posters/${block.content.asset_key}.webp`;
    assertAsset(assetKey, outputPath);
    const isFactFind = assetKey === "poster-video-slot-07-fact-find";
    const posterArtDirection = getArtworkPose(isFactFind ? "master-poster-video-slot-07-fact-find" : master.id);
    const factFindVideoEvidence = isFactFind
      ? videoContactSheetContract.byMasterId.get("master-poster-video-slot-07-fact-find")
      : null;
    const directMaster = isFactFind
      ? {
          id: "master-poster-video-slot-07-fact-find",
          source_path: "course-assets/posters/production/sources/video-slot-07-fact-find-generated.png",
          flat_master_path: "course-assets/posters/production/flat-masters/video-slot-07-fact-find-flat-master.png",
          ...(usesLockedPilotContract ? { background_rgb: posterArtDirection.background_rgb } : {}),
          art_direction: posterArtDirection,
          expected_aspect_ratio: "16:9",
          reference_ids: ["style-ref-1", "style-ref-2", posterArtDirection.character_id, factFindVideoEvidence.contact_sheet_input.id],
          video_evidence: factFindVideoEvidence.video_evidence,
          contact_sheet_input: factFindVideoEvidence.contact_sheet_input,
          prompt: factFindPosterPrompt,
          prompt_sha256: sha256(factFindPosterPrompt),
          provenance: buildProvenance("imagegen-poster-video-slot-07-fact-find", "one-distinct-call"),
          production_record: createEmptyProductionRecord(),
        }
      : null;
    const posterProvenance = directMaster?.provenance ?? lessonProvenance;
    const effectiveCropProfile = directMaster ? "full-safe" : cropProfile;
    return {
      asset_key: assetKey,
      video_asset_key: block.content.asset_key,
      // The approved welcome poster recipe is checksum-bound to its historical
      // production title. Keep that lineage label stable while the learner-facing
      // course title remains free to use the role-agnostic service wording.
      video_title: block.content.asset_key === "video-slot-01-welcome"
        ? "Welcome and the Navigator's Playbook"
        : block.content.title,
      output_path: outputPath,
      focus_subject: focusSubject,
      art_direction: posterArtDirection,
      production_source_mode: directMaster ? "generate-distinct-after-pilot-approval" : "derive-from-lesson-master",
      direct_master: directMaster,
      derivative: {
        recipe_id: `${spec.slot}-${block.content.asset_key}-${effectiveCropProfile}`,
        source_master_id: directMaster?.id ?? master.id,
        crop_profile: effectiveCropProfile,
        normalize_master_dimensions: [1280, 720],
        normalize_method: "contain-with-padding",
        normalize_background_rgb: directMaster ? posterArtDirection.background_rgb : renderContract.video_poster.normalize_background_rgb,
        crop_pixels_after_normalize: {
          "full-safe": [0, 0, 1280, 720],
          "left-safe": [64, 144, 768, 432],
          "center-safe": [256, 144, 768, 432],
          "right-safe": [448, 144, 768, 432],
        }[effectiveCropProfile],
        target_dimensions: [1280, 720],
        resample: "lanczos",
        output_format: "lossless-webp",
        duplicate_pixel_sha256_forbidden: true,
        visual_subject_confirmation_required: true,
      },
      provenance: posterProvenance,
      approval: blockedApproval,
    };
  });

  return {
    slot: spec.slot,
    lesson_source_key: lesson.source_key,
    title: spec.title,
    pilot: Boolean(spec.pilot),
    production_source_mode: spec.pilot ? "promote-approved-pilot-flat-master" : "generate-after-pilot-approval",
    reference_ids: lessonReferenceIds,
    art_direction: artDirection,
    prompt,
    prompt_sha256: sha256(prompt),
    master,
    lesson_card: {
      asset_key: lesson.thumbnail_asset_key,
      output_path: cardPath,
      art_direction: artDirection,
      derivative: {
        recipe_id: `${spec.slot}-lesson-card-16x10`,
        source_master_id: master.id,
        target_dimensions: [1280, 800],
        method: "contain-master-in-1280x720-and-pad-40px-top-and-bottom",
        normalize_master_dimensions: [1280, 720],
        normalize_method: "contain-with-padding",
        normalize_background_rgb: renderContract.lesson_card.normalize_background_rgb,
        padding_color_rgb: renderContract.lesson_card.padding_color_rgb,
        crop_allowed: false,
        resample: "lanczos",
        output_format: "lossless-webp",
      },
      provenance: lessonProvenance,
      approval: blockedApproval,
    },
    posters,
    pilot_review: spec.pilot
      ? {
          slug: pilotSlug,
          status: pilotChecksums.status,
          assets: pilotChecksums.assets.find((asset) => asset.slug === pilotSlug),
          checksum_record_path: pilotChecksumsRecordPath,
          generation_lineage_record_path: pilotGenerationLineageRecordPath,
          generation_lineage: pilotLineage,
          ...(usesLockedPilotContract
            ? {
                lineage_schema_version: pilotGenerationLineage.schema_version,
                ...(usesSharedPilotLineage
                  ? {
                      shared_generation_parent: pilotLineageContract.sharedParentsById.get(pilotLineage.shared_parent_id),
                    }
                  : {
                      identity_contract: pilotGenerationLineage.contract,
                      identity_roots: pilotGenerationLineage.identity_roots,
                    }),
              }
            : {}),
        }
      : null,
    provenance: lessonProvenance,
    approval: spec.pilot ? pilotApproval : blockedApproval,
  };
});

const coverPath = "course-assets/thumbnails/program-bmh-employee-training.webp";
assertAsset(course.thumbnail_asset_key, coverPath);
const courseCoverArtDirection = getArtworkPose("master-program-bmh-employee-training");

const inventory = {
  schema_version: usesPoseVariationPilotLineage
    ? "bmh-artwork-production/v4-candidate"
    : usesTwoIdentityPilotLineage
      ? "bmh-artwork-production/v3-candidate"
      : usesSharedPilotLineage
        ? "bmh-artwork-production/v2"
        : "bmh-artwork-production/v1",
  status: "blocked-pending-pilot-approval",
  generation_policy: {
    gate: "Jarrad must approve all three pilots before any new image generation",
    generator: "built-in image_gen",
    call_strategy: "one distinct image_gen call per cover or non-pilot lesson master, plus a separate Fact Find poster-master call",
    ...(usesSharedPilotLineage
      ? {
          pilot_call_strategy: "one checksum-locked shared cast generation followed by one independently evidenced edit chain per pilot",
        }
      : usesTwoIdentityPilotLineage
        ? {
            pilot_call_strategy: usesPoseVariationPilotLineage
              ? "three checksum-locked single-character candidates using two honest identity roots, distinct pose labels, and lesson-video evidence"
              : "three checksum-locked single-character candidates using exactly one of two honest identity roots, with lesson-video evidence",
          }
        : {}),
    model_native_text: "forbidden",
    manifest_approval_updates: "forbidden until visual QA and explicit approval",
    upload_or_publish: "forbidden in artwork production",
  },
  style_system: {
    name: "BMH Sticker System",
    reference_inputs: references,
    palette_rgb: [
      [103, 182, 255],
      [255, 211, 1],
      [255, 174, 1],
      [255, 110, 0],
      [254, 255, 198],
      [255, 255, 255],
      [0, 0, 0],
      [105, 153, 53],
    ],
    ...(usesLockedPilotContract
      ? {
          background_contract: {
            allowed_rgb: [BLUE_RGB, YELLOW_RGB],
            master_field: "background_rgb",
            derivative_normalization_field: "normalize_background_rgb",
            lesson_card_padding_field: "padding_color_rgb",
          },
        }
      : {}),
    crop_profiles: {
      "full-safe": { x: 0, y: 0, width: 1, height: 1 },
      "left-safe": { x: 0.05, y: 0.2, width: 0.6, height: 0.6 },
      "center-safe": { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
      "right-safe": { x: 0.35, y: 0.2, width: 0.6, height: 0.6 },
    },
    safe_crop_rules: [
      "Generate a 16:9 master with all meaningful objects inside the central 80 percent.",
      "Build the 16:10 lesson card by containment and solid palette padding. Never crop a lesson master to make the card.",
      "A focused poster crop must contain its complete named subject with at least 5 percent internal breathing room.",
      "If a generated anchor misses its declared safe zone, reject or correct the master. Do not move the crop to another subject.",
      "All 29 final poster pixel SHA-256 values must be unique. A checksum collision means a duplicated poster and blocks approval.",
      "A human must confirm each focused poster still depicts its mapped video title before manifest approval.",
    ],
  },
  course_cover: {
    id: "master-program-bmh-employee-training",
    asset_key: course.thumbnail_asset_key,
    output_path: coverPath,
    source_path: "course-assets/thumbnails/production/sources/program-bmh-employee-training-generated.png",
    flat_master_path: "course-assets/thumbnails/production/flat-masters/program-bmh-employee-training-flat-master.png",
    ...(usesLockedPilotContract ? { background_rgb: courseCoverArtDirection.background_rgb } : {}),
    art_direction: courseCoverArtDirection,
    derivative: {
      recipe_id: "course-cover-card-16x10",
      source_master_id: "master-program-bmh-employee-training",
      target_dimensions: [1280, 800],
      method: "contain-master-in-1280x720-and-pad-40px-top-and-bottom",
      normalize_master_dimensions: [1280, 720],
      normalize_method: "contain-with-padding",
      normalize_background_rgb: courseCoverArtDirection.background_rgb,
      padding_color_rgb: courseCoverArtDirection.background_rgb,
      crop_allowed: false,
      resample: "lanczos",
      output_format: "lossless-webp",
    },
    reference_ids: ["style-ref-1", "style-ref-2", courseCoverArtDirection.character_id],
    prompt: `Use case: stylized-concept
Asset type: BMH Institute BMH Employee Training course cover, wide 16:9 master designed to crop safely to 16:10
Primary request: Create the course cover for BMH Employee Training. The five-second read must be “one clear path from orientation through confident service and career growth.” Use a welcoming training doorway as the central hero sticker. Arrange six small supporting stickers around it for the six course sections: compass and checklist, homeowner and heart, connected speech bubbles, ear and reframe arrow, calendar and handshake, and a clean dashboard leading to broad growth steps.
Input images: Image 1 and Image 2 are the canonical BMH Sticker System style references. Image 3 is the approved Andrea identity root. Use it to preserve Andrea's exact face, hair, proportions, clothing language, pure-white skin fill, and line weight while giving her this course-cover-specific pose.
Character direction: ${courseCoverArtDirection.pose_instruction}
Lesson/course cue: ${courseCoverArtDirection.lesson_or_video_cue}.
Scene/backdrop: perfectly uniform flat cornflower-blue field with generous active negative space; a floating sticker composition, never a continuous building interior, landscape, or realistic environment
Style/medium: hand-drawn flat sticker-sheet illustration; thick slightly wobbly black outlines; rounded imperfect primitive geometry; strong simple silhouettes; every object independently croppable
Composition/framing: large welcoming doorway centered with a tiny learner moving toward it; six supporting course-section stickers form a loose balanced path around the doorway; keep all meaningful content inside the central 80% so the 16:9 source and 16:10 contained card remain intact
Color palette: cornflower blue, golden yellow, amber, orange, cream, white, black, and one muted green; exactly the locked eight-color palette after deterministic flattening; no extra colors
Characters: exactly one person, Andrea, with pure-white skin fill; no seller, second person, crowd, duplicate, background figure, or partial extra person
Constraints: no title, no words, no letters, no numbers, no currency amounts, no logos, no watermark; absolutely uniform flat fills; no white sticker border; no fixed performance promises; the six section motifs must read as one learning journey rather than six disconnected scenes
Avoid: gradients, texture, lighting, glow, shadows, reflections, depth, realistic perspective, photorealism, 3D rendering, detailed architecture, tiny unreadable symbols, busy backgrounds, edge-cropped key objects, and lesson-specific subject dominance`,
    provenance: buildProvenance("imagegen-course-cover", "one-distinct-call"),
    production_record: createEmptyProductionRecord(),
    approval: blockedApproval,
  },
  lessons: inventoryLessons,
};

inventory.course_cover.prompt_sha256 = sha256(inventory.course_cover.prompt);
await applyDistinctPosterInventoryOverlay({
  inventory,
  grouped: videoContactSheets,
  distinct: distinctPosterContactSheets,
});

const productionRecords = [
  ["course cover", inventory.course_cover.production_record],
  ...inventory.lessons.flatMap((lesson) => [
    [`${lesson.slot} lesson master`, lesson.master.production_record],
    ...lesson.posters.filter((poster) => poster.direct_master).map((poster) => [`${poster.asset_key} direct master`, poster.direct_master.production_record]),
  ]),
];
for (const [label, record] of productionRecords) {
  validateProductionRecord(record, label);
}

const serializedInventory = `${JSON.stringify(inventory, null, 2)}\n`;
if (checkMode) {
  const currentInventory = await readFile(outputPath, "utf8");
  if (currentInventory !== serializedInventory) {
    throw new Error(`${path.relative(repoRoot, outputPath)} is stale; run the builder without --check`);
  }
  console.log(`Verified ${path.relative(repoRoot, outputPath)}`);
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializedInventory);
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}
