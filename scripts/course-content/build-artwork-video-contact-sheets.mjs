import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(repoRoot, "content/course-manifests/bmh-employee-training.v1.json");
const outputDirectory = path.join(
  repoRoot,
  "docs/course-production/thumbnail-pilots/references/production-video-stills",
);
const recordPath = path.join(outputDirectory, "contact-sheets.json");
const defaultMediaRoot = "/Users/jarradhenry/Sites/BMH apps/BMH Institute";
const framePositions = [0.2, 0.5, 0.8];
const tileDimensions = [320, 180];
const columns = 3;

const masterIds = [
  "master-slot-02",
  "master-slot-03",
  "master-slot-04",
  "master-slot-05",
  "master-slot-06",
  "master-poster-video-slot-07-fact-find",
  "master-slot-08",
  "master-slot-10",
  "master-slot-11",
  "master-slot-12",
  "master-slot-13",
  "master-slot-14",
  "master-slot-15",
  "master-slot-16",
  "master-slot-17",
  "master-slot-18",
  "master-slot-19",
];

function usage() {
  return `Usage:
  node scripts/course-content/build-artwork-video-contact-sheets.mjs --write [--media-root=/absolute/path]
  node scripts/course-content/build-artwork-video-contact-sheets.mjs --check [--media-root=/absolute/path]`;
}

