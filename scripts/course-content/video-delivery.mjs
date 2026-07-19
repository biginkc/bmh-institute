import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const VIDEO_DELIVERY_LEDGER_SCHEMA = "bmh-video-delivery-ledger/v1";
export const VIDEO_DELIVERY_PROVENANCE_SCHEMA = "bmh-video-delivery-derivative/v1";
export const SUPABASE_GLOBAL_FILE_LIMIT_BYTES = 50_000_000;
export const DEFAULT_TARGET_BYTES = 47_500_000;
export const TRANSCODE_CONTRACT = Object.freeze({
  video_codec: "libx264",
  preset: "medium",
  pixel_format: "yuv420p",
  audio: "copy",
  fps_mode: "passthrough",
  metadata: "stripped",
  passes: 2,
});

const SHA256 = /^[a-f0-9]{64}$/;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export function transcodeContractSha256() {
  return sha256Text(canonicalJson(TRANSCODE_CONTRACT));
}

export function targetVideoBitrate({ durationSeconds, audioBitrate, targetBytes = DEFAULT_TARGET_BYTES }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Video duration must be positive.");
  if (!Number.isFinite(audioBitrate) || audioBitrate < 0) throw new Error("Audio bitrate must be non-negative.");
  if (!Number.isInteger(targetBytes) || targetBytes <= 0 || targetBytes >= SUPABASE_GLOBAL_FILE_LIMIT_BYTES) {
    throw new Error("Delivery target must be an integer below the Supabase global file limit.");
  }
  // Reserve 4% for MP4 boxes, copied audio variance and two-pass rate-control variance.
  const payloadBitsPerSecond = Math.floor((targetBytes * 8 * 0.96) / durationSeconds);
  const bitrate = payloadBitsPerSecond - Math.ceil(audioBitrate);
  if (bitrate < 250_000) throw new Error("The requested byte target leaves too little video bitrate.");
  return bitrate;
}

function numberField(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} is missing or invalid.`);
  return number;
}

function integerField(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} is missing or invalid.`);
  return number;
}

