#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HELD_VIDEO_SCRIPT_REVIEW_PATHS,
  RECUT_DIR,
  RECUT_SOURCE_KEYS,
  REPO_ROOT,
  buildHeldVideoScriptReviewArtifacts,
  generatedRecutPaths,
  humanizerNegativeParallelismViolations,
  loadRecutPackages,
  providerSceneSequence,
  recutSpokenWordCount,
  renderHeygenDraftPackage,
  renderRecutEditSpec,
  renderRecutScript,
  renderStudioImportInventory,
  renderStudioImportSidecar,
  renderStudioImportText,
  spokenDeliveryText,
  validateHeldVideoScriptReviewResponse,
} from "./build-held-video-recut-docs.mjs";
import { validateHeldVideoApprovalLedger } from "./held-video-approval-ledger.mjs";
import {
  HELD_VIDEO_STUDIO_SETUP_PATH,
  validateHeldVideoStudioSetup,
} from "./held-video-studio-setup.mjs";

const MANIFEST_PATH = join(
  REPO_ROOT,
  "content/course-manifests/bmh-employee-training.v1.json",
);
const POLICY_PATH = join(RECUT_DIR, "recut-policy.json");
const APPROVAL_LEDGER_PATH = join(
  REPO_ROOT,
  "docs/course-production/held-video-review/approvals.json",
);
const LOCAL_POLICY_CANDIDATES_PATH = join(
  REPO_ROOT,
  "docs/course-production/held-video-review/local-policy-candidates.json",
);
const STUDIO_IMPORT_INVENTORY_PATH = join(
  RECUT_DIR,
  "generated/studio-import-inventory.json",
);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function validateChecksumLockedRepoFile(
  reference,
  expectedSha256,
  label,
  errors,
) {
  if (
    typeof reference !== "string"
    || reference.length === 0
    || isAbsolute(reference)
  ) {
    errors.push(`${label} must be a nonempty relative repository path`);
    return;
  }
  const candidate = resolve(REPO_ROOT, reference);
  const lexicalDelta = relative(REPO_ROOT, candidate);
  if (lexicalDelta.startsWith("..") || isAbsolute(lexicalDelta)) {
    errors.push(`${label} resolves outside the repository`);
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) {
    errors.push(`${label} needs a lowercase SHA-256`);
    return;
  }
  try {
    const canonicalRoot = await realpath(REPO_ROOT);
    const canonicalCandidate = await realpath(candidate);
    const canonicalDelta = relative(canonicalRoot, canonicalCandidate);
    if (canonicalDelta.startsWith("..") || isAbsolute(canonicalDelta)) {
      errors.push(`${label} resolves through a symlink outside the repository`);
      return;
    }
    const buffer = await readFile(canonicalCandidate);
    if (sha256(buffer) !== expectedSha256) {
      errors.push(`${label} checksum changed`);
    }
  } catch (error) {
    errors.push(`${label} cannot be read: ${error.message}`);
  }
}

function parseTimestamp(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value ?? "");
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match.map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function contentLessons(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons);
}

function lessonObjectivePoints(lesson) {
  const objectives = lesson.blocks?.find((block) =>
    block.source_key.startsWith("block-objectives-"),
  );
  return [
    ...(objectives?.content?.html ?? "").matchAll(/<li>(.*?)<\/li>/g),
  ].map((match) => match[1]);
}

function expectedNextSequence(manifest, sourceKey) {
  for (const course of manifest.program.courses) {
    for (const courseModule of course.modules) {
      for (const [lessonIndex, lesson] of courseModule.lessons.entries()) {
        const videos = (lesson.blocks ?? []).filter(
          (block) => block.type === "video",
        );
        const videoIndex = videos.findIndex(
          (block) => block.content.asset_key === sourceKey,
        );
        if (videoIndex === -1) continue;
        const sequence = videos
          .slice(videoIndex + 1)
          .map((block) => block.content.asset_key);
        for (const laterLesson of courseModule.lessons.slice(lessonIndex + 1)) {
          sequence.push(laterLesson.source_key);
          if (laterLesson.type === "content") break;
        }
        return sequence;
      }
    }
  }
  return null;
}

export function validateSpokenPolicy(sourceKey, spokenText, policy) {
  const errors = [];
  for (const rule of policy.forbidden_patterns) {
    if (new RegExp(rule.pattern, rule.flags).test(spokenText)) {
      errors.push(`${sourceKey} violates ${rule.id}: ${rule.reason}`);
    }
  }
  const normalized = spokenText.toLowerCase();
  for (const required of policy.required_source_language[sourceKey] ?? []) {
    if (!normalized.includes(required.toLowerCase())) {
      errors.push(`${sourceKey} must point learners to ${required}`);
    }
  }
  return errors;
}

