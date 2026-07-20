import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  DEFAULT_PATHS,
  reconcileManifestFromLedger,
  resolveRepoPath,
  validateLedger,
  withWorkflowLock,
} from "./artwork-production-workflow.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const REVIEW_ROOT = "docs/course-production/thumbnail-redesign";
const PREAPPROVAL_INDEX = `${REVIEW_ROOT}/approvals/preapproval-review-index-2026-07-20.json`;
const PREAPPROVAL_EVIDENCE = `${REVIEW_ROOT}/approvals/preapproval-review-evidence-2026-07-20.json`;
const PREAPPROVAL_BOARD = `${REVIEW_ROOT}/approvals/preapproval-review-board-2026-07-20.png`;
const APPROVAL_PATH = `${REVIEW_ROOT}/approvals/thumbnail-redesign-approval-2026-07-20.json`;
const CANARY_MANIFEST_PATH = "content/course-manifests/bmh-employee-training-canary.v1.json";
const RESPONSE_TEXT = "Okay you have my approval for the thumbnails Go ahead and get them iInto the application";
const ASSIGNMENT_POLICY = "assignments-remain-thumbnail-free";
const DISPLAY_WEBP_QUALITY = 90;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const absolute = (relative) => resolveRepoPath(ROOT, relative);
const storagePath = (base, checksum) => {
  const extension = path.posix.extname(base);
  return `${base.slice(0, -extension.length)}-${checksum}${extension}`;
};

async function readJson(relative) {
  return JSON.parse(await readFile(absolute(relative), "utf8"));
}

async function writeAtomic(relative, contents) {
  const target = absolute(relative);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, target);
}