export async function probeVideo(filePath, runner = execFileAsync) {
  const { stdout } = await runner("ffprobe", [
    "-v", "error",
    "-show_entries",
    "format=duration:stream=index,codec_type,codec_name,width,height,sample_aspect_ratio,display_aspect_ratio,avg_frame_rate,start_time,duration,bit_rate,nb_frames,nb_read_packets",
    "-count_packets",
    "-of", "json",
    filePath,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const raw = JSON.parse(stdout);
  const videos = raw.streams?.filter((stream) => stream.codec_type === "video") ?? [];
  const audios = raw.streams?.filter((stream) => stream.codec_type === "audio") ?? [];
  if (videos.length !== 1 || audios.length > 1) {
    throw new Error("Delivery transcode requires exactly one video stream and at most one audio stream.");
  }
  const video = videos[0];
  const audio = audios[0] ?? null;
  return {
    format_duration_seconds: numberField(raw.format?.duration, "format duration"),
    video: {
      codec: String(video.codec_name),
      width: integerField(video.width, "video width"),
      height: integerField(video.height, "video height"),
      sample_aspect_ratio: String(video.sample_aspect_ratio ?? "1:1"),
      display_aspect_ratio: String(video.display_aspect_ratio ?? ""),
      average_frame_rate: String(video.avg_frame_rate),
      start_seconds: numberField(video.start_time ?? 0, "video start"),
      duration_seconds: numberField(video.duration, "video duration"),
      frames: integerField(video.nb_frames, "video frames"),
      packets: integerField(video.nb_read_packets, "video packets"),
    },
    audio: audio ? {
      codec: String(audio.codec_name),
      start_seconds: numberField(audio.start_time ?? 0, "audio start"),
      duration_seconds: numberField(audio.duration, "audio duration"),
      bitrate: integerField(audio.bit_rate ?? 0, "audio bitrate"),
      frames: integerField(audio.nb_frames, "audio frames"),
      packets: integerField(audio.nb_read_packets, "audio packets"),
    } : null,
  };
}

function frameToleranceSeconds(probe) {
  const [numerator, denominator] = probe.video.average_frame_rate.split("/").map(Number);
  return numerator > 0 && denominator > 0 ? denominator / numerator + 0.002 : 0.04;
}

export function assertDeliveryQc(source, delivery, sizeBytes, targetBytes = DEFAULT_TARGET_BYTES) {
  const errors = [];
  if (sizeBytes >= SUPABASE_GLOBAL_FILE_LIMIT_BYTES || sizeBytes > targetBytes) errors.push("delivery exceeds its byte ceiling");
  for (const field of ["width", "height", "sample_aspect_ratio", "display_aspect_ratio", "average_frame_rate", "frames", "packets"]) {
    if (delivery.video[field] !== source.video[field]) errors.push(`video ${field} changed`);
  }
  const tolerance = frameToleranceSeconds(source);
  if (Math.abs(delivery.video.duration_seconds - source.video.duration_seconds) > tolerance) errors.push("video duration changed");
  if (Math.abs(delivery.format_duration_seconds - source.format_duration_seconds) > tolerance) errors.push("container duration changed");
  if (Boolean(delivery.audio) !== Boolean(source.audio)) errors.push("audio stream presence changed");
  if (source.audio && delivery.audio) {
    for (const field of ["codec", "frames", "packets"]) {
      if (delivery.audio[field] !== source.audio[field]) errors.push(`audio ${field} changed`);
    }
    if (Math.abs(delivery.audio.duration_seconds - source.audio.duration_seconds) > 0.002) errors.push("audio duration changed");
    const sourceOffset = source.audio.start_seconds - source.video.start_seconds;
    const deliveryOffset = delivery.audio.start_seconds - delivery.video.start_seconds;
    if (Math.abs(deliveryOffset - sourceOffset) > 0.002) errors.push("audio/video sync offset changed");
  }
  if (errors.length > 0) throw new Error(`Delivery QC failed: ${errors.join("; ")}.`);
}

export function ffmpegPassArguments({ sourcePath, outputPath, passLogPath, videoBitrate, pass }) {
  const common = [
    "-y", "-v", "error", "-i", sourcePath,
    "-map", "0:v:0", "-c:v", TRANSCODE_CONTRACT.video_codec,
    "-preset", TRANSCODE_CONTRACT.preset,
    "-pix_fmt", TRANSCODE_CONTRACT.pixel_format,
    "-b:v", String(videoBitrate),
    "-fps_mode", TRANSCODE_CONTRACT.fps_mode,
    "-pass", String(pass), "-passlogfile", passLogPath,
  ];
  if (pass === 1) return [...common, "-an", "-f", "mp4", "/dev/null"];
  return [
    ...common,
    "-map", "0:a:0?", "-c:a", TRANSCODE_CONTRACT.audio,
    "-map_metadata", "-1", "-movflags", "+faststart", "-f", "mp4", outputPath,
  ];
}

function qcEvidence(recordWithoutEvidence) {
  return sha256Text(canonicalJson(recordWithoutEvidence));
}

export function applyVideoDeliveryLedger(videoAssets, ledger) {
  if (!ledger) return videoAssets;
  if (ledger.schema_version !== VIDEO_DELIVERY_LEDGER_SCHEMA) throw new Error("Video delivery ledger schema is invalid.");
  if (ledger.transcode_contract_sha256 !== transcodeContractSha256()) throw new Error("Video delivery transcode contract drifted.");
  const records = new Map(ledger.records.map((record) => [record.source_key, record]));
  return videoAssets.map((asset) => {
    const record = records.get(asset.source_key);
    if (!record) return asset;
    if (asset.approval_status !== "approved") throw new Error(`${asset.source_key} has a delivery derivative without an approved source cut.`);
    if (
      record.approved_source.local_path !== asset.local_path ||
      record.approved_source.sha256 !== asset.checksum_sha256 ||
      record.approved_source.size_bytes !== asset.size_bytes
    ) throw new Error(`${asset.source_key} delivery source no longer matches the checksum-approved cut.`);
    if (!SHA256.test(record.delivery.sha256) || record.delivery.size_bytes >= SUPABASE_GLOBAL_FILE_LIMIT_BYTES) {
      throw new Error(`${asset.source_key} delivery derivative is not upload-safe.`);
    }
    const { qc_evidence_sha256: evidence, ...evidencePayload } = record;
    if (evidence !== qcEvidence(evidencePayload)) throw new Error(`${asset.source_key} delivery QC evidence drifted.`);
    return {
      ...asset,
      local_path: record.delivery.local_path,
      storage_path: `courses/bmh-employee-training/v1/videos/${asset.source_key}.${record.delivery.sha256}.mp4`,
      checksum_sha256: record.delivery.sha256,
      size_bytes: record.delivery.size_bytes,
      delivery_provenance: {
        schema_version: VIDEO_DELIVERY_PROVENANCE_SCHEMA,
        approved_source_sha256: record.approved_source.sha256,
        approved_source_size_bytes: record.approved_source.size_bytes,
        transcode_contract_sha256: ledger.transcode_contract_sha256,
        qc_evidence_sha256: evidence,
      },
      _approvedSourceSha256: record.approved_source.sha256,
    };
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function transcodeOne(asset, { videoRoot, outputDirectory, targetBytes, runner }) {
  const sourcePath = path.resolve(videoRoot, asset.local_path);
  const root = path.resolve(videoRoot);
  if (!sourcePath.startsWith(`${root}${path.sep}`)) throw new Error(`${asset.source_key} escapes the video root.`);
  const sourceStat = await stat(sourcePath);
  const sourceSha = await sha256File(sourcePath);
  if (sourceStat.size !== asset.size_bytes || sourceSha !== asset.checksum_sha256) {
    throw new Error(`${asset.source_key} source bytes do not match the approved manifest.`);
  }
  const sourceProbe = await probeVideo(sourcePath, runner);
  const bitrate = targetVideoBitrate({
    durationSeconds: sourceProbe.format_duration_seconds,
    audioBitrate: sourceProbe.audio?.bitrate ?? 0,
    targetBytes,
  });
  const relativeOutput = path.posix.join(
    outputDirectory,
    `${asset.source_key}.from-${sourceSha.slice(0, 16)}.mp4`,
  );
  const outputPath = path.resolve(videoRoot, relativeOutput);
  if (!outputPath.startsWith(`${root}${path.sep}`)) throw new Error("Delivery output escapes the video root.");
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await stat(outputPath);
    throw new Error(`${asset.source_key} delivery destination already exists; refusing to overwrite immutable bytes.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  const passLogPath = `${temporaryPath}.passlog`;
  await runner("ffmpeg", ffmpegPassArguments({ sourcePath, outputPath: temporaryPath, passLogPath, videoBitrate: bitrate, pass: 1 }));
  await runner("ffmpeg", ffmpegPassArguments({ sourcePath, outputPath: temporaryPath, passLogPath, videoBitrate: bitrate, pass: 2 }));
  const outputStat = await stat(temporaryPath);
  const deliveryProbe = await probeVideo(temporaryPath, runner);
  assertDeliveryQc(sourceProbe, deliveryProbe, outputStat.size, targetBytes);
  const deliverySha = await sha256File(temporaryPath);
  await rename(temporaryPath, outputPath);
  await Promise.all(["-0.log", "-0.log.mbtree"].map((suffix) => unlink(`${passLogPath}${suffix}`).catch(() => {})));
  const record = {
    source_key: asset.source_key,
    approved_source: { local_path: asset.local_path, sha256: sourceSha, size_bytes: sourceStat.size },
    delivery: { local_path: relativeOutput, sha256: deliverySha, size_bytes: outputStat.size },
    video_bitrate: bitrate,
    source_probe: sourceProbe,
    delivery_probe: deliveryProbe,
  };
  return { ...record, qc_evidence_sha256: qcEvidence(record) };
}

export async function buildVideoDeliveryLedger({ manifestPath, videoRoot, ledgerPath, outputDirectory = "course-assets/delivery-v1", targetBytes = DEFAULT_TARGET_BYTES, runner = execFileAsync }) {
  try {
    await stat(ledgerPath);
    throw new Error("Video delivery ledger already exists; refusing to relabel delivery bytes.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const manifest = await readJson(manifestPath);
  const candidates = manifest.assets.filter((asset) =>
    asset.kind === "video" && asset.approval_status === "approved" && asset.size_bytes >= SUPABASE_GLOBAL_FILE_LIMIT_BYTES
  );
  const records = [];
  for (const asset of candidates) {
    console.error(`Transcoding ${asset.source_key} (${asset.size_bytes} bytes)...`);
    records.push(await transcodeOne(asset, { videoRoot, outputDirectory, targetBytes, runner }));
    console.error(`Verified ${asset.source_key} (${records.at(-1).delivery.size_bytes} bytes).`);
  }
  const ledger = {
    schema_version: VIDEO_DELIVERY_LEDGER_SCHEMA,
    target_max_bytes: targetBytes,
    transcode_contract: TRANSCODE_CONTRACT,
    transcode_contract_sha256: transcodeContractSha256(),
    records,
  };
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx" });
  return ledger;
}

async function main() {
  const options = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const match = process.argv[index].match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`Unexpected argument ${process.argv[index]}.`);
    options.set(match[1], match[2]);
  }
  const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const manifestPath = path.resolve(options.get("manifest") ?? path.join(repoRoot, "content/course-manifests/bmh-employee-training.v1.json"));
  const videoRootOption = options.get("video-root") ?? process.env.BMH_VIDEO_ROOT;
  if (!videoRootOption) {
    throw new Error("Video root is required. Pass --video-root=<path> or set BMH_VIDEO_ROOT.");
  }
  const videoRoot = path.resolve(videoRootOption);
  const ledgerPath = path.resolve(options.get("ledger") ?? path.join(repoRoot, "docs/course-production/video-delivery-ledger.json"));
  const targetBytes = Number(options.get("target-bytes") ?? DEFAULT_TARGET_BYTES);
  const ledger = await buildVideoDeliveryLedger({ manifestPath, videoRoot, ledgerPath, targetBytes });
  console.log(JSON.stringify({ status: "created", records: ledger.records.length, ledger: ledgerPath }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
