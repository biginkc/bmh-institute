import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { assertPosterSafeEdges } from "./artwork-production-workflow.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ledger = JSON.parse(await readFile(path.join(root, "docs/course-production/thumbnail-pilots/production-ledger.json"), "utf8"));
const outputPath = path.join(root, "docs/course-production/thumbnail-pilots/qa/current-artwork-variance-2026-07-17.json");
const posters = ledger.assets.filter((asset) => asset.kind === "video-poster");
const groups = [
  ["poster-video-slot-04-humanizing-a", "poster-video-slot-04-humanizing-b", "poster-video-slot-04-ideal-seller"],
  ["poster-video-slot-05-offer-a", "poster-video-slot-05-offer-b"],
  ["poster-video-slot-06-pipeline", "poster-video-slot-06-framework"],
  ["poster-video-slot-11-complex", "poster-video-slot-11-trust"],
  ["poster-video-slot-12-faq-a", "poster-video-slot-12-faq-b"],
  ["poster-video-slot-18-mission-control", "poster-video-slot-18-operator"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hamming(left, right) {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) distance += left[index] !== right[index];
  return distance;
}

function mirror(mask, width, height) {
  return Array.from({ length: mask.length }, (_, index) => {
    const row = Math.floor(index / width);
    const column = index % width;
    return mask[row * width + (width - 1 - column)];
  });
}

const masks = new Map();
for (const poster of posters) {
  const contents = await readFile(path.join(root, poster.output_path));
  const background = poster.derivative.recipe.normalize_background_rgb;
  await assertPosterSafeEdges(contents, background, poster.asset_key);
  const width = 32;
  const height = 18;
  const { data } = await sharp(contents).removeAlpha().resize(width, height, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const mask = [];
  for (let index = 0; index < data.length; index += 3) {
    mask.push(
      Math.max(
        Math.abs(data[index] - background[0]),
        Math.abs(data[index + 1] - background[1]),
        Math.abs(data[index + 2] - background[2]),
      ) > 30 ? 1 : 0,
    );
  }
  masks.set(poster.asset_key, mask);
}

const distances = [];
for (let leftIndex = 0; leftIndex < posters.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < posters.length; rightIndex += 1) {
    const left = posters[leftIndex];
    const right = posters[rightIndex];
    distances.push({
      left: left.asset_key,
      right: right.asset_key,
      foreground_mask_hamming: hamming(masks.get(left.asset_key), masks.get(right.asset_key)),
      mirrored_foreground_mask_hamming: hamming(masks.get(left.asset_key), mirror(masks.get(right.asset_key), 32, 18)),
    });
  }
}
distances.sort((left, right) => left.foreground_mask_hamming - right.foreground_mask_hamming);
const mirrored = [...distances].sort((left, right) => left.mirrored_foreground_mask_hamming - right.mirrored_foreground_mask_hamming);
assert(distances[0].foreground_mask_hamming >= 24, "Perceptual foreground-mask duplicate detected");
assert(mirrored[0].mirrored_foreground_mask_hamming >= 24, "Perceptual mirrored foreground-mask duplicate detected");

const groupChecks = groups.map((assetKeys) => {
  const assets = assetKeys.map((assetKey) => posters.find((poster) => poster.asset_key === assetKey));
  assert(assets.every(Boolean), `Missing grouped poster in ${assetKeys.join(", ")}`);
  const masterIds = assets.map((asset) => asset.provenance.master_id);
  const poseIds = assets.map((asset) => asset.art_direction.pose_id);
  const postures = assets.map((asset) => asset.art_direction.posture);
  assert(new Set(masterIds).size === assets.length, `${assetKeys.join(", ")} reuse a source master`);
  assert(new Set(poseIds).size === assets.length, `${assetKeys.join(", ")} reuse a pose`);
  assert(new Set(postures).size === assets.length, `${assetKeys.join(", ")} reuse a posture`);
  return { asset_keys: assetKeys, source_master_ids: masterIds, pose_ids: poseIds, postures };
});

const report = {
  schema_version: "bmh-current-artwork-variance/v1",
  poster_count: posters.length,
  safe_edge_width_pixels: 4,
  safe_edge_passed: posters.length,
  foreground_mask_dimensions: [32, 18],
  perceptual_duplicate_threshold: 24,
  closest_pair: distances[0],
  closest_mirrored_pair: mirrored[0],
  grouped_pose_checks: groupChecks,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output_path: path.relative(root, outputPath), ...report }, null, 2));
