import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  QUIZ_SOURCE_FILE_NAMES,
  applyArtworkLedger,
  buildGuideAsset,
  buildManifest,
  loadArtworkLedger,
  resolveManifestSourceRoots,
  validateArtworkManifestTrustBoundary,
} from "../../scripts/course-content/build-manifest.mjs";
import { validateBmhArtworkReleaseTrust } from "../../scripts/course-content/import-semantic-gate.mjs";
import { approvePilots, createInitialLedger, deriveMaster, finalizeArtwork, ingestGeneration, promotePilots, reviewMaster } from "../../scripts/course-content/artwork-production-workflow.mjs";

const LEDGER_SCHEMA = "bmh-artwork-production-ledger/v1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = new URL("./bmh-employee-training.v1.json", import.meta.url);
const pilotPath = new URL("../../course-assets/thumbnails/pilots/lesson-cards/orientation-lesson-card-16x10.webp", import.meta.url);

test("an absent artwork ledger leaves the current preapproval artwork records byte-identical", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bmh-artwork-ledger-missing-"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const artwork = manifest.assets.filter((asset) => asset.kind === "image");
  const before = JSON.stringify(artwork);

  const ledger = await loadArtworkLedger(path.join(root, "does-not-exist.json"));
  assert.equal(ledger, null);
  const merged = await applyArtworkLedger(artwork, { schema_version: LEDGER_SCHEMA, assets: [] }, { repoRoot: root });

  assert.equal(JSON.stringify(merged), before);
  assert.equal(merged.length, 49);
  assert.ok(merged.every((asset) => asset.approval_status === "missing" && asset.checksum_sha256 === null && asset.size_bytes === null && !/[a-f0-9]{64}\.webp$/.test(asset.storage_path)));
});

test("a present statusless ledger cannot impersonate an absent optional ledger", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await assert.rejects(
    validateArtworkManifestTrustBoundary(
      manifest,
      { schema_version: LEDGER_SCHEMA, assets: [] },
      {
        repoRoot,
        inventoryPath: path.join(repoRoot, "docs/course-production/thumbnail-pilots/production-inventory.json"),
      },
    ),
    /ledger (?:inventory path drifted|lifecycle status is invalid)/i,
  );
});

test("the guide builder reproduces every approved guide and download binding", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const trackedGuides = manifest.assets.filter((asset) => asset.source_key.startsWith("guide-slot-"));
  const rebuiltGuides = [];
  for (let slot = 1; slot <= 19; slot += 1) rebuiltGuides.push(await buildGuideAsset({ slot }));
  assert.deepEqual(rebuiltGuides, trackedGuides);

  const guidesByKey = new Map(rebuiltGuides.map((asset) => [asset.source_key, asset]));
  for (const courseModule of manifest.program.courses[0].modules) {
    for (const lesson of courseModule.lessons.filter((candidate) => candidate.type === "content")) {
      const download = lesson.blocks.find((block) => block.source_key.startsWith("block-guide-pdf-slot-"));
      const guide = guidesByKey.get(download.content.asset_key);
      assert.equal(download.content.file_path, guide.storage_path);
      assert.equal(download.content.size_bytes, guide.size_bytes);
    }
  }
});

test("the complete preapproval builder reproduces the tracked manifest when canonical media is available", async (t) => {
  try {
    await access("/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lessonA/LESSON-1A-v7.mp4");
  } catch (error) {
    if (error?.code === "ENOENT") {
      t.skip("canonical course media is not present on this runner");
      return;
    }
    throw error;
  }
  const [tracked, rebuilt] = await Promise.all([readFile(manifestPath, "utf8"), buildManifest()]);
  assert.equal(`${JSON.stringify(rebuilt, null, 2).replaceAll("\u2014", "-")}\n`, tracked);
});

