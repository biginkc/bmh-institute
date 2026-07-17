import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_PATHS,
  REPO_ROOT,
  createInitialLedger,
  deriveMaster,
  ingestGeneration,
  readJson,
  resolveRepoPath,
  validateLedger,
  writeJsonAtomic,
} from "./artwork-production-workflow.mjs";

const generatedDirectory = "/Users/jarradhenry/.codex/generated_images/019f704b-d999-7a60-8df1-e38173895e3a";
const generatedBy = "/root/thumbnail_batch_v8";
const bindings = [
  ["master-poster-video-slot-04-humanizing-b", "exec-a5114004-c320-4fbc-92c3-8f5be63e23a6.png", "2026-07-17T15:50:27Z"],
  ["master-poster-video-slot-05-offer-b", "exec-2010f52f-43f2-4ba7-969c-8b4326a40ffd.png", "2026-07-17T15:51:12Z"],
  ["master-poster-video-slot-04-ideal-seller", "exec-60e7793e-dd76-4243-bd2c-b151d5561c85.png", "2026-07-17T15:51:53Z"],
  ["master-poster-video-slot-06-framework", "exec-35914562-76e8-4a00-a234-30782f6f43df.png", "2026-07-17T15:52:31Z"],
  ["master-poster-video-slot-11-trust", "exec-a2c8bb8c-e029-4c05-ae9a-cee8223c991e.png", "2026-07-17T15:53:15Z"],
  ["master-poster-video-slot-12-faq-b", "exec-0e6119df-d4ca-458e-a6e6-16e09ee82077.png", "2026-07-17T15:53:56Z"],
  ["master-poster-video-slot-18-operator", "exec-d517e279-0cf0-4f29-9593-9a6be9d7531c.png", "2026-07-17T15:54:40Z"],
];
const migratedAssetKeys = bindings.map(([masterId]) => masterId.replace(/^master-/, ""));

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function findFileByChecksum(directory, checksum) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileByChecksum(candidate, checksum);
      if (nested) return nested;
    } else if (entry.isFile() && sha256(await readFile(candidate)) === checksum) {
      return candidate;
    }
  }
  return null;
}

async function restoreMasterFiles(master, assets) {
  const lineageDirectory = resolveRepoPath(REPO_ROOT, path.posix.join(path.posix.dirname(master.source_path), "lineage", master.id));
  for (const [destination, checksum] of [
    [master.source_path, master.terminal_source_sha256],
    [master.flat_master_path, master.flat_master_sha256],
    ...assets.map((asset) => [asset.output_path, asset.checksum_sha256]),
  ]) {
    const matching = await findFileByChecksum(lineageDirectory, checksum);
    if (!matching) throw new Error(`Cannot restore ${destination} at ${checksum}`);
    const absoluteDestination = resolveRepoPath(REPO_ROOT, destination);
    await mkdir(path.dirname(absoluteDestination), { recursive: true });
    await copyFile(matching, absoluteDestination);
  }
}

function dynamicMasterState(master) {
  return {
    status: master.status,
    terminal_source_sha256: master.terminal_source_sha256,
    flat_master_sha256: master.flat_master_sha256,
    flat_replacement_authorized_checksum: master.flat_replacement_authorized_checksum,
    flat_history: structuredClone(master.flat_history),
    lineage: structuredClone(master.lineage),
    review: structuredClone(master.review),
  };
}

const inventory = await readJson(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.inventory));
const manifest = await readJson(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.manifest));
const ledgerPath = resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.ledger);
const oldLedger = await readJson(ledgerPath);
const expected = createInitialLedger(inventory);
const oldMasters = new Map(oldLedger.masters.map((master) => [master.id, master]));
const oldAssets = new Map(oldLedger.assets.map((asset) => [asset.asset_key, asset]));
const migrated = new Set(migratedAssetKeys);

const masters = expected.masters.map((planned) => {
  const old = oldMasters.get(planned.id);
  return old ? { ...planned, ...dynamicMasterState(old) } : planned;
});
const mastersById = new Map(masters.map((master) => [master.id, master]));

const assets = expected.assets.map((planned) => {
  const old = oldAssets.get(planned.asset_key);
  if (!old || migrated.has(planned.asset_key)) return planned;
  const owner = mastersById.get(planned.provenance.master_id);
  return {
    ...old,
    source_key: planned.source_key,
    manifest_path: planned.manifest_path,
    output_path: planned.output_path,
    base_storage_path: planned.base_storage_path,
    dimensions: planned.dimensions,
    kind: planned.kind,
    art_direction: structuredClone(planned.art_direction),
    provenance: {
      ...old.provenance,
      master_id: planned.provenance.master_id,
      source_master_id: planned.provenance.source_master_id,
      prompt_sha256: owner.prompt_sha256,
      reference_ids: structuredClone(owner.reference_ids),
      reference_inputs: structuredClone(owner.reference_inputs),
      derivative_recipe_id: planned.provenance.derivative_recipe_id,
      derivative_recipe_sha256: planned.provenance.derivative_recipe_sha256,
    },
    derivative: structuredClone(planned.derivative),
  };
});

