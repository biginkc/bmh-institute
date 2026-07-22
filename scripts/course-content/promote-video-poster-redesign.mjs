import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  DEFAULT_PATHS,
  reconcileManifestFromLedger,
  resolveRepoPath,
  validateLedger,
  withWorkflowLock,
  writeBufferAtomic,
} from "./artwork-production-workflow.mjs";
import {
  commitTransaction,
  recoverPendingTransaction,
} from "./promote-thumbnail-redesign.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const THUMBNAIL_APPROVAL_PATH = "docs/course-production/thumbnail-redesign/approvals/thumbnail-redesign-approval-2026-07-20.json";
const APPROVAL_PATH = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json";
const CANARY_MANIFEST_PATH = "content/course-manifests/bmh-employee-training-canary.v1.json";
const RESPONSE_TEXT = "They should be swapped out";
const DISPLAY_WEBP_QUALITY = 90;
const SOURCE_WIDTH = 1280;
const SOURCE_HEIGHT = 800;
const POSTER_HEIGHT = 720;
const MAX_CROP_TOP = SOURCE_HEIGHT - POSTER_HEIGHT;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const absolute = (relative) => resolveRepoPath(ROOT, relative);

async function readJson(relative) {
  return JSON.parse(await readFile(absolute(relative), "utf8"));
}

