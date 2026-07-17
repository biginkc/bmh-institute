import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STALE_COMPENSATION_PATTERN = /\$\s*\d|hourly base|ramp(?:-up|ing up) base|performance pay|milestone bonus|commission on (?:every|the) deal|earning potential|earnings can grow|compensation .* tied to .* output|guaranteed pay|fixed pay promise/i;
const FIXED_DIAL_QUOTA_PATTERN = /\b(?:\d{2,3}(?:\s*(?:to|-|plus|\+))\s*\d{2,3}|\d{2,3}\s*(?:plus|\+))\s+(?:total\s+)?dials?\b|\bdial target\b/i;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseTimestamp(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match.map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function parseWebVtt(raw) {
  const normalized = raw.replaceAll("\r\n", "\n").trimEnd();
  if (!normalized.startsWith("WEBVTT\n")) {
    return { cues: [], errors: ["file must start with WEBVTT"] };
  }

  const errors = [];
  const cues = [];
  const blocks = normalized.slice("WEBVTT\n".length).trim().split(/\n{2,}/);
  for (const [index, block] of blocks.entries()) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes(" --> "));
    if (timingIndex === -1) {
      errors.push(`cue ${index + 1} has no timing line`);
      continue;
    }
    const [startRaw, endWithSettings] = lines[timingIndex].split(" --> ");
    const endRaw = endWithSettings?.split(/\s+/)[0];
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    const textLines = lines.slice(timingIndex + 1);
    const text = textLines.join(" ").trim();
    if (start === null || end === null) errors.push(`cue ${index + 1} has an invalid timestamp`);
    if (start !== null && end !== null && end <= start) errors.push(`cue ${index + 1} does not advance`);
    if (!text) errors.push(`cue ${index + 1} is empty`);
    if (textLines.length > 2) errors.push(`cue ${index + 1} has more than two lines`);
    if (textLines.some((line) => line.length > 50)) errors.push(`cue ${index + 1} has a line longer than 50 characters`);
    if (start !== null && end !== null) cues.push({ start, end, text });
  }

  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index].start < cues[index - 1].end - 0.001) {
      errors.push(`cue ${index + 1} overlaps the previous cue`);
    }
  }
  if (cues.length === 0) errors.push("file has no cues");
  return { cues, errors };
}

export async function loadManifest(urlOrPath) {
  return JSON.parse(await readFile(urlOrPath, "utf8"));
}

function allVideoBlocks(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "video");
}

async function inspectFile(asset, repoRoot, expectedKind, errors) {
  const candidatePath = path.resolve(repoRoot, asset.local_path);
  const relativeCandidate = path.relative(repoRoot, candidatePath);
  if (
    path.isAbsolute(asset.local_path)
    || relativeCandidate === ""
    || relativeCandidate === ".."
    || relativeCandidate.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeCandidate)
  ) {
    errors.push(`${asset.source_key} local path escapes the repository trust root`);
    return null;
  }
  let fullPath;
  try {
    const [canonicalRoot, canonicalFile] = await Promise.all([
      realpath(repoRoot),
      realpath(candidatePath),
    ]);
    const relativeCanonical = path.relative(canonicalRoot, canonicalFile);
    if (
      relativeCanonical === ""
      || relativeCanonical === ".."
      || relativeCanonical.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeCanonical)
    ) {
      errors.push(`${asset.source_key} local path resolves outside the repository trust root`);
      return null;
    }
    fullPath = canonicalFile;
  } catch {
    errors.push(`${asset.source_key} file is missing`);
    return null;
  }
  let buffer;
  try {
    buffer = await readFile(fullPath);
  } catch {
    errors.push(`${asset.source_key} file is missing`);
    return null;
  }
  const fileStat = await stat(fullPath);
  const checksum = sha256(buffer);
  if (asset.kind !== expectedKind) errors.push(`${asset.source_key} has the wrong kind`);
  if (asset.approval_status !== "approved") errors.push(`${asset.source_key} is not approved`);
  if (asset.size_bytes !== fileStat.size) errors.push(`${asset.source_key} size does not match`);
  if (asset.checksum_sha256 !== checksum) errors.push(`${asset.source_key} checksum does not match`);
  if (!asset.storage_path.includes(checksum)) errors.push(`${asset.source_key} storage path is not checksum-derived`);
  return buffer.toString("utf8");
}

