import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  applyArtworkLedger,
  buildManifest,
  loadArtworkLedger,
  validateArtworkManifestTrustBoundary,
} from "../../scripts/course-content/build-manifest.mjs";
import {
  approvePilots,
  createInitialLedger,
  deriveMaster,
  finalizeArtwork,
  ingestGeneration,
  promotePilots,
  reviewMaster,
} from "../../scripts/course-content/artwork-production-workflow.mjs";

const LEDGER_SCHEMA = "bmh-artwork-production-ledger/v1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = new URL("./bmh-employee-training.v1.json", import.meta.url);
const pilotPath = new URL(
  "../../course-assets/thumbnails/pilots/lesson-cards/orientation-lesson-card-16x10.webp",
  import.meta.url,
);

test("an absent artwork ledger leaves the current preapproval artwork records byte-identical", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-artwork-ledger-missing-"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const artwork = manifest.assets.filter((asset) => asset.kind === "image");
  const before = JSON.stringify(artwork);

  const ledger = await loadArtworkLedger(path.join(root, "does-not-exist.json"));
  assert.equal(ledger, null);
  const merged = await applyArtworkLedger(
    artwork,
    { schema_version: LEDGER_SCHEMA, assets: [] },
    { repoRoot: root },
  );

  assert.equal(JSON.stringify(merged), before);
  assert.equal(merged.length, 49);
  assert.ok(merged.every((asset) =>
    asset.approval_status === "missing"
    && asset.checksum_sha256 === null
    && asset.size_bytes === null
    && !/[a-f0-9]{64}\.webp$/.test(asset.storage_path)));
});

test("a present statusless ledger cannot impersonate an absent optional ledger", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await assert.rejects(
    validateArtworkManifestTrustBoundary(
      manifest,
      { schema_version: LEDGER_SCHEMA, assets: [] },
      { repoRoot, inventoryPath: path.join(repoRoot, "docs/course-production/thumbnail-pilots/production-inventory.json") },
    ),
    /ledger (?:inventory path drifted|lifecycle status is invalid)/i,
  );
});

test("the complete preapproval builder reproduces the tracked manifest", async () => {
  const [tracked, rebuilt] = await Promise.all([
    readFile(manifestPath, "utf8"),
    buildManifest(),
  ]);
  assert.equal(
    `${JSON.stringify(rebuilt, null, 2).replaceAll("\u2014", "-")}\n`,
    tracked,
  );
});

test("an approved ledger record supplies verified immutable manifest metadata", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-artwork-ledger-approved-"));
  const localPath = "course-assets/thumbnails/slot-01.webp";
  const absolutePath = path.join(root, localPath);
  const contents = await readFile(pilotPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
  const checksum = createHash("sha256").update(contents).digest("hex");
  const template = artworkTemplate(localPath);
  const approved = finalizedLedger([
    approvedRecord({
      localPath,
      checksum,
      size: contents.length,
      storagePath: immutableStoragePath(template.storage_path, checksum),
    }),
  ]);

  const [result] = await applyArtworkLedger([template], approved, { repoRoot: root });

  assert.deepEqual(result, {
    ...template,
    storage_path: `courses/bmh-employee-training/v1/thumbnails/slot-01-${checksum}.webp`,
    checksum_sha256: checksum,
    size_bytes: contents.length,
    approval_status: "approved",
  });
  assert.ok(result.storage_path.includes(result.checksum_sha256));

  const malformedCases = [
    ["output path", { output_path: "course-assets/thumbnails/wrong.webp" }],
    ["checksum", { checksum_sha256: "0".repeat(64) }],
    ["size", { size_bytes: contents.length + 1 }],
    ["dimensions", { dimensions: [1280, 720] }],
    ["provenance", { provenance: {} }],
    ["reference provenance", {
      provenance: { ...approved.assets[0].provenance, reference_inputs: [] },
    }],
    ["pixel checksum", { pixel_sha256: null }],
    ["derivative provenance", { derivative: {} }],
    ["artwork kind", { kind: "video-poster" }],
    ["storage path", { storage_path: "courses/wrong.webp" }],
  ];
  for (const [label, override] of malformedCases) {
    await t.test(`fails closed on approved ${label} drift`, async () => {
      const ledger = structuredClone(approved);
      Object.assign(ledger.assets[0], override);
      await assert.rejects(
        applyArtworkLedger([template], ledger, { repoRoot: root }),
        /approved artwork/i,
      );
    });
  }

  const incompleteApproval = structuredClone(approved);
  incompleteApproval.status = "production";
  await assert.rejects(
    applyArtworkLedger([template], incompleteApproval, { repoRoot: root }),
    /complete finalized ledger/i,
  );

  const approvalWithoutEvidenceChecksum = structuredClone(approved);
  approvalWithoutEvidenceChecksum.final_approval.evidence_sha256 = null;
  await assert.rejects(
    applyArtworkLedger([template], approvalWithoutEvidenceChecksum, { repoRoot: root }),
    /final_approval is incomplete/i,
  );
});

