#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
export const RECUT_DIR = join(
  REPO_ROOT,
  "docs/course-production/held-video-recuts",
);
export const RECUT_SOURCE_KEYS = [
  "video-slot-01-welcome",
  "video-slot-01-mindset",
  "video-slot-10-objection-scripts",
  "video-slot-15-closing",
  "video-slot-17-compensation",
  "video-slot-18-operator",
  "video-slot-19-career",
];
export const HELD_VIDEO_SCRIPT_REVIEW_QUESTION =
  "Do you approve all seven checksum-bound replacement scripts and scene plans—Welcome, Mindset, Objection Scripts Playbook, Closing and Deal Engineering, Compensation Engine, Operator Playbook, and Career Growth Path—as the content for the seven already-prepared, unrendered HeyGen Studio drafts and authorize only independent Studio-settings verification plus preparation of their eventual Jarrad-only Generate handoff, or which source keys need revision?";
export const HELD_VIDEO_SCRIPT_REVIEW_PATHS = Object.freeze({
  request: join(
    RECUT_DIR,
    "generated/held-video-script-review-request.v1.json",
  ),
  surface: join(RECUT_DIR, "generated/held-video-script-review.md"),
  response: join(
    RECUT_DIR,
    "approvals/held-video-script-review-response.v1.json",
  ),
});

const HELD_VIDEO_REVIEW_TITLES = Object.freeze({
  "video-slot-01-welcome": "Welcome",
  "video-slot-01-mindset": "Mindset",
  "video-slot-10-objection-scripts": "Objection Scripts Playbook",
  "video-slot-15-closing": "Closing and Deal Engineering",
  "video-slot-17-compensation": "Compensation Engine",
  "video-slot-18-operator": "Operator Playbook",
  "video-slot-19-career": "Career Growth Path",
});

export const HEYGEN_DRAFT_CONTRACT = Object.freeze({
  apiEndpoint: "https://api.heygen.com/v2/video/generate",
  avatarGroupId: "b2cd05454d284058ad8d7303545821e6",
  avatarName: "Doodle Andrea cafe (course)",
  avatarLookId: "7c00b3e0ad8b4a6a97115243aff056bb",
  voiceId: "42d00d4aac5441279d8536cd6b52c53c",
  folderId: "3d837f4e9fb84b8294785fc060a342c0",
  finalFolderId: "a095b4f712264847bf7c7ec358e2c101",
  projectFolderId: "5eb17fe1b67d4de6a010519fd367ca73",
  motionEngine: "Avatar IV",
  autoEnhance: true,
  dimension: Object.freeze({ width: 1920, height: 1080 }),
  titles: Object.freeze({
    "video-slot-01-welcome": "Chapter 1A - Draft",
    "video-slot-01-mindset": "Chapter 1B - Draft",
    "video-slot-10-objection-scripts": "Chapter 7B - Draft",
    "video-slot-15-closing": "Chapter 11A - Draft",
    "video-slot-17-compensation": "Chapter 17 - Draft",
    "video-slot-18-operator": "Chapter 18 - Draft",
    "video-slot-19-career": "Chapter 19 - Draft",
  }),
  handoffTitles: Object.freeze({
    "video-slot-01-welcome": "Lesson 01 - Welcome - Draft",
    "video-slot-01-mindset": "Lesson 01 - Mindset - Draft",
    "video-slot-10-objection-scripts":
      "Lesson 10 - Objection Scripts Playbook - Draft",
    "video-slot-15-closing":
      "Lesson 15 - Closing and Deal Engineering - Draft",
    "video-slot-17-compensation": "Lesson 17 - Compensation Engine - Draft",
    "video-slot-18-operator": "Lesson 18 - Operator Playbook - Draft",
    "video-slot-19-career": "Lesson 19 - Career Growth Path - Draft",
  }),
});

export const HEYGEN_MAX_VIDEO_INPUTS = 50;
export const STUDIO_IMPORT_MAX_CHARS = 1_000;
export const STANDARD_SCENE_END_PAUSE_SECONDS = 2;
export const LEARNER_THINK_GAP_SECONDS = 3;

const DRILL_PATTERN = /^Seller:\s*(.+?)\s+Response:\s+(.+)$/;