export async function validateRecutPackage(pkg, manifest, policy) {
  const errors = [];
  const label = pkg?.source?.source_key ?? "unknown recut";
  if (pkg.schema_version !== "1.0.0")
    errors.push(`${label} schema_version must be 1.0.0`);
  if (pkg.status !== "script_ready_not_rendered")
    errors.push(`${label} must remain script_ready_not_rendered`);
  if (!RECUT_SOURCE_KEYS.includes(label))
    errors.push(`${label} is not an expected policy recut`);
  for (const field of [
    "render_allowed",
    "provider_call_allowed",
    "caption_generation_allowed",
    "approval_status_change_allowed",
  ]) {
    if (pkg.production_constraints?.[field] !== false)
      errors.push(`${label} ${field} must remain false`);
  }
  if (pkg.production_constraints?.strategy !== "replace_full_spoken_cut") {
    errors.push(
      `${label} must replace the full spoken cut because policy claims are interwoven`,
    );
  }

  const heldAsset = manifest.assets.find((asset) => asset.source_key === label);
  if (!heldAsset || heldAsset.approval_status !== "hold")
    errors.push(`${label} must still be held in the manifest`);
  if (heldAsset && pkg.source.held_sha256 !== heldAsset.checksum_sha256)
    errors.push(`${label} held SHA does not match the manifest`);
  if (pkg.source.review_transcript_path && pkg.source.review_vtt_path) {
    for (const [pathField, hashField] of [
      ["review_transcript_path", "review_transcript_sha256"],
      ["review_vtt_path", "review_vtt_sha256"],
    ]) {
      const buffer = await readFile(resolve(REPO_ROOT, pkg.source[pathField]));
      if (sha256(buffer) !== pkg.source[hashField])
        errors.push(`${label} ${pathField} checksum changed`);
    }
    const reviewVtt = await readFile(
      resolve(REPO_ROOT, pkg.source.review_vtt_path),
      "utf8",
    );
    const cueEnds = [
      ...reviewVtt.matchAll(/-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/g),
    ].map((match) => parseTimestamp(match[1]));
    if (
      !cueEnds.length ||
      Math.abs(cueEnds.at(-1) - pkg.source.last_spoken_time_seconds) > 0.001
    ) {
      errors.push(
        `${label} last spoken timestamp is not grounded in the locked review VTT`,
      );
    }
  } else {
    await validateChecksumLockedRepoFile(
      pkg.source.technical_qa_path,
      pkg.source.technical_qa_sha256,
      `${label} technical QA`,
      errors,
    );
    await validateChecksumLockedRepoFile(
      pkg.source.source_script_reference,
      pkg.source.source_script_sha256,
      `${label} source script reference`,
      errors,
    );
    if (
      Math.abs(
        pkg.source.last_spoken_time_seconds
          - (pkg.source.duration_seconds - 0.001),
      ) > 0.001
    ) {
      errors.push(`${label} full-cut edit boundary must match the authored duration`);
    }
  }

  const sourceDepth = pkg.source_depth_contract;
  if (!sourceDepth || typeof sourceDepth !== "object") {
    errors.push(`${label} needs a source-depth contract`);
  }
  if (
    !Number.isInteger(sourceDepth?.source_spoken_word_count)
    || sourceDepth.source_spoken_word_count <= 0
  ) {
    errors.push(`${label} source-depth baseline must be a positive word count`);
  }
  if (
    !Number.isInteger(sourceDepth?.minimum_replacement_word_count)
    || sourceDepth.minimum_replacement_word_count <= 0
  ) {
    errors.push(`${label} source-depth minimum must be a positive word count`);
  }
  const replacementWordCount = recutSpokenWordCount(pkg);
  if (
    Number.isInteger(sourceDepth?.minimum_replacement_word_count)
    && replacementWordCount < sourceDepth.minimum_replacement_word_count
  ) {
    errors.push(
      `${label} replacement is materially compressed: ${replacementWordCount} words is below the ${sourceDepth.minimum_replacement_word_count}-word source-depth minimum`,
    );
  }

  const requiredBeats = sourceDepth?.required_teaching_beats;
  const requiredExamples = sourceDepth?.required_examples;
  if (!Array.isArray(requiredBeats) || requiredBeats.length === 0) {
    errors.push(`${label} needs required source teaching beats`);
  }
  if (!Array.isArray(requiredExamples)) {
    errors.push(`${label} required examples must be an array`);
  }
  const requiredBeatIds = new Set();
  for (const beat of requiredBeats ?? []) {
    if (!beat?.beat_id || !beat?.description) {
      errors.push(`${label} has an incomplete required teaching beat`);
      continue;
    }
    if (requiredBeatIds.has(beat.beat_id)) {
      errors.push(`${label} repeats teaching beat ${beat.beat_id}`);
    }
    requiredBeatIds.add(beat.beat_id);
  }
  const requiredExampleIds = new Set();
  for (const example of requiredExamples ?? []) {
    if (!example?.example_id || !example?.description) {
      errors.push(`${label} has an incomplete required example`);
      continue;
    }
    if (requiredExampleIds.has(example.example_id)) {
      errors.push(`${label} repeats required example ${example.example_id}`);
    }
    requiredExampleIds.add(example.example_id);
  }
  const videoBlock = contentLessons(manifest)
    .flatMap((candidate) => candidate.blocks ?? [])
    .find(
      (block) => block.type === "video" && block.content.asset_key === label,
    );
  if (
    !videoBlock ||
    videoBlock.content.duration_seconds !== pkg.source.duration_seconds
  ) {
    errors.push(
      `${label} authored duration differs from the manifest video block`,
    );
  }

  const lesson = contentLessons(manifest).find(
    (candidate) =>
      candidate.source_key === pkg.lesson_contract.lesson_source_key,
  );
  if (!lesson) errors.push(`${label} lesson source key is missing`);
  if (lesson && lesson.description !== pkg.lesson_contract.objective)
    errors.push(`${label} objective differs from the manifest`);
  if (
    lesson &&
    JSON.stringify(lessonObjectivePoints(lesson)) !==
      JSON.stringify(pkg.lesson_contract.objective_points)
  ) {
    errors.push(`${label} objective points differ from the manifest`);
  }
  const nextSequence = expectedNextSequence(manifest, label);
  if (
    JSON.stringify(nextSequence) !==
    JSON.stringify(pkg.lesson_contract.next_sequence)
  ) {
    errors.push(`${label} next sequence differs from the manifest`);
  }

  if (!Array.isArray(pkg.scenes) || pkg.scenes.length === 0)
    errors.push(`${label} needs scripted scenes`);
  const sceneIds = new Set();
  const coveredBeatIds = new Set();
  const coveredExampleIds = new Set();
  for (const scene of pkg.scenes ?? []) {
    const deliveredText = spokenDeliveryText(scene);
    if (!scene.scene_id || sceneIds.has(scene.scene_id))
      errors.push(`${label} has a missing or duplicate scene_id`);
    sceneIds.add(scene.scene_id);
    if (!scene.title || !scene.spoken_text)
      errors.push(`${label} scene ${scene.scene_id} is incomplete`);
    if (deliveredText.length > 1800)
      errors.push(
        `${label} scene ${scene.scene_id} exceeds the HeyGen scene limit`,
      );
    if ((scene.spoken_text ?? "").includes("\n")) {
      errors.push(`${label} scene ${scene.scene_id} must be one spoken paragraph`);
    }
    if (/[“”]/.test(scene.spoken_text ?? ""))
      errors.push(`${label} scene ${scene.scene_id} contains curly quotes`);
    if (
      !scene.visual_plan?.mode
      || !scene.visual_plan?.shot
      || !scene.visual_plan?.editor_note
    ) {
      errors.push(`${label} scene ${scene.scene_id} needs a complete visual plan`);
    }
    if (
      !Array.isArray(scene.teaching_beat_ids)
      || scene.teaching_beat_ids.length === 0
    ) {
      errors.push(`${label} scene ${scene.scene_id} needs teaching-beat coverage`);
    }
    if (!Array.isArray(scene.example_ids)) {
      errors.push(`${label} scene ${scene.scene_id} example_ids must be an array`);
    }
    for (const beatId of scene.teaching_beat_ids ?? []) {
      if (!requiredBeatIds.has(beatId)) {
        errors.push(`${label} scene ${scene.scene_id} maps unknown teaching beat ${beatId}`);
      }
      coveredBeatIds.add(beatId);
    }
    for (const exampleId of scene.example_ids ?? []) {
      if (!requiredExampleIds.has(exampleId)) {
        errors.push(`${label} scene ${scene.scene_id} maps unknown example ${exampleId}`);
      }
      if (coveredExampleIds.has(exampleId)) {
        errors.push(`${label} maps required example ${exampleId} more than once`);
      }
      coveredExampleIds.add(exampleId);
    }
  }
  for (const beatId of requiredBeatIds) {
    if (!coveredBeatIds.has(beatId)) {
      errors.push(`${label} does not cover required teaching beat ${beatId}`);
    }
  }
  for (const exampleId of requiredExampleIds) {
    if (!coveredExampleIds.has(exampleId)) {
      errors.push(`${label} does not cover required example ${exampleId}`);
    }
  }
  const fullSpokenText = (pkg.scenes ?? [])
    .map(spokenDeliveryText)
    .join(" ");
  errors.push(...validateSpokenPolicy(label, fullSpokenText, policy));
  for (const patternId of humanizerNegativeParallelismViolations(fullSpokenText)) {
    errors.push(
      `${label} violates humanizer negative parallelism: ${patternId}`,
    );
  }
  if (label === "video-slot-10-objection-scripts") {
    const providerScenes = providerSceneSequence(pkg);
    const thinkGaps = providerScenes.filter(
      (scene) => scene.pause_kind === "learner_think_gap",
    );
    if (thinkGaps.length !== 32) {
      errors.push(`${label} must preserve exactly 32 learner think gaps`);
    }
    for (const gap of thinkGaps) {
      const response = providerScenes[gap.input_index + 1];
      if (
        gap.segment_kind !== "seller_pushback"
        || gap.pause_after_seconds !== 3
        || !response
        || response.segment_kind !== "andrea_response"
        || response.segment_id !== gap.response_segment_id
        || response.responds_to_segment_id !== gap.segment_id
        || response.source_scene_id !== gap.source_scene_id
      ) {
        errors.push(
          `${label} ${gap.segment_id} must be followed by its separate Andrea response after a 3-second learner think gap`,
        );
      }
    }
  }
  if (!Array.isArray(pkg.forbidden_language_removals) || pkg.forbidden_language_removals.length === 0) {
    errors.push(`${label} needs exact forbidden-language removals`);
  }
  for (const removal of pkg.forbidden_language_removals ?? []) {
    if (!removal.source_time || !removal.exact_source_language || !removal.replacement_rule) {
      errors.push(`${label} has an incomplete forbidden-language removal`);
    }
  }
  if (
    pkg.scenes?.at(-1)?.spoken_text !==
    pkg.lesson_contract.transition_spoken_text
  ) {
    errors.push(
      `${label} final spoken scene must equal the locked course transition`,
    );
  }

  let previousEnd = 0;
  const usedScenes = new Set();
  for (const [index, operation] of (pkg.edit_operations ?? []).entries()) {
    const start = parseTimestamp(operation.source_start);
    const end = parseTimestamp(operation.source_end);
    if (start === null || end === null || end <= start)
      errors.push(`${label} edit ${index + 1} has invalid timecodes`);
    if (start !== null && Math.abs(start - previousEnd) > 0.0011)
      errors.push(`${label} edit ${index + 1} leaves a source-time gap`);
    if (end !== null) previousEnd = end + 0.001;
    if (operation.action !== "replace")
      errors.push(
        `${label} edit ${index + 1} must replace the policy-defective source`,
      );
    if (!operation.source_problem)
      errors.push(`${label} edit ${index + 1} needs source-grounded rationale`);
    for (const sceneId of operation.replacement_scene_ids ?? []) {
      if (!sceneIds.has(sceneId))
        errors.push(
          `${label} edit ${index + 1} references unknown scene ${sceneId}`,
        );
      usedScenes.add(sceneId);
    }
  }
  if (
    Math.abs(previousEnd - (pkg.source.last_spoken_time_seconds + 0.001)) >
    0.0011
  ) {
    errors.push(
      `${label} edit map must cover the source through its last spoken timestamp`,
    );
  }
  if ([...sceneIds].some((sceneId) => !usedScenes.has(sceneId)))
    errors.push(`${label} edit map does not use every replacement scene`);

  const paths = generatedRecutPaths(label);
  if ((await readFile(paths.script, "utf8")) !== renderRecutScript(pkg))
    errors.push(`${label} generated script is stale`);
  if ((await readFile(paths.editSpec, "utf8")) !== renderRecutEditSpec(pkg))
    errors.push(`${label} generated edit specification is stale`);
  try {
    if (
      (await readFile(paths.heygenDraft, "utf8")) !==
      renderHeygenDraftPackage(pkg)
    ) {
      errors.push(`${label} generated offline HeyGen draft payload is stale`);
    }
  } catch (error) {
    errors.push(`${label} cannot build offline HeyGen draft payload: ${error.message}`);
  }
  const expectedStudioImport = renderStudioImportText(pkg);
  const actualStudioImport = await readFile(paths.studioImport, "utf8");
  if (actualStudioImport !== expectedStudioImport) {
    errors.push(`${label} generated clean Studio import is stale`);
  }
  const studioImportLines = actualStudioImport.slice(0, -1).split("\n");
  const providerScenes = providerSceneSequence(pkg);
  if (
    !actualStudioImport.endsWith("\n")
    || studioImportLines.some((line) => line.length === 0)
    || JSON.stringify(studioImportLines)
      !== JSON.stringify(providerScenes.map((scene) => scene.input_text))
  ) {
    errors.push(
      `${label} clean Studio import must contain one exact nonblank narration line per canonical provider scene`,
    );
  }
  if (
    (await readFile(paths.studioImportSidecar, "utf8"))
    !== renderStudioImportSidecar(pkg)
  ) {
    errors.push(`${label} generated Studio import sidecar is stale`);
  }
  return errors;
}