const approvalArtifact = await readJson(resolveRepoPath(REPO_ROOT, oldLedger.pilot_approval.evidence));
const ledger = {
  ...oldLedger,
  references: structuredClone(expected.references),
  counts: structuredClone(expected.counts),
  masters,
  assets,
  pilot_approval: {
    ...oldLedger.pilot_approval,
    approved_inventory_sha256: approvalArtifact.inventory_sha256,
  },
  status: "production",
  updated_at: "2026-07-17T15:50:27Z",
};

await validateLedger({ root: REPO_ROOT, inventory, manifest, ledger, inspectFiles: false });

const migrationRecords = [];
for (const assetKey of migratedAssetKeys) {
  const old = oldAssets.get(assetKey);
  if (!old?.checksum_sha256) throw new Error(`${assetKey} has no prior output to archive`);
  const sourcePath = resolveRepoPath(REPO_ROOT, old.output_path);
  const archivePath = `course-assets/posters/production/sources/lineage/master-${assetKey}/migration/prior-grouped-${old.checksum_sha256}.webp`;
  const absoluteArchive = resolveRepoPath(REPO_ROOT, archivePath);
  await mkdir(path.dirname(absoluteArchive), { recursive: true });
  let contents;
  try {
    contents = await readFile(absoluteArchive);
    if (sha256(contents) !== old.checksum_sha256) throw new Error(`${assetKey} migration archive conflicts`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    contents = await readFile(sourcePath);
    if (sha256(contents) !== old.checksum_sha256) throw new Error(`${assetKey} changed before migration`);
    await copyFile(sourcePath, absoluteArchive);
  }
  await rm(sourcePath, { force: true });
  migrationRecords.push({
    asset_key: assetKey,
    prior_master_id: old.provenance.master_id,
    replacement_master_id: `master-${assetKey}`,
    archived_path: archivePath,
    checksum_sha256: old.checksum_sha256,
    pixel_sha256: old.pixel_sha256,
    size_bytes: old.size_bytes,
  });
}

for (const [masterId, filename, generatedAt] of bindings) {
  const sourceFile = path.join(generatedDirectory, filename);
  const fileInfo = await stat(sourceFile);
  if (!fileInfo.isFile()) throw new Error(`Missing generated source ${sourceFile}`);
  await ingestGeneration({
    root: REPO_ROOT,
    ledger,
    masterId,
    sourceFile,
    generationCallId: `imagegen-${masterId.replace(/^master-/, "")}-20260717`,
    toolOutputId: filename.replace(/\.png$/, ""),
    generatedAt,
    generatedBy,
  });
  await deriveMaster({ root: REPO_ROOT, ledger, masterId });
}

const termsMaster = mastersById.get("master-slot-02");
await restoreMasterFiles(
  oldMasters.get("master-slot-02"),
  oldLedger.assets.filter((asset) => asset.provenance.master_id === "master-slot-02"),
);
await ingestGeneration({
  root: REPO_ROOT,
  ledger,
  masterId: "master-slot-02",
  sourceFile: path.join(generatedDirectory, "exec-25158f03-2799-4e21-bd74-2b6722a4a6db.png"),
  generationCallId: "imagegen-slot-02-terms-v10-evidence-correction-20260717",
  toolOutputId: "exec-25158f03-2799-4e21-bd74-2b6722a4a6db",
  generatedAt: "2026-07-17T16:03:13Z",
  generatedBy,
  correctionPromptPath: "docs/course-production/thumbnail-pilots/prompts/production-corrections/slot-02-terms-v10-evidence-correction.txt",
  parentSha256: termsMaster.terminal_source_sha256,
});
await deriveMaster({ root: REPO_ROOT, ledger, masterId: "master-slot-02" });

const migrationRecordPath = resolveRepoPath(
  REPO_ROOT,
  "docs/course-production/thumbnail-pilots/qa/distinct-poster-master-migration-2026-07-17.json",
);
await writeJsonAtomic(
  migrationRecordPath,
  {
    schema_version: "bmh-distinct-poster-master-migration/v1",
    reason: "replace repeated grouped poster poses with exact-video-specific independent masters",
    terms_v10_evidence_correction: {
      master_id: "master-slot-02",
      video_sha256: "6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769",
      contact_sheet_sha256: "e5e869d33d440ba155dd8f5088f2039f96a2cfb105a5ea9be79911933f2f363c",
      tool_output_id: "exec-25158f03-2799-4e21-bd74-2b6722a4a6db",
    },
    assets: migrationRecords,
  },
  { root: REPO_ROOT },
);

await validateLedger({ root: REPO_ROOT, inventory, manifest, ledger });
await writeJsonAtomic(ledgerPath, ledger, { root: REPO_ROOT });
console.log(JSON.stringify({ masters: ledger.masters.length, assets: ledger.assets.length, migrated: migrationRecords.length }, null, 2));