test("manifest source roots are portable with CLI precedence over environment defaults", () => {
  const fromEnvironment = resolveManifestSourceRoots([], {
    BMH_COURSE_VIDEO_ROOT: "/fixture/environment/videos",
    BMH_COURSE_QUIZ_ROOT: "/fixture/environment/quizzes",
  });
  assert.deepEqual(fromEnvironment, {
    videoSourceRoot: path.resolve("/fixture/environment/videos"),
    quizSourceRoot: path.resolve("/fixture/environment/quizzes"),
  });

  const fromCli = resolveManifestSourceRoots(
    ["--video-root", "/fixture/cli/videos", "--quiz-root=/fixture/cli/quizzes"],
    {
      BMH_COURSE_VIDEO_ROOT: "/fixture/environment/videos",
      BMH_COURSE_QUIZ_ROOT: "/fixture/environment/quizzes",
    },
  );
  assert.deepEqual(fromCli, {
    videoSourceRoot: path.resolve("/fixture/cli/videos"),
    quizSourceRoot: path.resolve("/fixture/cli/quizzes"),
  });
  assert.throws(
    () => resolveManifestSourceRoots(["--video-root"], {}),
    /Unknown or incomplete manifest-builder argument/,
  );
});

test("the complete manifest builder is deterministic against portable fixture source roots", async (t) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "bmh-manifest-sources-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const videoSourceRoot = path.join(fixtureRoot, "videos");
  const quizSourceRoot = path.join(fixtureRoot, "quizzes");
  const fixtureApprovalPath = path.join(fixtureRoot, "held-video-approvals.json");
  const trackedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const trackedVideos = trackedManifest.assets.filter((asset) => asset.kind === "video");
  const fixtureVideoBySource = new Map();
  const durationByPath = new Map();

  for (const [index, video] of trackedVideos.entries()) {
    const contents = Buffer.from(`deterministic fixture video ${video.source_key}\n`);
    const target = path.join(videoSourceRoot, video.local_path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
    fixtureVideoBySource.set(video.source_key, {
      checksum: createHash("sha256").update(contents).digest("hex"),
      localPath: video.local_path,
    });
    durationByPath.set(path.resolve(target), 60 + index / 10);
  }

  const canonicalApprovalPath = new URL(
    "../../docs/course-production/held-video-review/approvals.json",
    import.meta.url,
  );
  const approvalLedger = JSON.parse(await readFile(canonicalApprovalPath, "utf8"));
  const fixtureRecords = approvalLedger.records.map((record) => {
    if (record.decision === "changes_requested") return record;
    const fixture = fixtureVideoBySource.get(record.source_key);
    return {
      ...record,
      sha256: fixture.checksum,
      candidate_local_path: fixture.localPath,
    };
  });
  for (const historical of approvalLedger.records.filter(
    (record) => record.decision === "changes_requested"
      && !approvalLedger.records.some(
        (candidate) => candidate.source_key === record.source_key
          && candidate.decision !== "changes_requested",
      ),
  )) {
    const fixture = fixtureVideoBySource.get(historical.source_key);
    fixtureRecords.push({
      ...historical,
      sha256: fixture.checksum,
      candidate_local_path: fixture.localPath,
      decision: "pending",
      approver: null,
      date: null,
      notes: null,
    });
  }
  await writeFile(
    fixtureApprovalPath,
    `${JSON.stringify({ ...approvalLedger, records: fixtureRecords }, null, 2)}\n`,
  );

  const quizDirectory = path.join(quizSourceRoot, "_quiz-exports-by-slot");
  await mkdir(quizDirectory, { recursive: true });
  for (const [index, fileName] of QUIZ_SOURCE_FILE_NAMES.entries()) {
    const slot = index + 1;
    const questions = Array.from({ length: 18 }, (_, questionIndex) => ({
      questionType: "SA",
      questionText: `Fixture slot ${slot} question ${questionIndex + 1}`,
      explanation: `Fixture explanation ${slot}-${questionIndex + 1}`,
      choices: ["*Correct fixture answer", "Incorrect fixture answer"],
    }));
    await writeFile(
      path.join(quizDirectory, fileName),
      `${JSON.stringify({ questions }, null, 2)}\n`,
    );
  }

  const options = {
    videoSourceRoot,
    quizSourceRoot,
    videoApprovalLedgerPath: fixtureApprovalPath,
    inspectDuration(fullPath) {
      const duration = durationByPath.get(path.resolve(fullPath));
      assert.ok(duration, `fixture duration missing for ${fullPath}`);
      return duration;
    },
  };
  const first = await buildManifest(options);
  const second = await buildManifest(options);
  assert.deepEqual(second, first);
  for (const video of first.assets.filter((asset) => asset.kind === "video")) {
    assert.equal(
      video.checksum_sha256,
      fixtureVideoBySource.get(video.source_key).checksum,
      `${video.source_key} did not come from the injected video root`,
    );
  }
  assert.equal(
    first.program.courses[0].modules[0].lessons[1].quiz.questions[0].question_text,
    "Fixture slot 1 question 1",
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

  const [result] = await applyArtworkLedger([template], approved, {
    repoRoot: root,
  });

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
    [
      "reference provenance",
      {
        provenance: { ...approved.assets[0].provenance, reference_inputs: [] },
      },
    ],
    ["pixel checksum", { pixel_sha256: null }],
    ["derivative provenance", { derivative: {} }],
    ["artwork kind", { kind: "video-poster" }],
    ["storage path", { storage_path: "courses/wrong.webp" }],
  ];
  for (const [label, override] of malformedCases) {
    await t.test(`fails closed on approved ${label} drift`, async () => {
      const ledger = structuredClone(approved);
      Object.assign(ledger.assets[0], override);
      await assert.rejects(applyArtworkLedger([template], ledger, { repoRoot: root }), /approved artwork/i);
    });
  }

  const incompleteApproval = structuredClone(approved);
  incompleteApproval.status = "production";
  await assert.rejects(applyArtworkLedger([template], incompleteApproval, { repoRoot: root }), /complete finalized ledger/i);

  const approvalWithoutEvidenceChecksum = structuredClone(approved);
  approvalWithoutEvidenceChecksum.final_approval.evidence_sha256 = null;
  await assert.rejects(
    applyArtworkLedger([template], approvalWithoutEvidenceChecksum, {
      repoRoot: root,
    }),
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

  const merged = await applyArtworkLedger(
    [template],
    {
      schema_version: LEDGER_SCHEMA,
      assets: { [localPath]: missingRecord },
    },
    { repoRoot: root },
  );
  assert.deepEqual(merged, [template]);

  await assert.rejects(
    applyArtworkLedger(
      [template],
      {
        schema_version: LEDGER_SCHEMA,
        assets: { "course-assets/posters/not-in-manifest.webp": missingRecord },
      },
      { repoRoot: root },
    ),
    /conflicts with manifest_path|not present in the manifest/i,
  );
});

test("a canonically finalized 49-asset workflow cannot forge held-video release approval", async () => {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "bmh-artwork-ledger-release-"));
  const inventoryPath = path.join(repoRoot, "docs/course-production/thumbnail-pilots/production-inventory.json");
  const [inventory, baseManifest] = await Promise.all([readJson(inventoryPath), readJson(manifestPath)]);
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

  // The approved V8 orientation card and Welcome poster remain immutable, but the
  // additional Mindset crop exposed a post-approval edge defect. Reproduce the
  // explicit remediation lineage before attempting a canonical final review.
  const orientation = ledger.masters.find((master) => master.id === "master-slot-01");
  await deriveMaster({ root, ledger, masterId: orientation.id });
  const remediationPrompt = "docs/course-production/thumbnail-pilots/prompts/production-corrections/slot-01-postapproval-mindset-safe-crop.txt";
  const remediationEvidence = "docs/course-production/thumbnail-pilots/approvals/slot-01-postapproval-defect-2026-07-17.json";
  const promptTarget = path.join(root, remediationPrompt);
  await mkdir(path.dirname(promptTarget), { recursive: true });
  await copyFile(path.join(repoRoot, remediationPrompt), promptTarget);
  await writeEvidence(root, remediationEvidence, {
    master_id: orientation.id,
    parent_source_sha256: orientation.terminal_source_sha256,
    defect: "The additional Mindset fixed crop fails the exact safe-edge review gate.",
    outputs: orientation.outputs.map(({ asset_key: assetKey }) => {
      const asset = ledger.assets.find((candidate) => candidate.asset_key === assetKey);
      return { asset_key: asset.asset_key, checksum_sha256: asset.checksum_sha256 };
    }),
  });
  const remediatedOrientationSource = path.join(root, "provider", "master-slot-01-remediated.png");
  await mkdir(path.dirname(remediatedOrientationSource), { recursive: true });
  await copyFile(
    path.join(repoRoot, "course-assets/thumbnails/production/sources/slot-01-generated.png"),
    remediatedOrientationSource,
  );
  await ingestGeneration({
    root,
    ledger,
    masterId: orientation.id,
    sourceFile: remediatedOrientationSource,
    generationCallId: "integration-slot-01-postapproval-remediation",
    toolOutputId: "integration-slot-01-postapproval-remediation-output",
    generatedAt: "2026-07-16T22:30:00.000Z",
    generatedBy: "artwork-ledger-integration-test",
    correctionPromptPath: remediationPrompt,
    parentSha256: orientation.terminal_source_sha256,
    allowPilotRemediation: true,
    defectEvidencePath: remediationEvidence,
  });

  const productionMasters = ledger.masters.filter((master) => !master.pilot);
  for (const [index, master] of productionMasters.entries()) {
    const sourceFile = path.join(root, "provider", `${master.id}.png`);
    await writeUniqueProviderSource(sourceFile, index + 1, master.background_rgb);
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
  await writeEvidence(
    root,
    finalEvidence,
    ledger.assets.map((asset) => ({
      asset_key: asset.asset_key,
      checksum_sha256: asset.checksum_sha256,
      pixel_sha256: asset.pixel_sha256,
    })),
  );
  const finalized = await finalizeArtwork({
    root,
    ledger,
    manifest: baseManifest,
    approvedBy: "Jarrad Henry",
    approvedAt: "2026-07-17T02:00:00.000Z",
    evidence: finalEvidence,
  });
  const trustedManifest = await validateArtworkManifestTrustBoundary(finalized.manifest, finalized.ledger, { repoRoot: root, inventoryPath });
  assert.deepEqual(
    await validateBmhArtworkReleaseTrust({
      manifest: trustedManifest,
      artworkLedger: finalized.ledger,
      repoRoot: root,
      inventoryPath,
    }),
    [],
  );
  const artwork = trustedManifest.assets.filter((asset) => asset.kind === "image");
  assert.equal(artwork.length, 49);
  assert.ok(
    artwork.every(
      (asset) =>
        asset.approval_status === "approved" &&
        asset.storage_path === immutableStoragePath(ledger.assets.find((candidate) => candidate.asset_key === asset.source_key).base_storage_path, asset.checksum_sha256) &&
        asset.storage_path.includes(asset.checksum_sha256),
    ),
  );

  const forgedLedger = structuredClone(finalized.ledger);
  forgedLedger.assets[0].pixel_sha256 = "f".repeat(64);
  await assert.rejects(
    validateArtworkManifestTrustBoundary(finalized.manifest, forgedLedger, {
      repoRoot: root,
      inventoryPath,
    }),
    /pixel checksum drifted|pixel checksum/i,
  );

  const forgedManifest = structuredClone(trustedManifest);
  const forgedArtwork = forgedManifest.assets.find((asset) => asset.kind === "image");
  forgedArtwork.checksum_sha256 = "f".repeat(64);
  forgedArtwork.storage_path = `${forgedArtwork.storage_path}.forged`;
  assert.ok(
    (await validateBmhArtworkReleaseTrust({
      manifest: forgedManifest,
      artworkLedger: finalized.ledger,
      repoRoot: root,
      inventoryPath,
    })).some((blocker) => blocker.includes("does not exactly match")),
  );

  const releaseManifest = structuredClone(trustedManifest);
  releaseManifest.assets = releaseManifest.assets.map((asset) => {
    if (asset.approval_status !== "hold" && asset.approval_status !== "missing") return asset;
    const checksum = asset.checksum_sha256 ?? createHash("sha256").update(`synthetic-release:${asset.source_key}`).digest("hex");
    return {
      ...asset,
      storage_path: asset.storage_path.includes(checksum) ? asset.storage_path : immutableStoragePath(asset.storage_path, checksum),
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
    const result = spawnSync(path.join(repoRoot, "node_modules/.bin/tsx"), ["scripts/course-import.ts", command, releaseManifestPath], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 1, `${command} dry-run accepted synthetic video approvals without ledger decisions:\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /approved in the manifest without an exact approved ledger decision/);
  }
});

async function copyLockedPilotInputs(root, ledger) {
  const paths = new Set([ledger.inventory_path, ...ledger.references.map((reference) => reference.path)]);
  for (const master of ledger.masters.filter((candidate) => candidate.pilot)) {
    paths.add(master.pilot.lineage_record_path);
    paths.add(master.pilot.checksum_record_path);
    for (const asset of Object.values(master.pilot.assets)) {
      if (asset && typeof asset === "object" && asset.path) paths.add(asset.path);
    }
    if (master.pilot.lineage.generation) {
      const generation = master.pilot.lineage.generation;
      paths.add(generation.prompt_path);
      paths.add(generation.output_path);
      if (generation.parent_path) paths.add(generation.parent_path);
      paths.add(master.pilot.lineage.contact_sheet_input.path);
    } else {
      for (const step of master.pilot.lineage.steps) {
        paths.add(step.prompt_path);
        paths.add(step.output.path);
        for (const input of step.inputs) paths.add(input.path);
      }
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
  const bindingBytes = Buffer.from(pilotBindings.map((binding) => `${binding.slug}|${binding.terminal_output_sha256}|${binding.flat_master_sha256}|${binding.lesson_card_sha256}|${binding.video_poster_sha256}\n`).join(""));
  const generationLineagePaths = new Set(ledger.masters.filter((master) => master.pilot).map((master) => master.pilot.lineage_record_path));
  assert.equal(generationLineagePaths.size, 1);
  const generationLineagePath = [...generationLineagePaths][0];
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
    generation_lineage_sha256: sha256Bytes(await readFile(path.join(root, generationLineagePath))),
    pilot_bindings: pilotBindings,
  };
  const evidence = "evidence/pilot-approval.json";
  await writeEvidence(root, evidence, artifact);
  return { approvedAt, evidence };
}

function lockedPilotBindings(ledger) {
  const bySlug = new Map(ledger.masters.filter((master) => master.pilot).map((master) => [master.pilot.slug, master]));
  return ["orientation", "opening-the-call", "objection-architecture"].map((slug) => {
    const master = bySlug.get(slug);
    assert(master, `Missing locked pilot ${slug}`);
    return {
      slug,
      terminal_output_sha256: master.pilot.lineage.terminal_output_sha256 ?? master.pilot.lineage.generation?.output_sha256,
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

async function writeUniqueProviderSource(filePath, ordinal, background = [103, 182, 255]) {
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
    left: 500 + bit * 60,
    top: 260,
  }));
  await mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 3,
      background: { r: background[0], g: background[1], b: background[2] },
    },
  })
    .composite(markers)
    .removeAlpha()
    .png()
    .toFile(filePath);
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

function approvedRecord({ localPath, checksum, size, dimensions = [1280, 800], sourceKey = "thumbnail-slot-01", index = 1, storagePath }) {
  const kind = localPath.startsWith("course-assets/posters/") ? "video-poster" : sourceKey === "thumbnail-program-bmh-employee-training" ? "course-cover" : "lesson-card";
  const masterId = `master-${index}`;
  const recipe = {
    id: `recipe-${index}`,
    kind,
    source_master_id: masterId,
    operation: "locked-bmh-sticker-derivative",
    target_dimensions: dimensions,
  };
  const recipeSha256 = createHash("sha256").update(JSON.stringify(recipe)).digest("hex");
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
      reference_inputs: [
        {
          id: "style-ref-1",
          role: "locked-style-reference",
          path: "docs/course-production/style-reference.webp",
          sha256: "4".repeat(64),
        },
      ],
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
