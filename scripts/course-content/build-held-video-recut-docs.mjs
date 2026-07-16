#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
export const RECUT_DIR = join(REPO_ROOT, "docs/course-production/held-video-recuts");
export const RECUT_SOURCE_KEYS = [
  "video-slot-17-compensation",
  "video-slot-18-operator",
  "video-slot-19-career",
];

export async function loadRecutPackages() {
  return Promise.all(RECUT_SOURCE_KEYS.map(async (sourceKey) => JSON.parse(
    await readFile(join(RECUT_DIR, `${sourceKey}.json`), "utf8"),
  )));
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
    lines.push(`| ${operation.source_start} to ${operation.source_end} | ${operation.action} | ${operation.replacement_scene_ids.map((id) => `\`${id}\``).join(", ")} | ${operation.source_problem} |`);
  }
  lines.push("", "## Preserved lesson contract", "");
  lines.push(pkg.lesson_contract.objective);
  lines.push("");
  for (const point of pkg.lesson_contract.objective_points) lines.push(`- ${point}`);
  lines.push("", `Next sequence: ${pkg.lesson_contract.next_sequence.map((value) => `\`${value}\``).join(" -> ")}`);
  lines.push("", `Spoken transition: ${pkg.lesson_contract.transition_spoken_text}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

export function generatedRecutPaths(sourceKey) {
  return {
    script: join(RECUT_DIR, "generated", `${sourceKey}-script.txt`),
    editSpec: join(RECUT_DIR, "generated", `${sourceKey}-EDIT-SPEC.md`),
  };
}

export async function writeRecutDocs() {
  const packages = await loadRecutPackages();
  await mkdir(join(RECUT_DIR, "generated"), { recursive: true });
  for (const pkg of packages) {
    const paths = generatedRecutPaths(pkg.source.source_key);
    await writeFile(paths.script, renderRecutScript(pkg), "utf8");
    await writeFile(paths.editSpec, renderRecutEditSpec(pkg), "utf8");
  }
  return packages.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--write")) {
    throw new Error("Refusing to write without --write");
  }
  const count = await writeRecutDocs();
  console.log(`Wrote scripts and edit specifications for ${count} held video recuts.`);
}
