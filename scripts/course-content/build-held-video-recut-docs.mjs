#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
export const RECUT_DIR = join(
  REPO_ROOT,
  "docs/course-production/held-video-recuts",
);
export const RECUT_SOURCE_KEYS = [
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
    "video-slot-17-compensation": "Chapter 17 - Draft",
    "video-slot-18-operator": "Chapter 18 - Draft",
    "video-slot-19-career": "Chapter 19 - Draft",
  }),
});

export async function loadRecutPackages() {
  return Promise.all(
    RECUT_SOURCE_KEYS.map(async (sourceKey) =>
      JSON.parse(await readFile(join(RECUT_DIR, `${sourceKey}.json`), "utf8")),
    ),
  );
}

export function renderRecutScript(pkg) {
  const lines = [
    pkg.source.source_key,
    `Held source SHA-256: ${pkg.source.held_sha256}`,
    "Status: script ready; not rendered, captioned, approved, or published",
    "",
  ];
  for (const [index, scene] of pkg.scenes.entries()) {
    lines.push(`SCENE ${index + 1}: ${scene.title}`);
    lines.push(scene.spoken_text);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderRecutEditSpec(pkg) {
  const lines = [
    `# ${pkg.source.source_key} recut edit specification`,
    "",
    `Held source SHA-256: \`${pkg.source.held_sha256}\``,
    `Review transcript: \`${pkg.source.review_transcript_path}\``,
    `Review VTT: \`${pkg.source.review_vtt_path}\``,
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
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderHeygenDraftPackage(pkg) {
  const sourceKey = pkg.source.source_key;
  const title = HEYGEN_DRAFT_CONTRACT.titles[sourceKey];
  if (!title) throw new Error(`Missing HeyGen draft title for ${sourceKey}`);
  if (pkg.production_constraints.provider_call_allowed !== false) {
    throw new Error(`${sourceKey} provider_call_allowed must remain false`);
  }
  for (const scene of pkg.scenes) {
    if (scene.spoken_text.length > 1_800) {
      throw new Error(
        `${sourceKey} scene ${scene.scene_id} exceeds the reviewed HeyGen scene limit`,
      );
    }
  }

  const artifact = {
    schema_version: "bmh-held-video-heygen-draft/v1",
    status: "offline_payload_only_provider_call_forbidden",
    source_key: sourceKey,
    held_source_sha256: pkg.source.held_sha256,
    humanizer_review: {
      skill: "humanizer",
      skill_version: "2.5.1",
      reviewed_on: "2026-07-17",
      result: "passed",
      checks: [
        "role-agnostic spoken language",
        "no viewer-facing chapter numbers or timelines",
        "no em dashes, curly quotes, promotional filler, or chatbot phrasing",
        "natural sentence rhythm retained without shortening the lesson contract",
      ],
    },
    provider_gate: {
      provider_call_allowed: false,
      render_allowed: false,
      generate_button_allowed_for_codex: false,
      required_approval: "Jarrad Henry",
      provider_call_executor_after_approval: "Codex parent agent only",
      final_generate_button_actor: "Jarrad Henry",
    },
    api_endpoint: HEYGEN_DRAFT_CONTRACT.apiEndpoint,
    request_body: {
      title,
      folder_id: HEYGEN_DRAFT_CONTRACT.folderId,
      dimension: HEYGEN_DRAFT_CONTRACT.dimension,
      video_inputs: pkg.scenes.map((scene) => ({
        character: {
          type: "talking_photo",
          talking_photo_id: HEYGEN_DRAFT_CONTRACT.avatarId,
        },
        voice: {
          type: "text",
          voice_id: HEYGEN_DRAFT_CONTRACT.voiceId,
          input_text: scene.spoken_text,
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
  }
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