export async function validateHeldVideoRecuts() {
  const [manifest, policy, packages, ledger, localPolicyCandidates] = await Promise.all([
    readFile(MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(POLICY_PATH, "utf8").then(JSON.parse),
    loadRecutPackages(),
    readFile(APPROVAL_LEDGER_PATH, "utf8").then(JSON.parse),
    readFile(LOCAL_POLICY_CANDIDATES_PATH, "utf8").then(JSON.parse),
  ]);
  const heldAssets = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
  const supplementalAssets = localPolicyCandidates.candidates.map((candidate) => ({
    source_key: candidate.source_key,
    checksum_sha256: candidate.sha256,
    local_path: candidate.local_path,
    approval_status: "hold",
  }));
  const errors = validateHeldVideoApprovalLedger(ledger, [
    ...heldAssets,
    ...supplementalAssets,
  ]);
  for (const pkg of packages)
    errors.push(...(await validateRecutPackage(pkg, manifest, policy)));
  if (
    (await readFile(STUDIO_IMPORT_INVENTORY_PATH, "utf8"))
    !== renderStudioImportInventory(packages)
  ) {
    errors.push("held-video Studio import inventory is stale");
  }
  const reviewArtifacts = await buildHeldVideoScriptReviewArtifacts(packages);
  if (
    (await readFile(HELD_VIDEO_SCRIPT_REVIEW_PATHS.request, "utf8"))
    !== reviewArtifacts.request
  ) {
    errors.push("held-video consolidated script review request is stale");
  }
  if (
    (await readFile(HELD_VIDEO_SCRIPT_REVIEW_PATHS.surface, "utf8"))
    !== reviewArtifacts.surface
  ) {
    errors.push("held-video consolidated script review surface is stale");
  }
  let scriptReviewStatus = "pending-human-script-and-scene-approval";
  try {
    await validateHeldVideoScriptReviewResponse({
      requestText: reviewArtifacts.request,
      responseText: await readFile(
        HELD_VIDEO_SCRIPT_REVIEW_PATHS.response,
        "utf8",
      ),
    });
    scriptReviewStatus = "approved";
  } catch (error) {
    if (error?.code !== "ENOENT") {
      scriptReviewStatus = "invalid-response";
      errors.push(`held-video script review approval is invalid: ${error.message}`);
    }
  }
  try {
    const [requestText, setupLedger] = await Promise.all([
      readFile(HELD_VIDEO_SCRIPT_REVIEW_PATHS.request, "utf8"),
      readFile(join(REPO_ROOT, HELD_VIDEO_STUDIO_SETUP_PATH), "utf8")
        .then(JSON.parse),
    ]);
    errors.push(...validateHeldVideoStudioSetup({
      ledger: setupLedger,
      packages,
      requestText,
    }));
  } catch (error) {
    errors.push(`held-video Studio setup ledger is invalid: ${error.message}`);
  }
  return {
    approvalRecords: ledger.records.length,
    pendingApprovalRecords: ledger.records.filter(
      (record) => record.decision === "pending",
    ).length,
    recutPackages: packages.length,
    scriptReviewStatus,
    studioSettingsVerificationAuthorized: scriptReviewStatus === "approved",
    releaseQaStatus: scriptReviewStatus === "approved"
      ? "pending-rendered-cut-review"
      : "pending-script-approval",
    heldVideoReleaseReady: false,
    errors,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await validateHeldVideoRecuts();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.errors.length ? 1 : 0;
}
