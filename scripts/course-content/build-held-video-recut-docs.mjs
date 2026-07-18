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

export const HEYGEN_DRAFT_CONTRACT = Object.freeze({
  apiEndpoint: "https://api.heygen.com/v2/video/generate",
  avatarId: "bf22f09d624f4616b427fb6461ec7fdf",
  voiceId: "42d00d4aac5441279d8536cd6b52c53c",
  folderId: "3d837f4e9fb84b8294785fc060a342c0",
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
      provider_call_executor_after_approval: "Codex parent agent only",
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
          talking_photo_id: HEYGEN_DRAFT_CONTRACT.avatarId,
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