async function exactFileRecord(relative) {
  const target = absolute(relative);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected regular file: ${relative}`);
  const contents = await readFile(target);
  return { contents, sha256: sha256(contents), size: contents.length };
}

async function buildApprovalArtifact(approvedAt) {
  if (!Number.isFinite(Date.parse(approvedAt)) || !approvedAt.endsWith("Z")) {
    throw new Error("--approved-at must be an ISO UTC timestamp");
  }
  const [index, preapprovalEvidence, ...surfaceRecords] = await Promise.all([
    readJson(PREAPPROVAL_INDEX),
    readJson(PREAPPROVAL_EVIDENCE),
    exactFileRecord(PREAPPROVAL_INDEX),
    exactFileRecord(PREAPPROVAL_EVIDENCE),
    exactFileRecord(PREAPPROVAL_BOARD),
  ]);
  if (preapprovalEvidence.review_index_sha256 !== surfaceRecords[0].sha256) {
    throw new Error("Archived preapproval evidence does not bind the archived review index");
  }
  const reviewedAssets = new Map(
    [...preapprovalEvidence.approved_assets, ...preapprovalEvidence.draft_assets]
      .map((item) => [item.binding, item]),
  );
  const content = index.items.filter((item) => item.kind === "content");
  if (content.length !== 19) throw new Error("Approval surface must contain exactly 19 content thumbnails");
  const assets = [];
  for (const item of content) {
    const sourcePath = `${REVIEW_ROOT}/${item.asset}`;
    const source = await exactFileRecord(sourcePath);
    const metadata = await sharp(source.contents).metadata();
    if (metadata.format !== "png" || metadata.width !== 1280 || metadata.height !== 800) {
      throw new Error(`${item.binding} approved source must be a 1280 x 800 PNG`);
    }
    const reviewed = reviewedAssets.get(item.binding);
    if (
      !reviewed ||
      reviewed.visible_order !== item.visible_order ||
      reviewed.title !== item.title ||
      reviewed.asset !== item.asset ||
      reviewed.checksum_sha256 !== source.sha256 ||
      reviewed.size_bytes !== source.size ||
      reviewed.dimensions?.join("x") !== `${metadata.width}x${metadata.height}`
    ) {
      throw new Error(`${item.binding} no longer matches the archived preapproval evidence`);
    }
    assets.push({
      visible_order: item.visible_order,
      title: item.title,
      asset_key: item.binding,
      source_path: sourcePath,
      source_sha256: source.sha256,
    });
  }
  return {
    schema_version: "bmh-thumbnail-redesign-approval/v1",
    decision: "approved",
    approver: "Jarrad Henry",
    approved_at: approvedAt,
    response_text: RESPONSE_TEXT,
    assignment_policy: ASSIGNMENT_POLICY,
    review_surface: {
      status_at_review: "15-approved-6-drafts-4-assignments-not-required",
      files: [PREAPPROVAL_INDEX, PREAPPROVAL_EVIDENCE, PREAPPROVAL_BOARD].map((file, indexPosition) => ({
        path: file,
        sha256: surfaceRecords[indexPosition].sha256,
      })),
    },
    assets,
  };
}

async function encodeApprovedWebp(source) {
  const output = await sharp(source)
    .removeAlpha()
    .webp({ quality: DISPLAY_WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toBuffer();
  const metadata = await sharp(output).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1280 || metadata.height !== 800 || metadata.hasAlpha) {
    throw new Error("Promoted thumbnail must be an opaque 1280 x 800 WebP");
  }
  const outputPixels = await sharp(output).removeAlpha().raw().toBuffer();
  return { contents: output, checksum: sha256(output), pixelChecksum: sha256(outputPixels) };
}

function displayRecipe(binding) {
  return {
    id: `${binding.asset_key}-approved-display-webp-v1`,
    kind: "lesson-card-display",
    source_path: binding.source_path,
    source_sha256: binding.source_sha256,
    operation: "encode-approved-png-as-display-webp",
    target_dimensions: [1280, 800],
    output_format: "webp",
    quality: DISPLAY_WEBP_QUALITY,
    effort: 6,
    smart_subsample: true,
  };
}

function bindCurrentReplacement(output, binding, promoted, artifact, artifactChecksum) {
  const recipe = displayRecipe(binding);
  output.legacy_provenance ??= {
    schema_version: "bmh-thumbnail-redesign-legacy-provenance/v1",
    art_direction: structuredClone(output.art_direction),
    generation: structuredClone(output.provenance),
    derivative: structuredClone(output.derivative),
    review: structuredClone(output.review_provenance),
  };
  output.current_replacement_provenance = {
    schema_version: "bmh-thumbnail-redesign-current-provenance/v1",
    source: {
      path: binding.source_path,
      sha256: binding.source_sha256,
      dimensions: [1280, 800],
      format: "png",
    },
    derivative: {
      recipe,
      recipe_sha256: sha256(JSON.stringify(recipe)),
    },
    review: {
      status: "approved",
      reviewed_by: artifact.approver,
      reviewed_at: artifact.approved_at,
      evidence: APPROVAL_PATH,
      evidence_sha256: artifactChecksum,
    },
    output: {
      checksum_sha256: promoted.checksum,
      pixel_sha256: promoted.pixelChecksum,
      size_bytes: promoted.contents.length,
    },
  };
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

function reconcileCanaryManifest(canaryManifest, ledger) {
  const next = structuredClone(canaryManifest);
  const output = ledger.assets.find((asset) => asset.asset_key === "thumbnail-slot-03");
  const asset = next.assets.find((candidate) => candidate.source_key === "thumbnail-slot-03");
  if (!output || !asset) throw new Error("Canary manifest is missing thumbnail-slot-03");
  const extension = path.posix.extname(asset.storage_path);
  const stem = asset.storage_path.slice(0, -extension.length);
  const base = stem.replace(/-[a-f0-9]{64}$/, "");
  asset.storage_path = `${base}-${output.checksum_sha256}${extension}`;
  asset.checksum_sha256 = output.checksum_sha256;
  asset.size_bytes = output.size_bytes;
  return next;
}

async function verify() {
  const workflow = await loadWorkflow();
  await validateLedger({ root: ROOT, inventory: workflow.inventory, manifest: workflow.manifest, ledger: workflow.ledger });
  const replacements = workflow.ledger.assets.filter((asset) => asset.redesign_replacement !== undefined);
  if (replacements.length !== 19) throw new Error("Thumbnail redesign has not promoted all 19 content thumbnails");
  console.log(JSON.stringify({ valid: true, replacements: replacements.length, approval: workflow.ledger.thumbnail_redesign_approval.evidence }, null, 2));
}

async function promote(approvedAt) {
  const artifact = await buildApprovalArtifact(approvedAt);
  const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  const artifactChecksum = sha256(artifactBytes);
  const existingApproval = await readFile(absolute(APPROVAL_PATH)).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existingApproval && !existingApproval.equals(artifactBytes)) {
    throw new Error("Existing thumbnail redesign approval artifact differs from this approval capture");
  }
  const workflow = await loadWorkflow();
  if (workflow.ledger.status !== "finalized") throw new Error("Thumbnail redesign requires the existing finalized artwork ledger");
  await validateLedger({ root: ROOT, inventory: workflow.inventory, manifest: workflow.manifest, ledger: workflow.ledger, inspectFiles: true, allowLegacyRedesignProvenance: true });
  const prepared = new Map();
  for (const binding of artifact.assets) {
    const source = await exactFileRecord(binding.source_path);
    if (source.sha256 !== binding.source_sha256) throw new Error(`${binding.asset_key} approved source drifted`);
    prepared.set(binding.asset_key, { source, promoted: await encodeApprovedWebp(source.contents) });
  }
  const totalDisplayBytes = [...prepared.values()].reduce((sum, item) => sum + item.promoted.contents.length, 0);
  if (totalDisplayBytes > 1_500_000) throw new Error(`Thumbnail display payload exceeds 1.5 MB: ${totalDisplayBytes}`);
  if (!existingApproval) await writeAtomic(APPROVAL_PATH, artifactBytes);
  if (workflow.ledger.thumbnail_redesign_approval !== undefined) {
    for (const binding of artifact.assets) {
      const output = workflow.ledger.assets.find((asset) => asset.asset_key === binding.asset_key);
      if (!output?.redesign_replacement) throw new Error(`Missing redesign replacement ${binding.asset_key}`);
      const { promoted } = prepared.get(binding.asset_key);
      const current = await exactFileRecord(output.manifest_path);
      if (![output.checksum_sha256, promoted.checksum].includes(current.sha256)) {
        throw new Error(`${binding.asset_key} canonical bytes drifted before display optimization`);
      }
      if (output.checksum_sha256 !== promoted.checksum) {
        const archivedChecksum = output.checksum_sha256;
        const archivePath = `course-assets/thumbnails/redesign-history/${binding.asset_key}-${archivedChecksum}.webp`;
        const existingArchive = await readFile(absolute(archivePath)).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
        if (existingArchive && sha256(existingArchive) !== archivedChecksum) throw new Error(`${binding.asset_key} display archive conflicts`);
        if (!existingArchive) {
          if (current.sha256 !== archivedChecksum) throw new Error(`${binding.asset_key} resumed display optimization is missing its archive`);
          await writeAtomic(archivePath, current.contents);
        }
        output.history.push({
          version: output.history.length + 1,
          lineage_sequence: output.provenance.lineage_steps,
          archived_path: archivePath,
          checksum_sha256: archivedChecksum,
          pixel_sha256: output.pixel_sha256,
          size_bytes: output.size_bytes,
          recipe_sha256: output.current_replacement_provenance?.derivative.recipe_sha256 ?? sha256(JSON.stringify({
            operation: "encode-approved-png-as-lossless-webp",
            source_path: binding.source_path,
            source_sha256: binding.source_sha256,
            target_dimensions: [1280, 800],
            output_format: "lossless-webp",
          })),
          review: {
            status: "approved",
            reviewed_by: artifact.approver,
            reviewed_at: artifact.approved_at,
            evidence: APPROVAL_PATH,
            evidence_sha256: artifactChecksum,
          },
        });
        if (current.sha256 !== promoted.checksum) await writeAtomic(output.manifest_path, promoted.contents);
      }
      output.checksum_sha256 = promoted.checksum;
      output.pixel_sha256 = promoted.pixelChecksum;
      output.size_bytes = promoted.contents.length;
      output.storage_path = storagePath(output.base_storage_path, promoted.checksum);
      output.redesign_replacement.output_checksum_sha256 = promoted.checksum;
      output.redesign_replacement.output_pixel_sha256 = promoted.pixelChecksum;
      bindCurrentReplacement(output, binding, promoted, artifact, artifactChecksum);
    }
    workflow.manifest = reconcileManifestFromLedger(workflow.ledger, workflow.manifest);
    workflow.canaryManifest = reconcileCanaryManifest(workflow.canaryManifest, workflow.ledger);
    await Promise.all([
      writeAtomic(DEFAULT_PATHS.ledger, Buffer.from(`${JSON.stringify(workflow.ledger, null, 2)}\n`)),
      writeAtomic(DEFAULT_PATHS.manifest, Buffer.from(`${JSON.stringify(workflow.manifest, null, 2)}\n`)),
      writeAtomic(CANARY_MANIFEST_PATH, Buffer.from(`${JSON.stringify(workflow.canaryManifest, null, 2)}\n`)),
    ]);
    await verify();
    return;
  }

  for (const binding of artifact.assets) {
    const output = workflow.ledger.assets.find((asset) => asset.asset_key === binding.asset_key);
    if (!output || output.kind !== "lesson-card") throw new Error(`Missing lesson-card output ${binding.asset_key}`);
    const { promoted } = prepared.get(binding.asset_key);
    const previousChecksum = output.checksum_sha256;
    const previousPixelChecksum = output.pixel_sha256;
    const previousSize = output.size_bytes;
    const current = await exactFileRecord(output.manifest_path);
    if (![previousChecksum, promoted.checksum].includes(current.sha256)) {
      throw new Error(`${binding.asset_key} canonical bytes drifted before replacement`);
    }
    const historyPath = `course-assets/thumbnails/redesign-history/${binding.asset_key}-${previousChecksum}.webp`;
    const existingHistory = await readFile(absolute(historyPath)).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (existingHistory && sha256(existingHistory) !== previousChecksum) throw new Error(`${binding.asset_key} history archive conflicts`);
    if (!existingHistory) {
      if (current.sha256 !== previousChecksum) throw new Error(`${binding.asset_key} resumed replacement is missing its prior-byte archive`);
      await writeAtomic(historyPath, current.contents);
    }

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
    if (current.sha256 !== promoted.checksum) await writeAtomic(output.manifest_path, promoted.contents);
    output.checksum_sha256 = promoted.checksum;
    output.pixel_sha256 = promoted.pixelChecksum;
    output.size_bytes = promoted.contents.length;
    output.storage_path = storagePath(output.base_storage_path, promoted.checksum);
    output.redesign_replacement = {
      schema_version: "bmh-thumbnail-redesign-replacement/v1",
      source_path: binding.source_path,
      source_sha256: binding.source_sha256,
      replaced_checksum_sha256: previousChecksum,
      output_checksum_sha256: promoted.checksum,
      output_pixel_sha256: promoted.pixelChecksum,
      approval_evidence: APPROVAL_PATH,
      approval_evidence_sha256: artifactChecksum,
      approved_by: artifact.approver,
      approved_at: artifact.approved_at,
    };
    bindCurrentReplacement(output, binding, promoted, artifact, artifactChecksum);
  }

  workflow.ledger.thumbnail_redesign_approval = {
    schema_version: "bmh-thumbnail-redesign-ledger-approval/v1",
    status: "approved",
    approved_by: artifact.approver,
    approved_at: artifact.approved_at,
    evidence: APPROVAL_PATH,
    evidence_sha256: artifactChecksum,
    assignment_policy: ASSIGNMENT_POLICY,
  };
  workflow.ledger.updated_at = artifact.approved_at;
  workflow.manifest = reconcileManifestFromLedger(workflow.ledger, workflow.manifest);
  workflow.canaryManifest = reconcileCanaryManifest(workflow.canaryManifest, workflow.ledger);
  await Promise.all([
    writeAtomic(DEFAULT_PATHS.ledger, Buffer.from(`${JSON.stringify(workflow.ledger, null, 2)}\n`)),
    writeAtomic(DEFAULT_PATHS.manifest, Buffer.from(`${JSON.stringify(workflow.manifest, null, 2)}\n`)),
    writeAtomic(CANARY_MANIFEST_PATH, Buffer.from(`${JSON.stringify(workflow.canaryManifest, null, 2)}\n`)),
  ]);
  await verify();
}

const [command = "verify", ...args] = process.argv.slice(2);
if (command === "promote") {
  const approvedAt = args.find((argument) => argument.startsWith("--approved-at="))?.slice("--approved-at=".length);
  if (!approvedAt) throw new Error("Usage: promote-thumbnail-redesign.mjs promote --approved-at=ISO");
  await withWorkflowLock(ROOT, () => promote(approvedAt));
} else if (command === "verify") {
  await withWorkflowLock(ROOT, verify);
} else {
  throw new Error("Usage: promote-thumbnail-redesign.mjs <promote --approved-at=ISO|verify>");
}
