import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  DEFAULT_PATHS,
  reconcileManifestFromLedger,
  validateLedger,
} from "./artwork-production-workflow.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const REVIEW_ROOT = "docs/course-production/thumbnail-redesign";
const PREAPPROVAL_INDEX = `${REVIEW_ROOT}/approvals/preapproval-review-index-2026-07-20.json`;
const PREAPPROVAL_EVIDENCE = `${REVIEW_ROOT}/approvals/preapproval-review-evidence-2026-07-20.json`;
const PREAPPROVAL_BOARD = `${REVIEW_ROOT}/approvals/preapproval-review-board-2026-07-20.png`;
const APPROVAL_PATH = `${REVIEW_ROOT}/approvals/thumbnail-redesign-approval-2026-07-20.json`;
const RESPONSE_TEXT = "Okay you have my approval for the thumbnails Go ahead and get them iInto the application";
const ASSIGNMENT_POLICY = "assignments-remain-thumbnail-free";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const absolute = (relative) => path.join(ROOT, relative);
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
  const [index, ...surfaceRecords] = await Promise.all([
    readJson(PREAPPROVAL_INDEX),
    exactFileRecord(PREAPPROVAL_INDEX),
    exactFileRecord(PREAPPROVAL_EVIDENCE),
    exactFileRecord(PREAPPROVAL_BOARD),
  ]);
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
  const output = await sharp(source).removeAlpha().webp({ lossless: true, effort: 6 }).toBuffer();
  const metadata = await sharp(output).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1280 || metadata.height !== 800 || metadata.hasAlpha) {
    throw new Error("Promoted thumbnail must be an opaque 1280 x 800 WebP");
  }
  const [sourcePixels, outputPixels] = await Promise.all([
    sharp(source).removeAlpha().raw().toBuffer(),
    sharp(output).removeAlpha().raw().toBuffer(),
  ]);
  if (!sourcePixels.equals(outputPixels)) throw new Error("Lossless WebP does not preserve the approved PNG pixels");
  return { contents: output, checksum: sha256(output), pixelChecksum: sha256(outputPixels) };
}

async function loadWorkflow() {
  const [inventory, manifest, ledger] = await Promise.all([
    readJson(DEFAULT_PATHS.inventory),
    readJson(DEFAULT_PATHS.manifest),
    readJson(DEFAULT_PATHS.ledger),
  ]);
  return { inventory, manifest, ledger };
}

async function verify() {
  const workflow = await loadWorkflow();
  await validateLedger({ root: ROOT, ...workflow });
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
  if (!existingApproval) await writeAtomic(APPROVAL_PATH, artifactBytes);

  const workflow = await loadWorkflow();
  if (workflow.ledger.status !== "finalized") throw new Error("Thumbnail redesign requires the existing finalized artwork ledger");
  if (workflow.ledger.thumbnail_redesign_approval !== undefined) {
    workflow.manifest = reconcileManifestFromLedger(workflow.ledger, workflow.manifest);
    await writeAtomic(DEFAULT_PATHS.manifest, Buffer.from(`${JSON.stringify(workflow.manifest, null, 2)}\n`));
    await verify();
    return;
  }

  for (const binding of artifact.assets) {
    const output = workflow.ledger.assets.find((asset) => asset.asset_key === binding.asset_key);
    if (!output || output.kind !== "lesson-card") throw new Error(`Missing lesson-card output ${binding.asset_key}`);
    const source = await exactFileRecord(binding.source_path);
    if (source.sha256 !== binding.source_sha256) throw new Error(`${binding.asset_key} approved source drifted`);
    const promoted = await encodeApprovedWebp(source.contents);
    const current = await exactFileRecord(output.manifest_path);
    if (current.sha256 !== output.checksum_sha256) throw new Error(`${binding.asset_key} canonical bytes drifted before replacement`);
    const historyPath = `course-assets/thumbnails/redesign-history/${binding.asset_key}-${current.sha256}.webp`;
    const existingHistory = await readFile(absolute(historyPath)).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (existingHistory && sha256(existingHistory) !== current.sha256) throw new Error(`${binding.asset_key} history archive conflicts`);
    if (!existingHistory) await writeAtomic(historyPath, current.contents);

    output.history.push({
      version: output.history.length + 1,
      lineage_sequence: output.provenance.lineage_steps,
      archived_path: historyPath,
      checksum_sha256: output.checksum_sha256,
      pixel_sha256: output.pixel_sha256,
      size_bytes: output.size_bytes,
      recipe_sha256: output.derivative.recipe_sha256,
      review: structuredClone(workflow.ledger.masters.find((master) => master.id === output.provenance.master_id).review),
    });
    await writeAtomic(output.manifest_path, promoted.contents);
    output.checksum_sha256 = promoted.checksum;
    output.pixel_sha256 = promoted.pixelChecksum;
    output.size_bytes = promoted.contents.length;
    output.storage_path = storagePath(output.base_storage_path, promoted.checksum);
    output.redesign_replacement = {
      schema_version: "bmh-thumbnail-redesign-replacement/v1",
      source_path: binding.source_path,
      source_sha256: binding.source_sha256,
      replaced_checksum_sha256: current.sha256,
      output_checksum_sha256: promoted.checksum,
      output_pixel_sha256: promoted.pixelChecksum,
      approval_evidence: APPROVAL_PATH,
      approval_evidence_sha256: artifactChecksum,
      approved_by: artifact.approver,
      approved_at: artifact.approved_at,
    };
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
  await Promise.all([
    writeAtomic(DEFAULT_PATHS.ledger, Buffer.from(`${JSON.stringify(workflow.ledger, null, 2)}\n`)),
    writeAtomic(DEFAULT_PATHS.manifest, Buffer.from(`${JSON.stringify(workflow.manifest, null, 2)}\n`)),
  ]);
  await verify();
}

const [command = "verify", ...args] = process.argv.slice(2);
if (command === "promote") {
  const approvedAt = args.find((argument) => argument.startsWith("--approved-at="))?.slice("--approved-at=".length);
  if (!approvedAt) throw new Error("Usage: promote-thumbnail-redesign.mjs promote --approved-at=ISO");
  await promote(approvedAt);
} else if (command === "verify") {
  await verify();
} else {
  throw new Error("Usage: promote-thumbnail-redesign.mjs <promote --approved-at=ISO|verify>");
}
