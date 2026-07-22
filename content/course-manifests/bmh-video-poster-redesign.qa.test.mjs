import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const readJson = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("all 29 video posters are deterministic 16:9 crops of the approved redesigned lesson thumbnails", async () => {
  const [approval, ledger, manifest, canaryManifest] = await Promise.all([
    readJson("docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json"),
    readJson("docs/course-production/thumbnail-pilots/production-ledger.json"),
    readJson("content/course-manifests/bmh-employee-training.v1.json"),
    readJson("content/course-manifests/bmh-employee-training-canary.v1.json"),
  ]);
  assert.equal(approval.schema_version, "bmh-video-poster-redesign-approval/v1");
  assert.equal(approval.decision, "approved");
  assert.equal(approval.approver, "Jarrad Henry");
  assert.equal(approval.assets.length, 29);

  const expectedBindings = manifest.program.courses.flatMap((course) =>
    course.modules.flatMap((module) =>
      module.lessons.flatMap((lesson) => {
        const videos = (lesson.blocks ?? []).filter((block) => block.type === "video");
        return videos.map((video, index) => ({
          lesson_key: lesson.source_key,
          lesson_title: lesson.title,
          video_key: video.content.asset_key,
          poster_asset_key: video.content.poster_asset_key,
          source_thumbnail_asset_key: lesson.thumbnail_asset_key,
          crop: {
            left: 0,
            top: videos.length === 1 ? 40 : Math.round((index * 80) / (videos.length - 1)),
            width: 1280,
            height: 720,
          },
        }));
      }),
    ),
  );
  const approvedBindings = approval.assets.map((binding) => ({
    lesson_key: binding.lesson_key,
    lesson_title: binding.lesson_title,
    video_key: binding.video_key,
    poster_asset_key: binding.poster_asset_key,
    source_thumbnail_asset_key: binding.source_thumbnail_asset_key,
    crop: binding.crop,
  }));
  assert.deepEqual(approvedBindings, expectedBindings, "approval must bind each poster to its exact manifest video and lesson");

  const ledgerByKey = new Map(ledger.assets.map((asset) => [asset.asset_key, asset]));
  const manifestByKey = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));
  const pixelChecksums = new Set();
  for (const binding of approval.assets) {
    const output = ledgerByKey.get(binding.poster_asset_key);
    const manifestAsset = manifestByKey.get(binding.poster_asset_key);
    assert.equal(output.kind, "video-poster");
    assert.deepEqual(binding.crop, output.poster_redesign_replacement.crop);
    assert.equal(output.poster_redesign_replacement.source_thumbnail_asset_key, binding.source_thumbnail_asset_key);
    assert.equal(output.poster_redesign_replacement.source_sha256, binding.source_sha256);
    assert.equal(manifestAsset.checksum_sha256, output.checksum_sha256);
    assert.equal(manifestAsset.storage_path, output.storage_path);

    const source = await readFile(path.join(ROOT, binding.source_path));
    assert.equal(sha256(source), binding.source_sha256);
    const expected = await sharp(source)
      .extract(binding.crop)
      .removeAlpha()
      .webp({ quality: 90, effort: 6, smartSubsample: true })
      .toBuffer();
    const actual = await readFile(path.join(ROOT, output.manifest_path));
    assert.equal(sha256(actual), sha256(expected), `${binding.poster_asset_key} is reproducible from its approved thumbnail`);
    const metadata = await sharp(actual).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, "1280x720");
    const pixels = await sharp(actual).removeAlpha().raw().toBuffer();
    assert.equal(sha256(pixels), output.pixel_sha256);
    pixelChecksums.add(output.pixel_sha256);
  }
  assert.equal(pixelChecksums.size, 29);

  const canaryPoster = canaryManifest.assets.find((asset) => asset.source_key === "poster-video-slot-03-tech-stack");
  const fullPoster = ledgerByKey.get("poster-video-slot-03-tech-stack");
  const canaryVideoBlocks = canaryManifest.program.courses.flatMap((course) =>
    course.modules.flatMap((module) =>
      module.lessons.flatMap((lesson) => (lesson.blocks ?? []).filter((block) => block.type === "video")),
    ),
  );
  assert.equal(canaryVideoBlocks.length, 1);
  assert.equal(canaryVideoBlocks[0].content.poster_asset_key, canaryPoster.source_key);
  assert.match(canaryPoster.storage_path, /^courses\/bmh-employee-training-canary\/v1\/posters\//);
  assert.equal(canaryPoster.checksum_sha256, fullPoster.checksum_sha256);
  assert.equal(canaryPoster.size_bytes, fullPoster.size_bytes);
});