export async function inspectApprovedCaptionAssets(manifest, repoRootUrl) {
  const repoRoot = fileURLToPath(repoRootUrl);
  const assets = manifest.assets ?? [];
  const byKey = new Map(assets.map((asset) => [asset.source_key, asset]));
  const videoBlocks = new Map(allVideoBlocks(manifest).map((block) => [block.content.asset_key, block]));
  const videos = assets.filter((asset) => asset.kind === "video");
  const approvedVideos = videos.filter((asset) => asset.approval_status === "approved");
  const heldVideos = videos.filter((asset) => asset.approval_status === "hold");
  const errors = [];
  let approvedCaptions = 0;
  let approvedTranscripts = 0;
  let heldDerivativeAssetsStillMissing = 0;

  for (const video of approvedVideos) {
    const block = videoBlocks.get(video.source_key);
    const duration = block?.content.duration_seconds;
    if (!duration) errors.push(`${video.source_key} has no authored duration`);
    const caption = byKey.get(`caption-${video.source_key}`);
    const transcript = byKey.get(`transcript-${video.source_key}`);
    if (!caption || !transcript) {
      errors.push(`${video.source_key} has no derivative asset records`);
      continue;
    }

    const captionText = await inspectFile(caption, repoRoot, "caption", errors);
    let captionProse = null;
    if (captionText !== null) {
      approvedCaptions += 1;
      const parsed = parseWebVtt(captionText);
      errors.push(...parsed.errors.map((error) => `${caption.source_key}: ${error}`));
      const finalCue = parsed.cues.at(-1);
      captionProse = parsed.cues.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim();
      if (parsed.cues.some((cue) => /^[-,.;:!?]/.test(cue.text))) {
        errors.push(`${caption.source_key} starts a cue with detached punctuation`);
      }
      if (finalCue && duration && finalCue.end > duration + 0.75) {
        errors.push(`${caption.source_key} extends beyond the video duration`);
      }
    }

    const transcriptText = await inspectFile(transcript, repoRoot, "transcript", errors);
    if (transcriptText !== null) {
      approvedTranscripts += 1;
      const prose = transcriptText.replace(/^#.*$/gm, "").trim();
      const transcriptProse = transcriptText.split("\n").slice(4).join(" ").replace(/\s+/g, " ").trim();
      if (prose.length < 100) errors.push(`${transcript.source_key} is empty or implausibly short`);
      if (prose.includes("\u2014")) errors.push(`${transcript.source_key} contains an em dash`);
      if (/BMH Group KC/i.test(prose)) errors.push(`${transcript.source_key} uses the wrong company name`);
      if (["video-slot-17-compensation", "video-slot-19-career"].includes(video.source_key) && STALE_COMPENSATION_PATTERN.test(prose)) {
        errors.push(`${transcript.source_key} contains a stale or fixed compensation promise`);
      }
      if (FIXED_DIAL_QUOTA_PATTERN.test(prose)) {
        errors.push(`${transcript.source_key} contains a fixed dial quota`);
      }
      if (captionProse !== null && captionProse !== transcriptProse) {
        errors.push(`${video.source_key} caption and transcript disagree`);
      }
    }
  }

  for (const video of heldVideos) {
    for (const prefix of ["caption", "transcript"]) {
      const derivative = byKey.get(`${prefix}-${video.source_key}`);
      if (!derivative) {
        errors.push(`${video.source_key} has no ${prefix} inventory record`);
        continue;
      }
      if (derivative.approval_status !== "missing" || derivative.checksum_sha256 !== null || derivative.size_bytes !== null) {
        errors.push(`${derivative.source_key} was produced before the held cut was approved`);
      } else {
        heldDerivativeAssetsStillMissing += 1;
      }
    }
  }

  return {
    approvedVideos: approvedVideos.length,
    heldVideos: heldVideos.length,
    approvedCaptions,
    approvedTranscripts,
    heldDerivativeAssetsStillMissing,
    errors,
  };
}

async function main() {
  const manifestPath = process.argv[2];
  const repoRoot = process.argv[3];
  if (!manifestPath || !repoRoot) {
    throw new Error("Usage: node scripts/course-content/validate-caption-assets.mjs <manifest.json> <repo-root>");
  }
  const manifest = await loadManifest(manifestPath);
  const report = await inspectApprovedCaptionAssets(manifest, pathToFileURL(`${path.resolve(repoRoot)}/`));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