const NEGATIVE_PARALLELISM_PATTERNS = Object.freeze([
  Object.freeze({
    id: "the-point-is-not-the-point-is",
    pattern: /\bthe point is not\b[^.!?]{0,240}[.!?]\s*\bthe point is\b/i,
  }),
  Object.freeze({
    id: "not-only-but",
    pattern: /\bnot only\b[^.!?]{0,240}\bbut\b/i,
  }),
  Object.freeze({
    id: "not-just-but",
    pattern: /\b(?:it(?:'s| is)|this is) not (?:just|merely|simply)\b[^.!?]{0,240}\b(?:it(?:'s| is)|this is)\b/i,
  }),
]);

export async function loadRecutPackages() {
  return Promise.all(
    RECUT_SOURCE_KEYS.map(async (sourceKey) =>
      JSON.parse(await readFile(join(RECUT_DIR, `${sourceKey}.json`), "utf8")),
    ),
  );
}

export function spokenWordCount(value) {
  return (value.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g) ?? []).length;
}

export function humanizerNegativeParallelismViolations(value) {
  return NEGATIVE_PARALLELISM_PATTERNS.filter(({ pattern }) =>
    pattern.test(value),
  ).map(({ id }) => id);
}

export function sceneDeliverySegments(scene) {
  const drill = DRILL_PATTERN.exec(scene.spoken_text);
  if (!drill) {
    return [
      {
        segment_id: scene.scene_id,
        segment_kind: "andrea_narration",
        input_text: scene.spoken_text,
        pause_after_seconds: STANDARD_SCENE_END_PAUSE_SECONDS,
        pause_kind: "standard_scene_end",
      },
    ];
  }
  const [, sellerTurn, response] = drill;
  const pushbackSegmentId = `${scene.scene_id}-seller-pushback`;
  const responseSegmentId = `${scene.scene_id}-andrea-response`;
  return [
    {
      segment_id: pushbackSegmentId,
      segment_kind: "seller_pushback",
      input_text: `A seller says, "${sellerTurn}"`,
      pause_after_seconds: LEARNER_THINK_GAP_SECONDS,
      pause_kind: "learner_think_gap",
      response_segment_id: responseSegmentId,
    },
    {
      segment_id: responseSegmentId,
      segment_kind: "andrea_response",
      input_text: response,
      pause_after_seconds: STANDARD_SCENE_END_PAUSE_SECONDS,
      pause_kind: "standard_scene_end",
      responds_to_segment_id: pushbackSegmentId,
    },
  ];
}

export function spokenDeliveryText(scene) {
  return sceneDeliverySegments(scene)
    .map((segment) => segment.input_text)
    .join(" ");
}