test("manifest_path-keyed ledgers must map uniquely to expected artwork", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-artwork-ledger-keyed-"));
  const localPath = "course-assets/thumbnails/slot-01.webp";
  const template = artworkTemplate(localPath);
  const missingRecord = {
    manifest_path: localPath,
    output_path: localPath,
    checksum_sha256: null,
    size_bytes: null,
    approval_status: "missing",
    dimensions: [1280, 800],
    provenance: { status: "not-produced" },
  };

  const merged = await applyArtworkLedger([template], {
    schema_version: LEDGER_SCHEMA,
    assets: { [localPath]: missingRecord },
  }, { repoRoot: root });
  assert.deepEqual(merged, [template]);

  await assert.rejects(
    applyArtworkLedger([template], {
      schema_version: LEDGER_SCHEMA,
      assets: { "course-assets/posters/not-in-manifest.webp": missingRecord },
    }, { repoRoot: root }),
    /conflicts with manifest_path|not present in the manifest/i,
  );
});

test("a canonically finalized 49-asset workflow satisfies release and upload-integrity gates", async () => {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "bmh-artwork-ledger-release-"));
  const inventoryPath = path.join(
    repoRoot,
    "docs/course-production/thumbnail-pilots/production-inventory.json",
  );
  const [inventory, baseManifest] = await Promise.all([
    readJson(inventoryPath),
    readJson(manifestPath),
  ]);
  const ledger = createInitialLedger(inventory);
  await copyLockedPilotInputs(root, ledger);

  const pilotApproval = await writePilotApprovalArtifact(root, ledger);
  await approvePilots({
    root,
    ledger,
    approvedBy: "Jarrad Henry",
    approvedAt: pilotApproval.approvedAt,
    evidence: pilotApproval.evidence,
  });
  await promotePilots({ root, ledger });

  const productionMasters = ledger.masters.filter((master) => !master.pilot);
  for (const [index, master] of productionMasters.entries()) {
    const sourceFile = path.join(root, "provider", `${master.id}.png`);
    await writeUniqueProviderSource(sourceFile, index + 1);
    await ingestGeneration({
      root,
      ledger,
      masterId: master.id,
      sourceFile,
      generationCallId: `integration-generation-${index + 1}`,
      toolOutputId: `integration-output-${index + 1}`,
      generatedAt: new Date(Date.UTC(2026, 6, 16, 23, index)).toISOString(),
      generatedBy: "artwork-ledger-integration-test",
    });
  }

  for (const master of ledger.masters) {
    await deriveMaster({ root, ledger, masterId: master.id });
  }
  for (const [index, master] of ledger.masters.entries()) {
    const reviewEvidence = `evidence/reviews/${master.id}.json`;
    await writeEvidence(root, reviewEvidence, {
      master_id: master.id,
      terminal_source_sha256: master.terminal_source_sha256,
      flat_master_sha256: master.flat_master_sha256,
      outputs: master.outputs.map(({ asset_key: assetKey }) => {
        const asset = ledger.assets.find((candidate) => candidate.asset_key === assetKey);
        return {
          asset_key: asset.asset_key,
          checksum_sha256: asset.checksum_sha256,
          pixel_sha256: asset.pixel_sha256,
        };
      }),
    });
    await reviewMaster({
      root,
      ledger,
      masterId: master.id,
      decision: "approved",
      reviewedBy: "Jarrad Henry",
      reviewedAt: new Date(Date.UTC(2026, 6, 17, 1, index)).toISOString(),
      evidence: reviewEvidence,
    });
  }

  const finalEvidence = "evidence/final-artwork-approval.json";
  await writeEvidence(root, finalEvidence, ledger.assets.map((asset) => ({
    asset_key: asset.asset_key,
    checksum_sha256: asset.checksum_sha256,
    pixel_sha256: asset.pixel_sha256,
  })));
  const finalized = await finalizeArtwork({
    root,
    ledger,
    manifest: baseManifest,
    approvedBy: "Jarrad Henry",
    approvedAt: "2026-07-17T02:00:00.000Z",
    evidence: finalEvidence,
  });
  const trustedManifest = await validateArtworkManifestTrustBoundary(
    finalized.manifest,
    finalized.ledger,
    { repoRoot: root, inventoryPath },
  );
  const artwork = trustedManifest.assets.filter((asset) => asset.kind === "image");
  assert.equal(artwork.length, 49);
  assert.ok(artwork.every((asset) =>
    asset.approval_status === "approved"
    && asset.storage_path === immutableStoragePath(
      ledger.assets.find((candidate) => candidate.asset_key === asset.source_key).base_storage_path,
      asset.checksum_sha256,
    )
    && asset.storage_path.includes(asset.checksum_sha256)));

  const forgedLedger = structuredClone(finalized.ledger);
  forgedLedger.assets[0].pixel_sha256 = "f".repeat(64);
  await assert.rejects(
    validateArtworkManifestTrustBoundary(finalized.manifest, forgedLedger, {
      repoRoot: root,
      inventoryPath,
    }),
    /pixel checksum drifted|pixel checksum/i,
  );

  const releaseManifest = structuredClone(trustedManifest);
  releaseManifest.assets = releaseManifest.assets.map((asset) => {
    if (asset.approval_status !== "hold" && asset.approval_status !== "missing") return asset;
    const checksum = asset.checksum_sha256 ?? createHash("sha256")
      .update(`synthetic-release:${asset.source_key}`)
      .digest("hex");
    return {
      ...asset,
      storage_path: asset.storage_path.includes(checksum)
        ? asset.storage_path
        : immutableStoragePath(asset.storage_path, checksum),
      checksum_sha256: checksum,
      size_bytes: asset.size_bytes ?? 1,
      approval_status: "approved",
    };
  });
  for (const courseModule of releaseManifest.program.courses[0].modules) {
    for (const lesson of courseModule.lessons) {
      for (const block of lesson.blocks ?? []) {
        if (block.type === "role_play") {
          block.content.scenario_id = `production:${block.source_key}`;
        }
      }
    }
  }
  const releaseManifestPath = path.join(root, "release-manifest.json");
  await writeFile(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`);

  for (const command of ["upload", "apply"]) {
    const result = spawnSync(
      path.join(repoRoot, "node_modules/.bin/tsx"),
      ["scripts/course-import.ts", command, releaseManifestPath],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(
      result.status,
      0,
      `${command} dry-run rejected the approved artwork manifest:\n${result.stdout}\n${result.stderr}`,
    );
    assert.match(result.stdout, /"dryRun": true/);
  }
});

async function copyLockedPilotInputs(root, ledger) {
  const paths = new Set([
    ledger.inventory_path,
    "docs/course-production/thumbnail-pilots/generation-lineage.json",
    ...ledger.references.map((reference) => reference.path),
  ]);
  for (const master of ledger.masters.filter((candidate) => candidate.pilot)) {
    for (const asset of Object.values(master.pilot.assets)) {
      if (asset && typeof asset === "object" && asset.path) paths.add(asset.path);
    }
    for (const step of master.pilot.lineage.steps) {
      paths.add(step.prompt_path);
      paths.add(step.output.path);
      for (const input of step.inputs) paths.add(input.path);
    }
  }
  for (const relativePath of paths) {
    const destination = path.join(root, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(repoRoot, relativePath), destination);
  }
}

async function writePilotApprovalArtifact(root, ledger) {
  const approvedAt = "2026-07-16T22:00:00.000Z";
  const requestPath = "docs/course-production/thumbnail-pilots/approval-request.md";
  const request = Buffer.from("Approve the locked three-image BMH artwork pilot.\n");
  await writeRepoFile(root, requestPath, request);

  const pilotBindings = lockedPilotBindings(ledger);
  const bindingBytes = Buffer.from(pilotBindings.map((binding) =>
    `${binding.slug}|${binding.terminal_output_sha256}|${binding.flat_master_sha256}|${binding.lesson_card_sha256}|${binding.video_poster_sha256}\n`
  ).join(""));
  const generationLineagePath = "docs/course-production/thumbnail-pilots/generation-lineage.json";
  const artifact = {
    schema_version: "bmh-artwork-pilot-approval/v1",
    decision: "approved",
    approver: "Jarrad Henry",
    approved_at: approvedAt,
    request_binding: {
      request_id: "integration-pilot-approval-2026-07-16",
      request_path: requestPath,
      request_sha256: sha256Bytes(request),
      pilot_bindings_sha256: sha256Bytes(bindingBytes),
    },
    inventory_sha256: sha256Bytes(await readFile(path.join(root, ledger.inventory_path))),
    generation_lineage_sha256: sha256Bytes(
      await readFile(path.join(root, generationLineagePath)),
    ),
    pilot_bindings: pilotBindings,
  };
  const evidence = "evidence/pilot-approval.json";
  await writeEvidence(root, evidence, artifact);
  return { approvedAt, evidence };
}

function lockedPilotBindings(ledger) {
  const bySlug = new Map(
    ledger.masters
      .filter((master) => master.pilot)
      .map((master) => [master.pilot.slug, master]),
  );
  return ["orientation", "opening-the-call", "objection-architecture"].map((slug) => {
    const master = bySlug.get(slug);
    assert(master, `Missing locked pilot ${slug}`);
    return {
      slug,
      terminal_output_sha256: master.pilot.lineage.terminal_output_sha256,
      flat_master_sha256: master.pilot.assets.flat_master.sha256,
      lesson_card_sha256: master.pilot.assets.lesson_card.sha256,
      video_poster_sha256: master.pilot.assets.video_poster.sha256,
    };
  });
}

async function writeRepoFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

function sha256Bytes(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeUniqueProviderSource(filePath, ordinal) {
  const colors = [
    { r: 255, g: 211, b: 1 },
    { r: 0, g: 0, b: 0 },
  ];
  const markers = Array.from({ length: 5 }, (_, bit) => ({
    input: {
      create: {
        width: 50,
        height: 100,
        channels: 3,
        background: colors[(ordinal >> bit) & 1],
      },
    },
    left: 500 + (bit * 60),
    top: 260,
  }));
  await mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 3,
      background: { r: 103, g: 182, b: 255 },
    },
  }).composite(markers).removeAlpha().png().toFile(filePath);
}

async function writeEvidence(root, relativePath, bindings) {
  const evidencePath = path.join(root, relativePath);
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(bindings, null, 2)}\n`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function artworkTemplate(localPath) {
  return {
    source_key: "thumbnail-slot-01",
    kind: "image",
    local_path: localPath,
    storage_path: "courses/bmh-employee-training/v1/thumbnails/slot-01.webp",
    mime_type: "image/webp",
    checksum_sha256: null,
    size_bytes: null,
    approval_status: "missing",
  };
}

function approvedRecord({
  localPath,
  checksum,
  size,
  dimensions = [1280, 800],
  sourceKey = "thumbnail-slot-01",
  index = 1,
  storagePath,
}) {
  const kind = localPath.startsWith("course-assets/posters/")
    ? "video-poster"
    : sourceKey === "thumbnail-program-bmh-employee-training"
      ? "course-cover"
      : "lesson-card";
  const masterId = `master-${index}`;
  const recipe = {
    id: `recipe-${index}`,
    kind,
    source_master_id: masterId,
    operation: "locked-bmh-sticker-derivative",
    target_dimensions: dimensions,
  };
  const recipeSha256 = createHash("sha256")
    .update(JSON.stringify(recipe))
    .digest("hex");
  return {
    asset_key: sourceKey,
    source_key: sourceKey,
    manifest_path: localPath,
    output_path: localPath,
    checksum_sha256: checksum,
    size_bytes: size,
    approval_status: "approved",
    dimensions,
    kind,
    pixel_sha256: createHash("sha256").update(`pixels:${checksum}`).digest("hex"),
    ...(storagePath ? { storage_path: storagePath } : {}),
    provenance: {
      master_id: masterId,
      source_master_id: masterId,
      prompt_sha256: "1".repeat(64),
      reference_ids: ["style-ref-1"],
      reference_inputs: [{
        id: "style-ref-1",
        role: "locked-style-reference",
        path: "docs/course-production/style-reference.webp",
        sha256: "4".repeat(64),
      }],
      terminal_source_sha256: "2".repeat(64),
      flat_master_sha256: "3".repeat(64),
      derivative_recipe_id: `recipe-${index}`,
      derivative_recipe_sha256: recipeSha256,
      lineage_steps: 1,
      reviewed_by: "Jarrad Henry",
      reviewed_at: "2026-07-16T22:00:00.000Z",
      review_evidence: "docs/course-production/review-evidence/slot-01.md",
      review_evidence_sha256: "5".repeat(64),
    },
    derivative: {
      source_master_id: masterId,
      recipe,
      recipe_sha256: recipeSha256,
    },
  };
}

function immutableStoragePath(storagePath, checksum) {
  const extension = path.posix.extname(storagePath);
  return `${storagePath.slice(0, -extension.length)}-${checksum}${extension}`;
}

function finalizedLedger(assets) {
  return {
    schema_version: LEDGER_SCHEMA,
    status: "finalized",
    pilot_approval: {
      status: "approved",
      approved_by: "Jarrad Henry",
      approved_at: "2026-07-16T21:00:00.000Z",
      evidence: "docs/course-production/pilot-approval.md",
      evidence_sha256: "6".repeat(64),
    },
    final_approval: {
      status: "approved",
      approved_by: "Jarrad Henry",
      approved_at: "2026-07-16T22:00:00.000Z",
      evidence: "docs/course-production/final-artwork-approval.md",
      evidence_sha256: "7".repeat(64),
    },
    assets,
  };
}