async function exactFileRecord(relative) {
  const target = absolute(relative);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected regular file: ${relative}`);
  const contents = await readFile(target);
  return { contents, sha256: sha256(contents), size: contents.length };
}

async function writeAtomic(relative, contents) {
  await writeBufferAtomic(absolute(relative), contents, ROOT);
}

function storagePath(base, checksum) {
  const extension = path.posix.extname(base);
  return `${base.slice(0, -extension.length)}-${checksum}${extension}`;
}

function allPosterBindings(manifest, thumbnailApproval) {
  const approvedThumbnails = new Map(thumbnailApproval.assets.map((asset) => [asset.asset_key, asset]));
  const bindings = [];
  for (const course of manifest.program.courses) {
    for (const courseModule of course.modules) {
      for (const lesson of courseModule.lessons) {
        const videos = (lesson.blocks ?? []).filter((block) => block.type === "video");
        if (videos.length === 0) continue;
        const thumbnail = approvedThumbnails.get(lesson.thumbnail_asset_key);
        if (!thumbnail) throw new Error(`${lesson.source_key} has video blocks but no approved redesigned thumbnail`);
        for (const [index, video] of videos.entries()) {
          const cropTop = videos.length === 1
            ? MAX_CROP_TOP / 2
            : Math.round((index * MAX_CROP_TOP) / (videos.length - 1));
          bindings.push({
            lesson_key: lesson.source_key,
            lesson_title: lesson.title,
            video_key: video.content.asset_key,
            poster_asset_key: video.content.poster_asset_key,
            source_thumbnail_asset_key: lesson.thumbnail_asset_key,
            source_path: thumbnail.source_path,
            source_sha256: thumbnail.source_sha256,
            crop: { left: 0, top: cropTop, width: SOURCE_WIDTH, height: POSTER_HEIGHT },
          });
        }
      }
    }
  }
  if (bindings.length !== 29) throw new Error(`Expected 29 video poster bindings, got ${bindings.length}`);
  if (new Set(bindings.map((binding) => binding.poster_asset_key)).size !== 29) {
    throw new Error("Every video must retain a distinct poster asset key");
  }
  return bindings;
}

async function encodePoster(binding) {
  const source = await exactFileRecord(binding.source_path);
  if (source.sha256 !== binding.source_sha256) throw new Error(`${binding.source_thumbnail_asset_key} approved source drifted`);
  const metadata = await sharp(source.contents).metadata();
  if (metadata.format !== "png" || metadata.width !== SOURCE_WIDTH || metadata.height !== SOURCE_HEIGHT) {
    throw new Error(`${binding.source_thumbnail_asset_key} must remain an approved 1280 x 800 PNG`);
  }
  const contents = await sharp(source.contents)
    .extract(binding.crop)
    .removeAlpha()
    .webp({ quality: DISPLAY_WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toBuffer();
  const outputMetadata = await sharp(contents).metadata();
  if (outputMetadata.format !== "webp" || outputMetadata.width !== SOURCE_WIDTH || outputMetadata.height !== POSTER_HEIGHT || outputMetadata.hasAlpha) {
    throw new Error(`${binding.poster_asset_key} poster derivative is invalid`);
  }
  const pixels = await sharp(contents).removeAlpha().raw().toBuffer();
  return { contents, checksum: sha256(contents), pixelChecksum: sha256(pixels) };
}

function recipe(binding) {
  return {
    id: `${binding.poster_asset_key}-approved-thumbnail-crop-v1`,
    kind: "video-poster-display",
    source_thumbnail_asset_key: binding.source_thumbnail_asset_key,
    source_path: binding.source_path,
    source_sha256: binding.source_sha256,
    operation: "crop-approved-thumbnail-png-as-video-poster-webp",
    crop: binding.crop,
    target_dimensions: [SOURCE_WIDTH, POSTER_HEIGHT],
    output_format: "webp",
    quality: DISPLAY_WEBP_QUALITY,
    effort: 6,
    smart_subsample: true,
  };
}

async function buildApprovalArtifact(approvedAt, manifest) {
  if (!Number.isFinite(Date.parse(approvedAt)) || !approvedAt.endsWith("Z")) {
    throw new Error("--approved-at must be an ISO UTC timestamp");
  }
  const [thumbnailApproval, thumbnailApprovalRecord] = await Promise.all([
    readJson(THUMBNAIL_APPROVAL_PATH),
    exactFileRecord(THUMBNAIL_APPROVAL_PATH),
  ]);
  if (thumbnailApproval.decision !== "approved" || thumbnailApproval.approver !== "Jarrad Henry") {
    throw new Error("Video posters require the existing approved thumbnail source set");
  }
  return {
    schema_version: "bmh-video-poster-redesign-approval/v1",
    decision: "approved",
    approver: "Jarrad Henry",
    approved_at: approvedAt,
    response_text: RESPONSE_TEXT,
    correction: "Replace all old pre-play video posters with 16:9 derivatives of the matching newly approved lesson thumbnails.",
    source_approval: {
      path: THUMBNAIL_APPROVAL_PATH,
      sha256: thumbnailApprovalRecord.sha256,
    },
    assets: allPosterBindings(manifest, thumbnailApproval),
  };
}

function reconcileCanaryManifest(canaryManifest, ledger) {
  const next = structuredClone(canaryManifest);
  const output = ledger.assets.find((asset) => asset.asset_key === "poster-video-slot-03-tech-stack");
  const asset = next.assets.find((candidate) => candidate.source_key === output?.asset_key);
  if (!output || !asset) throw new Error("Canary manifest is missing the Tech Stack video poster");
  const extension = path.posix.extname(asset.storage_path);
  const stem = asset.storage_path.slice(0, -extension.length);
  const base = stem.replace(/-[a-f0-9]{64}$/, "");
  asset.storage_path = `${base}-${output.checksum_sha256}${extension}`;
  asset.checksum_sha256 = output.checksum_sha256;
  asset.size_bytes = output.size_bytes;
  return next;
}

async function loadWorkflow() {
  const [inventory, manifest, canaryManifest, ledger] = await Promise.all([
    readJson(DEFAULT_PATHS.inventory),
    readJson(DEFAULT_PATHS.manifest),
    readJson(CANARY_MANIFEST_PATH),
    readJson(DEFAULT_PATHS.ledger),
  ]);
  return { inventory, manifest, canaryManifest, ledger };
}

async function verify() {
  const workflow = await loadWorkflow();
  await validateLedger({ root: ROOT, inventory: workflow.inventory, manifest: workflow.manifest, ledger: workflow.ledger });
  const replacements = workflow.ledger.assets.filter((asset) => asset.poster_redesign_replacement !== undefined);
  if (replacements.length !== 29) throw new Error(`Expected 29 redesigned video posters, got ${replacements.length}`);
  if (new Set(replacements.map((asset) => asset.pixel_sha256)).size !== 29) {
    throw new Error("Redesigned video poster pixels must remain unique");
  }
  const canaryPoster = workflow.canaryManifest.assets.find((asset) => asset.source_key === "poster-video-slot-03-tech-stack");
  const fullPoster = replacements.find((asset) => asset.asset_key === "poster-video-slot-03-tech-stack");
  const canaryVideos = workflow.canaryManifest.program.courses.flatMap((course) =>
    course.modules.flatMap((courseModule) =>
      courseModule.lessons.flatMap((lesson) => (lesson.blocks ?? []).filter((block) => block.type === "video")),
    ),
  );
  if (!canaryPoster || !fullPoster || canaryVideos.length !== 1) {
    throw new Error("Canary manifest must retain exactly the Tech Stack video poster binding");
  }
  if (canaryVideos[0].content.poster_asset_key !== canaryPoster.source_key) {
    throw new Error("Canary video block poster binding drifted");
  }
  if (!canaryPoster.storage_path.startsWith("courses/bmh-employee-training-canary/v1/posters/")) {
    throw new Error("Canary video poster escaped its canary storage namespace");
  }
  if (canaryPoster.checksum_sha256 !== fullPoster.checksum_sha256 || canaryPoster.size_bytes !== fullPoster.size_bytes) {
    throw new Error("Canary video poster bytes drifted from the approved full-manifest poster");
  }
  console.log(JSON.stringify({ valid: true, replacements: replacements.length, approval: workflow.ledger.video_poster_redesign_approval.evidence }, null, 2));
}

async function promote(approvedAt) {
  const workflow = await loadWorkflow();
  if (workflow.ledger.status !== "finalized") throw new Error("Video poster redesign requires the existing finalized artwork ledger");
  await validateLedger({ root: ROOT, inventory: workflow.inventory, manifest: workflow.manifest, ledger: workflow.ledger });
  const artifact = await buildApprovalArtifact(approvedAt, workflow.manifest);
  const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  const artifactChecksum = sha256(artifactBytes);
  const existingApproval = await readFile(absolute(APPROVAL_PATH)).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existingApproval && !existingApproval.equals(artifactBytes)) throw new Error("Existing video poster redesign approval differs from this approval capture");
  if (!existingApproval) await writeAtomic(APPROVAL_PATH, artifactBytes);
  if (workflow.ledger.video_poster_redesign_approval !== undefined) {
    if (!existingApproval || workflow.ledger.video_poster_redesign_approval.evidence_sha256 !== artifactChecksum) {
      throw new Error("Existing video poster redesign ledger binding differs from this approval capture");
    }
    await verify();
    return;
  }

  const prepared = new Map();
  for (const binding of artifact.assets) prepared.set(binding.poster_asset_key, await encodePoster(binding));
  if (new Set([...prepared.values()].map((item) => item.pixelChecksum)).size !== 29) {
    throw new Error("Approved thumbnail crops did not produce 29 unique posters");
  }

  const writes = [];
  for (const binding of artifact.assets) {
    const output = workflow.ledger.assets.find((asset) => asset.asset_key === binding.poster_asset_key);
    if (!output || output.kind !== "video-poster") throw new Error(`Missing video poster ${binding.poster_asset_key}`);
    const promoted = prepared.get(binding.poster_asset_key);
    const previousChecksum = output.checksum_sha256;
    const previousPixelChecksum = output.pixel_sha256;
    const previousSize = output.size_bytes;
    const current = await exactFileRecord(output.manifest_path);
    if (current.sha256 !== previousChecksum) throw new Error(`${output.asset_key} canonical poster drifted before replacement`);
    const historyPath = `course-assets/posters/redesign-history/${output.asset_key}-${previousChecksum}.webp`;
    const existingHistory = await readFile(absolute(historyPath)).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (existingHistory && sha256(existingHistory) !== previousChecksum) throw new Error(`${output.asset_key} poster history archive conflicts`);
    if (!existingHistory) await writeAtomic(historyPath, current.contents);

    output.history.push({
      version: output.history.length + 1,
      lineage_sequence: output.provenance.lineage_steps,
      archived_path: historyPath,
      checksum_sha256: previousChecksum,
      pixel_sha256: previousPixelChecksum,
      size_bytes: previousSize,
      recipe_sha256: output.derivative.recipe_sha256,
      review: structuredClone(workflow.ledger.masters.find((master) => master.id === output.provenance.master_id).review),
    });
    output.poster_legacy_provenance = {
      schema_version: "bmh-video-poster-redesign-legacy-provenance/v1",
      art_direction: structuredClone(output.art_direction),
      generation: structuredClone(output.provenance),
      derivative: structuredClone(output.derivative),
      review: structuredClone(output.review_provenance),
    };
    const posterRecipe = recipe(binding);
    output.poster_redesign_replacement = {
      schema_version: "bmh-video-poster-redesign-replacement/v1",
      source_thumbnail_asset_key: binding.source_thumbnail_asset_key,
      source_path: binding.source_path,
      source_sha256: binding.source_sha256,
      crop: binding.crop,
      replaced_checksum_sha256: previousChecksum,
      output_checksum_sha256: promoted.checksum,
      output_pixel_sha256: promoted.pixelChecksum,
      approval_evidence: APPROVAL_PATH,
      approval_evidence_sha256: artifactChecksum,
      approved_by: artifact.approver,
      approved_at: artifact.approved_at,
    };
    output.current_poster_replacement_provenance = {
      schema_version: "bmh-video-poster-redesign-current-provenance/v1",
      source: {
        thumbnail_asset_key: binding.source_thumbnail_asset_key,
        path: binding.source_path,
        sha256: binding.source_sha256,
        dimensions: [SOURCE_WIDTH, SOURCE_HEIGHT],
        format: "png",
      },
      derivative: { recipe: posterRecipe, recipe_sha256: sha256(JSON.stringify(posterRecipe)) },
      review: {
        status: "approved",
        reviewed_by: artifact.approver,
        reviewed_at: artifact.approved_at,
        evidence: APPROVAL_PATH,
        evidence_sha256: artifactChecksum,
      },
      output: { checksum_sha256: promoted.checksum, pixel_sha256: promoted.pixelChecksum, size_bytes: promoted.contents.length },
    };
    output.checksum_sha256 = promoted.checksum;
    output.pixel_sha256 = promoted.pixelChecksum;
    output.size_bytes = promoted.contents.length;
    output.storage_path = storagePath(output.base_storage_path, promoted.checksum);
    writes.push({ target: output.manifest_path, contents: promoted.contents });
  }

  workflow.ledger.video_poster_redesign_approval = {
    schema_version: "bmh-video-poster-redesign-ledger-approval/v1",
    status: "approved",
    approved_by: artifact.approver,
    approved_at: artifact.approved_at,
    evidence: APPROVAL_PATH,
    evidence_sha256: artifactChecksum,
    source_approval_evidence: artifact.source_approval.path,
    source_approval_evidence_sha256: artifact.source_approval.sha256,
  };
  workflow.ledger.updated_at = artifact.approved_at;
  workflow.manifest = reconcileManifestFromLedger(workflow.ledger, workflow.manifest);
  workflow.canaryManifest = reconcileCanaryManifest(workflow.canaryManifest, workflow.ledger);
  writes.push(
    { target: DEFAULT_PATHS.ledger, contents: Buffer.from(`${JSON.stringify(workflow.ledger, null, 2)}\n`) },
    { target: DEFAULT_PATHS.manifest, contents: Buffer.from(`${JSON.stringify(workflow.manifest, null, 2)}\n`) },
    { target: CANARY_MANIFEST_PATH, contents: Buffer.from(`${JSON.stringify(workflow.canaryManifest, null, 2)}\n`) },
  );
  await commitTransaction(writes);
  await verify();
}

export async function main(argv = process.argv.slice(2)) {
  const [command = "verify", ...args] = argv;
  if (command === "promote") {
    const approvedAt = args.find((argument) => argument.startsWith("--approved-at="))?.slice("--approved-at=".length);
    if (!approvedAt) throw new Error("Usage: promote-video-poster-redesign.mjs promote --approved-at=ISO");
    await withWorkflowLock(ROOT, async () => {
      await recoverPendingTransaction();
      await promote(approvedAt);
    });
  } else if (command === "verify") {
    await withWorkflowLock(ROOT, async () => {
      await recoverPendingTransaction();
      await verify();
    });
  } else {
    throw new Error("Usage: promote-video-poster-redesign.mjs <promote --approved-at=ISO|verify>");
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