export function providerSceneSequence(pkg) {
  return pkg.scenes.flatMap((scene) =>
    sceneDeliverySegments(scene).map((segment) => ({
      ...segment,
      source_scene_id: scene.scene_id,
    })),
  ).map((segment, inputIndex) => ({
    ...segment,
    input_index: inputIndex,
  }));
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertCleanStudioNarrationLine(line, sourceKey, inputIndex) {
  if (
    typeof line !== "string"
    || line.length === 0
    || line.trim() !== line
    || /[\r\n]/.test(line)
    || line.length > STUDIO_IMPORT_MAX_CHARS
  ) {
    throw new Error(
      `${sourceKey} Studio import input ${inputIndex} must be one nonblank trimmed narration line of at most ${STUDIO_IMPORT_MAX_CHARS} characters`,
    );
  }
  if (
    /^(?:SCENE(?:\s|\d|:)|\[?EDITOR\b|Seller:|Response:)/i.test(line)
    || /\b(?:Do not narrate this instruction|seconds of silence at this scene boundary)\b/i.test(line)
  ) {
    throw new Error(
      `${sourceKey} Studio import input ${inputIndex} contains narratable structural instructions`,
    );
  }
}

export function renderStudioImportText(pkg) {
  const scenes = providerSceneSequence(pkg);
  for (const scene of scenes) {
    assertCleanStudioNarrationLine(
      scene.input_text,
      pkg.source.source_key,
      scene.input_index,
    );
  }
  return `${scenes.map((scene) => scene.input_text).join("\n")}\n`;
}

export function renderStudioImportSidecar(pkg) {
  const sourceKey = pkg.source.source_key;
  const scenes = providerSceneSequence(pkg);
  const narration = renderStudioImportText(pkg);
  const paths = generatedRecutPaths(sourceKey);
  return `${JSON.stringify({
    schema_version: "bmh-held-video-studio-import/v1",
    status: "manual_studio_preparation_only",
    source_key: sourceKey,
    provider_call_allowed: false,
    render_allowed: false,
    generate_button_allowed_for_codex: false,
    narration: {
      path: relative(REPO_ROOT, paths.studioImport).replaceAll("\\", "/"),
      sha256: sha256Text(narration),
      size_bytes: Buffer.byteLength(narration, "utf8"),
      line_count: scenes.length,
      format: "one UTF-8 narration line per canonical provider scene; no blank lines",
    },
    studio_preparation: {
      manual_only: true,
      canonical_video_input_count: scenes.length,
      narration_line_character_limit: STUDIO_IMPORT_MAX_CHARS,
      studio_api_single_request_video_input_limit: HEYGEN_MAX_VIDEO_INPUTS,
      canonical_sequence_fits_single_api_request:
        scenes.length <= HEYGEN_MAX_VIDEO_INPUTS,
      instruction:
        scenes.length <= HEYGEN_MAX_VIDEO_INPUTS
          ? "Create one Studio scene per narration line, then apply the sidecar pause at that scene boundary."
          : "Create one Studio scene per narration line manually and preserve every sidecar boundary; this is not a one-shot API request.",
    },
    scene_map: scenes.map((scene) => ({
      line_number: scene.input_index + 1,
      input_index: scene.input_index,
      source_scene_id: scene.source_scene_id,
      segment_id: scene.segment_id,
      segment_kind: scene.segment_kind,
      input_text_sha256: sha256Text(scene.input_text),
      pause_after_seconds: scene.pause_after_seconds,
      pause_kind: scene.pause_kind,
      ...(scene.response_segment_id
        ? { response_segment_id: scene.response_segment_id }
        : {}),
      ...(scene.responds_to_segment_id
        ? { responds_to_segment_id: scene.responds_to_segment_id }
        : {}),
    })),
  }, null, 2)}\n`;
}

export function renderStudioImportInventory(packages) {
  const records = packages.map((pkg) => {
    const sourceKey = pkg.source.source_key;
    const paths = generatedRecutPaths(sourceKey);
    const narration = renderStudioImportText(pkg);
    const sidecar = renderStudioImportSidecar(pkg);
    return {
      source_key: sourceKey,
      narration_path: relative(REPO_ROOT, paths.studioImport).replaceAll("\\", "/"),
      narration_sha256: sha256Text(narration),
      narration_line_count: providerSceneSequence(pkg).length,
      sidecar_path: relative(REPO_ROOT, paths.studioImportSidecar).replaceAll("\\", "/"),
      sidecar_sha256: sha256Text(sidecar),
    };
  });
  return `${JSON.stringify({
    schema_version: "bmh-held-video-studio-import-inventory/v1",
    purpose: "Checksum-bound manual Studio preparation artifacts; never provider authorization",
    provider_call_allowed: false,
    records,
  }, null, 2)}\n`;
}

export function recutSpokenWordCount(pkg) {
  return spokenWordCount(pkg.scenes.map(spokenDeliveryText).join(" "));
}

export function renderRecutScript(pkg) {
  const sourceDepth = pkg.source_depth_contract;
  const lines = [
    pkg.source.source_key,
    `Held source SHA-256: ${pkg.source.held_sha256}`,
    "Status: script ready; not rendered, captioned, approved, or published",
    `Spoken depth: ${recutSpokenWordCount(pkg)} words; required minimum ${sourceDepth.minimum_replacement_word_count}`,
    `Teaching coverage: ${sourceDepth.required_teaching_beats.length} locked beats; ${sourceDepth.required_examples.length} locked examples`,
    "",
  ];
  for (const [index, scene] of pkg.scenes.entries()) {
    const segments = sceneDeliverySegments(scene);
    for (const [segmentIndex, segment] of segments.entries()) {
      const suffix = segments.length === 1
        ? ""
        : segmentIndex === 0
          ? " - seller pushback"
          : " - Andrea response";
      lines.push(`SCENE ${index + 1}${segments.length === 1 ? "" : segmentIndex === 0 ? "A" : "B"}: ${scene.title}${suffix}`);
      lines.push(segment.input_text);
      if (segment.pause_kind === "learner_think_gap") {
        lines.push(
          `[EDITOR GAP: ${segment.pause_after_seconds} seconds of silence at this scene boundary for the learner to think. Do not narrate this instruction.]`,
        );
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderRecutEditSpec(pkg) {
  const sourceDepth = pkg.source_depth_contract;
  const lines = [
    `# ${pkg.source.source_key} recut edit specification`,
    "",
    `Held source SHA-256: \`${pkg.source.held_sha256}\``,
    ...(pkg.source.review_transcript_path
      ? [
          `Review transcript: \`${pkg.source.review_transcript_path}\``,
          `Review VTT: \`${pkg.source.review_vtt_path}\``,
        ]
      : [
          `Technical QA: \`${pkg.source.technical_qa_path}\``,
          `Source script reference: \`${pkg.source.source_script_reference}\``,
          `Source script SHA-256: \`${pkg.source.source_script_sha256}\``,
        ]),
    "",
    "This specification maps every spoken moment in the held cut to replacement scenes. It does not authorize rendering, caption generation, approval, upload, or publication.",
    "",
    "| Source time | Action | Replacement scene | Why |",
    "|---|---|---|---|",
  ];
  for (const operation of pkg.edit_operations) {
    lines.push(
      `| ${operation.source_start} to ${operation.source_end} | ${operation.action} | ${operation.replacement_scene_ids.map((id) => `\`${id}\``).join(", ")} | ${operation.source_problem} |`,
    );
  }
  lines.push("", "## Preserved lesson contract", "");
  lines.push(pkg.lesson_contract.objective);
  lines.push("");
  for (const point of pkg.lesson_contract.objective_points)
    lines.push(`- ${point}`);
  lines.push(
    "",
    `Next sequence: ${pkg.lesson_contract.next_sequence.map((value) => `\`${value}\``).join(" -> ")}`,
  );
  lines.push(
    "",
    `Spoken transition: ${pkg.lesson_contract.transition_spoken_text}`,
  );
  lines.push("", "## Source-depth contract", "");
  lines.push(
    `Replacement spoken words: ${recutSpokenWordCount(pkg)}. Minimum: ${sourceDepth.minimum_replacement_word_count}. Source baseline: ${sourceDepth.source_spoken_word_count}.`,
    "",
    "Required teaching beats:",
    "",
  );
  for (const beat of sourceDepth.required_teaching_beats) {
    lines.push(`- \`${beat.beat_id}\`: ${beat.description}`);
  }
  if (sourceDepth.required_examples.length > 0) {
    lines.push("", "Required examples:", "");
    for (const example of sourceDepth.required_examples) {
      lines.push(`- \`${example.example_id}\`: ${example.description}`);
    }
  }
  lines.push("", "## Exact forbidden-language removals", "");
  for (const removal of pkg.forbidden_language_removals ?? []) {
    lines.push(
      `- ${removal.source_time}: remove \`${removal.exact_source_language}\`. ${removal.replacement_rule}`,
    );
  }
  lines.push("", "## Scene and shot plan", "");
  for (const scene of pkg.scenes) {
    const visualPlan = scene.visual_plan ?? {
      mode: "avatar_on_camera",
      shot: "Andrea in a medium shot",
      editor_note: "Jarrad may choose an optional cutaway during editor assembly.",
    };
    lines.push(`- \`${scene.scene_id}\` ${visualPlan.mode}: ${visualPlan.shot}. ${visualPlan.editor_note}`);
  }
  const thinkGaps = providerSceneSequence(pkg).filter(
    (segment) => segment.pause_kind === "learner_think_gap",
  );
  if (thinkGaps.length > 0) {
    lines.push("", "## Learner think-gap contract", "");
    lines.push(
      `Each of the ${thinkGaps.length} seller pushbacks is its own Andrea-spoken provider scene. Add a ${LEARNER_THINK_GAP_SECONDS}-second silent pause at that scene boundary before the separate Andrea response scene. The pause is production metadata, not narration.`,
      "",
    );
    for (const segment of thinkGaps) {
      lines.push(
        `- \`${segment.segment_id}\` -> ${segment.pause_after_seconds}-second learner think gap -> \`${segment.response_segment_id}\``,
      );
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderHeygenDraftPackage(pkg) {
  const sourceKey = pkg.source.source_key;
  const title = HEYGEN_DRAFT_CONTRACT.titles[sourceKey];
  if (!title) throw new Error(`Missing HeyGen draft title for ${sourceKey}`);
  for (const field of [
    "provider_call_allowed",
    "render_allowed",
    "caption_generation_allowed",
    "approval_status_change_allowed",
  ]) {
    if (pkg.production_constraints?.[field] !== false) {
      throw new Error(`${sourceKey} ${field} must remain false`);
    }
  }
  const providerScenes = providerSceneSequence(pkg);
  const deliveredText = providerScenes
    .map((scene) => scene.input_text)
    .join(" ");
  const negativeParallelism = humanizerNegativeParallelismViolations(deliveredText);
  if (negativeParallelism.length > 0) {
    throw new Error(
      `${sourceKey} violates humanizer negative parallelism: ${negativeParallelism.join(", ")}`,
    );
  }
  for (const scene of providerScenes) {
    if (scene.input_text.length > 1_800) {
      throw new Error(
        `${sourceKey} scene ${scene.segment_id} exceeds the reviewed HeyGen scene limit`,
      );
    }
  }

  const artifact = {
    schema_version: "bmh-held-video-heygen-draft/v2",
    status: "offline_payload_only_provider_call_forbidden",
    source_key: sourceKey,
    held_source_sha256: pkg.source.held_sha256,
    humanizer_review: {
      skill: "humanizer",
      skill_version: "2.5.1",
      reviewed_on: "2026-07-18",
      result: "passed",
      checks: [
        "role-agnostic spoken language",
        "no viewer-facing chapter numbers or timelines",
        "no em dashes, curly quotes, promotional filler, or chatbot phrasing",
        "natural sentence rhythm retained without shortening the lesson contract",
        "source-depth minimum and every locked teaching example preserved",
        "no negative parallelism or tailing negation",
      ],
    },
    source_depth: {
      source_spoken_word_count: pkg.source_depth_contract.source_spoken_word_count,
      minimum_replacement_word_count:
        pkg.source_depth_contract.minimum_replacement_word_count,
      replacement_word_count: recutSpokenWordCount(pkg),
      teaching_beat_ids: pkg.source_depth_contract.required_teaching_beats.map(
        (beat) => beat.beat_id,
      ),
      example_ids: pkg.source_depth_contract.required_examples.map(
        (example) => example.example_id,
      ),
    },
    provider_gate: {
      provider_call_allowed: false,
      render_allowed: false,
      generate_button_allowed_for_codex: false,
      required_approval: "Jarrad Henry",
      provider_call_executor_after_approval: "Codex controller only",
      final_generate_button_actor: "Jarrad Henry",
    },
    provider_preparation: {
      every_scene_andrea_speaks: true,
      standard_scene_end_pause_seconds: STANDARD_SCENE_END_PAUSE_SECONDS,
      learner_think_gap_seconds: LEARNER_THINK_GAP_SECONDS,
      canonical_video_input_count: providerScenes.length,
      studio_api_single_request_video_input_limit: HEYGEN_MAX_VIDEO_INPUTS,
      canonical_sequence_fits_single_api_request:
        providerScenes.length <= HEYGEN_MAX_VIDEO_INPUTS,
      preflight_requirement:
        providerScenes.length <= HEYGEN_MAX_VIDEO_INPUTS
          ? "Apply every recorded scene-end pause in Studio before Jarrad generates."
          : "Preserve this canonical scene order while preparing the draft in Studio; the sequence exceeds the single-request API input limit and must never be collapsed to bypass the learner think gaps.",
      scene_boundaries: providerScenes.map((scene) => ({
        input_index: scene.input_index,
        source_scene_id: scene.source_scene_id,
        segment_id: scene.segment_id,
        segment_kind: scene.segment_kind,
        andrea_speaks: true,
        pause_after_seconds: scene.pause_after_seconds,
        pause_kind: scene.pause_kind,
        ...(scene.response_segment_id
          ? { response_segment_id: scene.response_segment_id }
          : {}),
        ...(scene.responds_to_segment_id
          ? { responds_to_segment_id: scene.responds_to_segment_id }
          : {}),
      })),
    },
    api_endpoint: HEYGEN_DRAFT_CONTRACT.apiEndpoint,
    request_body: {
      title,
      folder_id: HEYGEN_DRAFT_CONTRACT.folderId,
      dimension: HEYGEN_DRAFT_CONTRACT.dimension,
      video_inputs: providerScenes.map((scene) => ({
        character: {
          type: "talking_photo",
          talking_photo_id: HEYGEN_DRAFT_CONTRACT.avatarLookId,
          use_avatar_iv_model: true,
        },
        voice: {
          type: "text",
          voice_id: HEYGEN_DRAFT_CONTRACT.voiceId,
          input_text: scene.input_text,
        },
        background: { type: "color", value: "#ffffff" },
      })),
    },
  };
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function generatedRecutPaths(sourceKey) {
  return {
    script: join(RECUT_DIR, "generated", `${sourceKey}-script.txt`),
    editSpec: join(RECUT_DIR, "generated", `${sourceKey}-EDIT-SPEC.md`),
    heygenDraft: join(RECUT_DIR, "generated", `${sourceKey}-heygen-draft.json`),
    studioImport: join(RECUT_DIR, "generated", `${sourceKey}-studio-import.txt`),
    studioImportSidecar: join(
      RECUT_DIR,
      "generated",
      `${sourceKey}-studio-import.json`,
    ),
  };
}

export async function buildHeldVideoScriptReviewArtifacts(packages) {
  const records = await Promise.all(packages.map(async (pkg) => {
    const sourceKey = pkg.source.source_key;
    const title = HELD_VIDEO_REVIEW_TITLES[sourceKey];
    if (!title) throw new Error(`Missing held-video review title for ${sourceKey}`);
    const paths = generatedRecutPaths(sourceKey);
    const packagePath = join(RECUT_DIR, `${sourceKey}.json`);
    const packageBytes = await readFile(packagePath);
    const script = renderRecutScript(pkg);
    const editSpec = renderRecutEditSpec(pkg);
    const providerScenes = providerSceneSequence(pkg);
    return {
      source_key: sourceKey,
      title,
      held_source_sha256: pkg.source.held_sha256,
      package_path: relative(REPO_ROOT, packagePath).replaceAll("\\", "/"),
      package_sha256: sha256Bytes(packageBytes),
      script_path: relative(REPO_ROOT, paths.script).replaceAll("\\", "/"),
      script_sha256: sha256Text(script),
      edit_spec_path: relative(REPO_ROOT, paths.editSpec).replaceAll("\\", "/"),
      edit_spec_sha256: sha256Text(editSpec),
      replacement_scene_count: pkg.scenes.length,
      provider_scene_count: providerScenes.length,
      replacement_spoken_word_count: recutSpokenWordCount(pkg),
      forbidden_language_removal_count:
        (pkg.forbidden_language_removals ?? []).length,
      production_constraints: {
        provider_call_allowed: false,
        render_allowed: false,
        caption_generation_allowed: false,
        approval_status_change_allowed: false,
        generate_button_allowed_for_codex: false,
      },
    };
  }));
  const approvalEffect = {
    authorizes_after_preserved_response:
      "Independently verify Studio settings for the seven already-prepared, unrendered draft projects against the exact checksum-bound scripts and scene plans, then prepare their links for an eventual Jarrad-only Generate handoff.",
    does_not_authorize: [
      "retroactive approval of draft setup",
      "creating additional Studio drafts",
      "any HeyGen or provider API call",
      "POST https://api.heygen.com/v2/video/generate",
      "Codex clicking Generate",
      "rendering or paid generation",
      "caption or transcript generation",
      "video approval or manifest promotion",
      "asset upload",
      "course publication",
      "employee access",
    ],
    exact_rendered_cut_review_required_after_generation: true,
  };
  const responseContract = {
    schema_version: "bmh-held-video-script-review-response/v1",
    exact_full_approval_response: "approved",
    literal_response_required: true,
    complete_request_sha256_binding_required: true,
    external_action_allowed_before_valid_response: false,
  };
  const bindingScope = {
    replacement_video_count: records.length,
    source_keys: records.map((record) => record.source_key),
  };
  const bindingsSha256 = sha256Text(JSON.stringify({
    question: HELD_VIDEO_SCRIPT_REVIEW_QUESTION,
    scope: bindingScope,
    approval_effect: approvalEffect,
    response_contract: responseContract,
    records,
  }));
  const request = {
    schema_version: "bmh-held-video-script-review-request/v1",
    status: "pending-human-script-and-scene-approval",
    request_id: `bmh-held-video-script-review-${bindingsSha256}`,
    question: HELD_VIDEO_SCRIPT_REVIEW_QUESTION,
    scope: {
      ...bindingScope,
      bindings_sha256: bindingsSha256,
    },
    approval_effect: approvalEffect,
    response_contract: responseContract,
    records,
  };

  const lines = [
    "# Seven replacement-video scripts and scene plans",
    "",
    "> No replacement video has been rendered. This surface reviews the exact spoken scripts and scene plans only.",
    "",
    `**Approval question:** ${HELD_VIDEO_SCRIPT_REVIEW_QUESTION}`,
    "",
    "The seven unrendered Studio drafts already exist as setup evidence. Approval is not retroactive setup approval. After the literal response is preserved against the complete request-file checksum, it authorizes only independent Studio-settings verification and preparation of the exact draft links for an eventual Jarrad-only Generate handoff. It does not authorize creating more drafts, any HeyGen/provider API call (including POST /v2/video/generate), Codex clicking Generate, rendering or paid generation, captions, video approval, upload, publication, or employee access. Every resulting exact cut requires a second checksum-bound review.",
    "",
    `Request ID: \`${request.request_id}\``,
    "",
    `Bindings SHA-256: \`${bindingsSha256}\``,
    "",
    "| # | Replacement | Source key | Package SHA-256 | Lesson / Studio scenes | Words | Exact files |",
    "|---:|---|---|---|---:|---:|---|",
  ];

  for (const [index, record] of records.entries()) {
    lines.push(
      `| ${index + 1} | ${record.title} | \`${record.source_key}\` | \`${record.package_sha256}\` | ${record.replacement_scene_count} / ${record.provider_scene_count} | ${record.replacement_spoken_word_count} | [script](./${record.source_key}-script.txt) · [scene/edit plan](./${record.source_key}-EDIT-SPEC.md) |`,
    );
  }

  for (const [index, pkg] of packages.entries()) {
    const record = records[index];
    lines.push(
      "",
      `## ${index + 1}. ${record.title}`,
      "",
      `Source key: \`${record.source_key}\`  `,
      `Held source SHA-256: \`${record.held_source_sha256}\`  `,
      `Package SHA-256: \`${record.package_sha256}\`  `,
      `Script SHA-256: \`${record.script_sha256}\`  `,
      `Scene/edit-plan SHA-256: \`${record.edit_spec_sha256}\``,
      "",
      `**Lesson objective:** ${pkg.lesson_contract.objective}`,
      "",
      "### Exact source-language changes",
      "",
    );
    for (const removal of pkg.forbidden_language_removals ?? []) {
      lines.push(
        `- ${removal.source_time}: remove \`${removal.exact_source_language}\`. ${removal.replacement_rule}`,
      );
    }
    if ((pkg.forbidden_language_removals ?? []).length === 0) {
      lines.push("- Full-cut replacement follows the package's source-problem and policy map; no short exact-phrase removal is used.");
    }
    lines.push("", "### Scene plan", "");
    for (const scene of pkg.scenes) {
      const visual = scene.visual_plan;
      lines.push(
        `- \`${scene.scene_id}\` — ${scene.title}: ${visual?.shot ?? "Andrea in a medium shot"}. ${visual?.editor_note ?? "Use the approved BMH training visual language."}`,
      );
    }
    lines.push(
      "",
      "<details>",
      `<summary>Read the exact spoken script for ${record.title}</summary>`,
      "",
      "```text",
      renderRecutScript(pkg).trimEnd(),
      "```",
      "",
      "</details>",
    );
  }

  return {
    request: `${JSON.stringify(request, null, 2)}\n`,
    surface: `${lines.join("\n").trimEnd()}\n`,
  };
}

export function heldVideoScriptReviewBindingPayload(request) {
  return {
    question: request.question,
    scope: {
      replacement_video_count: request.scope?.replacement_video_count,
      source_keys: request.scope?.source_keys,
    },
    approval_effect: request.approval_effect,
    response_contract: request.response_contract,
    records: request.records,
  };
}

export async function validateHeldVideoScriptReviewResponse({
  requestText,
  responseText,
}) {
  const canonical = await buildHeldVideoScriptReviewArtifacts(
    await loadRecutPackages(),
  );
  if (requestText !== canonical.request) {
    throw new Error("Held-video script review request is not the canonical checked-in request");
  }
  const request = JSON.parse(requestText);
  const response = JSON.parse(responseText);
  const expectedBindings = sha256Text(
    JSON.stringify(heldVideoScriptReviewBindingPayload(request)),
  );
  if (
    request.schema_version !== "bmh-held-video-script-review-request/v1"
    || request.status !== "pending-human-script-and-scene-approval"
    || request.question !== HELD_VIDEO_SCRIPT_REVIEW_QUESTION
    || request.scope?.bindings_sha256 !== expectedBindings
    || request.request_id !== `bmh-held-video-script-review-${expectedBindings}`
  ) {
    throw new Error("Held-video script review request binding is invalid");
  }
  const responseKeys = [
    "decision",
    "request_binding",
    "responded_at",
    "respondent",
    "response_context",
    "response_text",
    "schema_version",
    "source_context",
  ];
  const sourceKeys = ["source", "thread_id", "turn_id", "turn_started_at"];
  const isUuid = (value) =>
    typeof value === "string"
    && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
  const isExactIsoTimestamp = (value) =>
    typeof value === "string"
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
  if (
    !response
    || typeof response !== "object"
    || JSON.stringify(Object.keys(response).sort()) !== JSON.stringify(responseKeys)
    || response.schema_version !== request.response_contract.schema_version
    || response.decision !== "approved"
    || response.respondent !== "Jarrad Henry"
    || response.response_text !== request.response_contract.exact_full_approval_response
    || !isExactIsoTimestamp(response.responded_at)
    || Date.parse(response.responded_at) > Date.now()
    || !response.source_context
    || JSON.stringify(Object.keys(response.source_context).sort())
      !== JSON.stringify(sourceKeys)
    || response.source_context.source !== "codex_user_message"
    || !isUuid(response.source_context.thread_id)
    || !isUuid(response.source_context.turn_id)
    || !isExactIsoTimestamp(response.source_context.turn_started_at)
    || Date.parse(response.responded_at)
      < Date.parse(response.source_context.turn_started_at)
  ) {
    throw new Error("Held-video script review response is invalid");
  }
  const bindingKeys = ["bindings_sha256", "request_id", "request_sha256"];
  if (
    !response.request_binding
    || JSON.stringify(Object.keys(response.request_binding).sort())
      !== JSON.stringify(bindingKeys)
    || response.request_binding.request_id !== request.request_id
    || response.request_binding.bindings_sha256 !== expectedBindings
    || response.request_binding.request_sha256 !== sha256Text(requestText)
  ) {
    throw new Error("Held-video script review response targets a different request");
  }
  const contextKeys = ["approved_action", "controller_prompt", "does_not_authorize"];
  if (
    !response.response_context
    || JSON.stringify(Object.keys(response.response_context).sort())
      !== JSON.stringify(contextKeys)
    || response.response_context.controller_prompt !== request.question
    || response.response_context.approved_action
      !== request.approval_effect.authorizes_after_preserved_response
    || JSON.stringify(response.response_context.does_not_authorize)
      !== JSON.stringify(request.approval_effect.does_not_authorize)
  ) {
    throw new Error("Held-video script review response scope is invalid");
  }
  return { request, response };
}

export async function writeRecutDocs() {
  const packages = await loadRecutPackages();
  await mkdir(join(RECUT_DIR, "generated"), { recursive: true });
  for (const pkg of packages) {
    const paths = generatedRecutPaths(pkg.source.source_key);
    await writeFile(paths.script, renderRecutScript(pkg), "utf8");
    await writeFile(paths.editSpec, renderRecutEditSpec(pkg), "utf8");
    await writeFile(paths.heygenDraft, renderHeygenDraftPackage(pkg), "utf8");
    await writeFile(paths.studioImport, renderStudioImportText(pkg), "utf8");
    await writeFile(
      paths.studioImportSidecar,
      renderStudioImportSidecar(pkg),
      "utf8",
    );
  }
  await writeFile(
    join(RECUT_DIR, "generated", "studio-import-inventory.json"),
    renderStudioImportInventory(packages),
    "utf8",
  );
  const reviewArtifacts = await buildHeldVideoScriptReviewArtifacts(packages);
  await writeFile(
    HELD_VIDEO_SCRIPT_REVIEW_PATHS.request,
    reviewArtifacts.request,
    "utf8",
  );
  await writeFile(
    HELD_VIDEO_SCRIPT_REVIEW_PATHS.surface,
    reviewArtifacts.surface,
    "utf8",
  );
  return packages.length;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.argv.includes("--write")) {
    throw new Error("Refusing to write without --write");
  }
  const count = await writeRecutDocs();
  console.log(
    `Wrote scripts and edit specifications for ${count} held video recuts.`,
  );
}