function parseArgs(argv) {
  const result = { mode: null, mediaRoot: defaultMediaRoot };
  for (const arg of argv) {
    if (arg === "--write" || arg === "--check") {
      if (result.mode) throw new Error("Choose exactly one of --write or --check");
      result.mode = arg.slice(2);
    } else if (arg.startsWith("--media-root=")) {
      result.mediaRoot = arg.slice("--media-root=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!result.mode) throw new Error(usage());
  if (!path.isAbsolute(result.mediaRoot)) throw new Error("--media-root must be absolute");
  return result;
}

function sha256Buffer(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function timestamp(durationSeconds, ratio) {
  return Number((durationSeconds * ratio).toFixed(3));
}

async function lockedVideoPath(mediaRoot, localPath) {
  const root = await realpath(mediaRoot);
  const candidate = path.resolve(root, localPath);
  if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Video path escapes the media root: ${localPath}`);
  }
  const fileInfo = await lstat(candidate);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new Error(`Video source must be a regular non-symlink file: ${localPath}`);
  }
  const resolved = await realpath(candidate);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Video source resolves outside the media root: ${localPath}`);
  }
  return resolved;
}

function runFfmpeg(videoPath, seconds, outputPath) {
  const [width, height] = tileDimensions;
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      seconds.toFixed(3),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      "-an",
      outputPath,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg frame extraction failed for ${videoPath} at ${seconds.toFixed(3)}s: ${result.stderr}`);
  }
}

function slotFromMasterId(masterId) {
  return masterId.match(/^master-slot-(\d{2})$/)?.[1] ?? null;
}

function mappedVideos(masterId, lessonsBySlot) {
  if (masterId === "master-poster-video-slot-07-fact-find") {
    const lesson = lessonsBySlot.get("07");
    return lesson.blocks.filter(
      (block) => block.type === "video" && block.content.asset_key === "video-slot-07-fact-find",
    );
  }
  const slot = slotFromMasterId(masterId);
  const lesson = lessonsBySlot.get(slot);
  if (!lesson) throw new Error(`No content lesson found for ${masterId}`);
  return lesson.blocks.filter((block) => block.type === "video");
}

async function renderContactSheet({ masterId, videoBlocks, assetsByKey, mediaRoot, temporaryDirectory }) {
  const framePaths = [];
  const videoEvidence = [];

  for (const [videoIndex, block] of videoBlocks.entries()) {
    const asset = assetsByKey.get(block.content.asset_key);
    if (!asset || asset.kind !== "video") throw new Error(`${masterId} has an unknown mapped video ${block.content.asset_key}`);
    const videoPath = await lockedVideoPath(mediaRoot, asset.local_path);
    const fileInfo = await stat(videoPath);
    if (fileInfo.size !== asset.size_bytes) {
      throw new Error(`${asset.source_key} size changed: ${fileInfo.size} != ${asset.size_bytes}`);
    }
    const checksum = await sha256File(videoPath);
    if (checksum !== asset.checksum_sha256) {
      throw new Error(`${asset.source_key} checksum changed: ${checksum} != ${asset.checksum_sha256}`);
    }
    const frameTimestamps = framePositions.map((ratio) => timestamp(block.content.duration_seconds, ratio));
    for (const [frameIndex, seconds] of frameTimestamps.entries()) {
      const framePath = path.join(
        temporaryDirectory,
        `${masterId}-${String(videoIndex + 1).padStart(2, "0")}-${String(frameIndex + 1).padStart(2, "0")}.png`,
      );
      runFfmpeg(videoPath, seconds, framePath);
      framePaths.push(framePath);
    }
    videoEvidence.push({
      asset_key: asset.source_key,
      local_path: asset.local_path,
      checksum_sha256: asset.checksum_sha256,
      size_bytes: asset.size_bytes,
      approval_status: asset.approval_status,
      duration_seconds: block.content.duration_seconds,
      frame_timestamps_seconds: frameTimestamps,
    });
  }

  if (framePaths.length === 0) throw new Error(`${masterId} has no mapped video frames`);
  const [tileWidth, tileHeight] = tileDimensions;
  const rows = Math.ceil(framePaths.length / columns);
  const width = tileWidth * columns;
  const height = tileHeight * rows;
  const composite = framePaths.map((input, index) => ({
    input,
    left: (index % columns) * tileWidth,
    top: Math.floor(index / columns) * tileHeight,
  }));
  const contents = await sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(composite)
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  return {
    contents,
    dimensions: [width, height],
    videoEvidence,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const assetsByKey = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));
  const lessonsBySlot = new Map(
    manifest.program.courses[0].modules
      .flatMap((module) => module.lessons)
      .filter((lesson) => lesson.type === "content")
      .map((lesson) => [lesson.source_key.match(/slot-(\d{2})$/)?.[1], lesson]),
  );
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bmh-artwork-video-stills-"));
  const records = [];

  try {
    for (const masterId of masterIds) {
      const videoBlocks = mappedVideos(masterId, lessonsBySlot);
      const rendered = await renderContactSheet({
        masterId,
        videoBlocks,
        assetsByKey,
        mediaRoot: options.mediaRoot,
        temporaryDirectory,
      });
      const filename = `${masterId.replace(/^master-/, "")}-contact-sheet.png`;
      const relativePath = path.posix.join(
        "docs/course-production/thumbnail-pilots/references/production-video-stills",
        filename,
      );
      const outputPath = path.join(outputDirectory, filename);
      const contactSheet = {
        id: `video-contact-sheet-${masterId.replace(/^master-/, "")}`,
        role: "checksum-bound exact mapped-video contact sheet",
        path: relativePath,
        sha256: sha256Buffer(rendered.contents),
        dimensions: rendered.dimensions,
        frame_count: rendered.videoEvidence.length * framePositions.length,
      };
      records.push({
        master_id: masterId,
        contact_sheet_input: contactSheet,
        video_evidence: rendered.videoEvidence,
      });

      if (options.mode === "write") {
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(outputPath, rendered.contents);
      } else {
        const existing = await readFile(outputPath);
        if (!existing.equals(rendered.contents)) {
          throw new Error(`${relativePath} is not the deterministic output for its locked video evidence`);
        }
      }
    }

    const record = {
      schema_version: "bmh-artwork-video-contact-sheets/v1",
      generator: "ffmpeg fixed-ratio frames plus sharp lossless PNG tiling",
      frame_positions: framePositions,
      tile_dimensions: tileDimensions,
      columns,
      records,
    };
    const recordContents = `${JSON.stringify(record, null, 2)}\n`;
    if (options.mode === "write") {
      await writeFile(recordPath, recordContents);
    } else if ((await readFile(recordPath, "utf8")) !== recordContents) {
      throw new Error("contact-sheets.json is stale");
    }

    process.stdout.write(
      `${JSON.stringify({ mode: options.mode, masters: records.length, videos: records.flatMap((item) => item.video_evidence).length, frames: records.reduce((total, item) => total + item.contact_sheet_input.frame_count, 0) }, null, 2)}\n`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
