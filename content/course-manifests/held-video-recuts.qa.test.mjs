import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import {
  HELD_VIDEO_SCRIPT_REVIEW_PATHS,
  HELD_VIDEO_SCRIPT_REVIEW_QUESTION,
  HEYGEN_DRAFT_CONTRACT,
  HEYGEN_MAX_VIDEO_INPUTS,
  LEARNER_THINK_GAP_SECONDS,
  STUDIO_IMPORT_MAX_CHARS,
  assertCleanStudioNarrationLine,
  buildHeldVideoScriptReviewArtifacts,
  generatedRecutPaths,
  heldVideoScriptReviewBindingPayload,
  humanizerNegativeParallelismViolations,
  loadRecutPackages,
  providerSceneSequence,
  recutSpokenWordCount,
  renderHeygenDraftPackage,
  renderStudioImportInventory,
  renderStudioImportSidecar,
  renderStudioImportText,
  sceneDeliverySegments,
  spokenDeliveryText,
  validateHeldVideoScriptReviewResponse,
} from "../../scripts/course-content/build-held-video-recut-docs.mjs";
import {
  validateRecutPackage,
  validateHeldVideoRecuts,
  validateSpokenPolicy,
} from "../../scripts/course-content/validate-held-video-recuts.mjs";
import {
  validateHeldVideoApprovalLedger,
  validateHeldVideoApprovalHistory,
  validateHeldVideoManifestApprovalState,
  validateHeldVideoApprovalTransition,
} from "../../scripts/course-content/held-video-approval-ledger.mjs";
import { validateLocalPolicyCandidates } from "../../scripts/course-content/held-video-local-policy-candidates.mjs";
import {
  HELD_VIDEO_STUDIO_SETUP_PATH,
  validateHeldVideoStudioSetup,
} from "../../scripts/course-content/held-video-studio-setup.mjs";
import { currentReviewedVideoRecord } from "../../scripts/course-content/build-manifest.mjs";

const manifestPromise = readFile(
  new URL("./bmh-employee-training.v1.json", import.meta.url),
  "utf8",
).then(JSON.parse);
const policyPromise = readFile(
  new URL(
    "../../docs/course-production/held-video-recuts/recut-policy.json",
    import.meta.url,
  ),
  "utf8",
).then(JSON.parse);
const ledgerPromise = readFile(
  new URL(
    "../../docs/course-production/held-video-review/approvals.json",
    import.meta.url,
  ),
  "utf8",
).then(JSON.parse);
const localPolicyCandidatesPromise = readFile(
  new URL(
    "../../docs/course-production/held-video-review/local-policy-candidates.json",
    import.meta.url,
  ),
  "utf8",
).then(JSON.parse);

const teamReferenceInventoryPromise = readFile(
  new URL(
    "../../docs/course-production/held-video-recuts/generated/team-reference-docx.json",
    import.meta.url,
  ),
  "utf8",
).then(JSON.parse);

const studioImportInventoryPromise = readFile(
  new URL(
    "../../docs/course-production/held-video-recuts/generated/studio-import-inventory.json",
    import.meta.url,
  ),
  "utf8",
).then(JSON.parse);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readZipEntry(archive, wantedName) {
  let offset = 0;
  while (offset + 30 <= archive.length) {
    if (archive.readUInt32LE(offset) !== 0x04034b50) break;
    const flags = archive.readUInt16LE(offset + 6);
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const fileNameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    assert.equal(flags & 0x08, 0, "DOCX entries must record sizes in local headers");
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = archive.subarray(nameStart, nameEnd).toString("utf8");
    if (name === wantedName) {
      const payload = archive.subarray(dataStart, dataEnd);
      if (method === 0) return payload;
      if (method === 8) return inflateRawSync(payload);
      throw new Error(`Unsupported DOCX compression method ${method}`);
    }
    offset = dataEnd;
  }
  throw new Error(`DOCX entry not found: ${wantedName}`);
}

async function currentReviewAssets() {
  const [manifest, inventory] = await Promise.all([
    manifestPromise,
    localPolicyCandidatesPromise,
  ]);
  return [
    ...manifest.assets.filter(
      (asset) => asset.kind === "video" && asset.approval_status === "hold",
    ),
    ...inventory.candidates.map((candidate) => ({
      source_key: candidate.source_key,
      checksum_sha256: candidate.sha256,
      local_path: candidate.local_path,
      approval_status: candidate.approval_status === "approved_exact_cut" ? "approved" : "hold",
    })),
  ];
}

test("all seven policy recuts preserve source, objective, transition, and production gates", async () => {
  const result = await validateHeldVideoRecuts();
  assert.deepEqual(result, {
    approvalRecords: 11,
    pendingApprovalRecords: 0,
    recutPackages: 7,
    scriptReviewStatus: "pending-human-script-and-scene-approval",
    studioSettingsVerificationAuthorized: false,
    releaseQaStatus: "pending-script-approval",
    heldVideoReleaseReady: false,
    errors: [],
  });
});

test("the spoken policy rejects money, quotas, timelines, promises, and role titles", async () => {
  const policy = await policyPromise;
  const cases = [
    ["You will receive $500.", "currency_amount"],
    ["You must make 150 calls a day.", "fixed_activity_quota"],
    ["Aim for 60 to 80 dials in this block.", "fixed_activity_quota"],
    ["You are making 150-plus calls a day.", "fixed_activity_quota"],
    ["You can move up in six months.", "fixed_timeline"],
    ["You earn a commission on every deal.", "compensation_promise"],
    [
      "There is a management path with higher earnings.",
      "compensation_promise",
    ],
    ["The Acquisition Manager takes over.", "role_title"],
    ["The Navigator takes over.", "role_title"],
    ["Andrea works with the acquisition team.", "role_title"],
    ["A seller who says no in week one may agree in week six.", "fixed_stage_progression"],
    ["I can guarantee your net.", "outcome_guarantee"],
    ["Update Sandra after every call.", "provider_specific_claim"],
    ["Take a 15 minute break.", "fixed_daily_schedule"],
  ];
  for (const [spokenText, expectedRule] of cases) {
    assert.ok(
      validateSpokenPolicy(
        "video-slot-17-compensation",
        spokenText,
        policy,
      ).some((error) => error.includes(expectedRule)),
      `${expectedRule} must fail closed`,
    );
  }
});

test("Terms v10 and KPIs v12 are exactly approved, and all nine originals remain changes requested", async () => {
  const [ledger, held] = await Promise.all([ledgerPromise, currentReviewAssets()]);
  assert.deepEqual(validateHeldVideoApprovalLedger(ledger, held), []);
  assert.equal(ledger.records.length, 11);
  assert.equal(
    ledger.records.filter(
      (record) =>
        record.decision === "pending" &&
        record.approver === null &&
        record.date === null &&
        record.notes === null,
    ).length,
    0,
  );
  assert.equal(
    ledger.records.filter(
      (record) =>
        record.decision === "approved" &&
        record.approver === "Jarrad Henry" &&
        record.source_key === "video-slot-02-terms" &&
        record.sha256 === "6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769",
    ).length,
    1,
  );
  assert.equal(
    ledger.records.filter(
      (record) =>
        record.decision === "approved" &&
        record.approver === "Jarrad Henry" &&
        record.source_key === "video-slot-16-kpis" &&
        record.sha256 === "3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a",
    ).length,
    1,
  );
  assert.equal(
    ledger.records.filter(
      (record) =>
        record.decision === "changes_requested" &&
        record.approver === "BMH Institute content QA" &&
        ["2026-07-16", "2026-07-17"].includes(record.date) &&
        record.notes.includes("Replacement required"),
    ).length,
    9,
  );
});

test("forged local candidate inventory cannot widen the approval transition boundary", async () => {
  const [manifest, ledger, inventory] = await Promise.all([
    manifestPromise,
    ledgerPromise,
    localPolicyCandidatesPromise,
  ]).then((values) => values.map((value) => structuredClone(value)));
  inventory.candidates.push({
    ...inventory.candidates[1],
    candidate_id: "forged-candidate",
    source_key: "video-slot-evil",
    sha256: "e".repeat(64),
    local_path: "course-assets/review-evil/evil.mp4",
  });
  ledger.records.push({
    ...ledger.records.at(-1),
    source_key: "video-slot-evil",
    sha256: "e".repeat(64),
    candidate_local_path: "course-assets/review-evil/evil.mp4",
    decision: "pending",
    approver: null,
    date: null,
    notes: null,
  });
  const errors = validateLocalPolicyCandidates(inventory, manifest, ledger);
  assert.ok(errors.some((error) => error.includes("unexpected local policy candidate")));
});

test("approval transitions require evidence and keep decided checksums immutable", async () => {
  const [ledger, held] = await Promise.all([ledgerPromise, currentReviewAssets()]);
  const current = structuredClone(ledger);
  const pendingIndex = current.records.findIndex((record) =>
    record.source_key === "video-slot-16-kpis" && record.decision === "approved",
  );
  assert.notEqual(pendingIndex, -1);
  Object.assign(current.records[pendingIndex], {
    approver: null,
    date: null,
    decision: "pending",
    notes: null,
  });
  const approved = structuredClone(current);
  Object.assign(approved.records[pendingIndex], {
    approver: "Jarrad Henry",
    date: "2026-07-17",
    decision: "approved",
    notes: "Watched the exact checksum-locked cut.",
  });
  assert.deepEqual(
    validateHeldVideoApprovalTransition(current, approved, held),
    [],
  );

  const reordered = structuredClone(approved);
  [reordered.records[0], reordered.records[1]] = [
    reordered.records[1],
    reordered.records[0],
  ];
  assert.ok(
    validateHeldVideoApprovalTransition(approved, reordered, held).some(
      (error) => error.includes("cannot reorder or insert"),
    ),
  );

  const wrongApprover = structuredClone(approved);
  wrongApprover.records[pendingIndex].approver = "Not Jarrad";
  assert.ok(
    validateHeldVideoApprovalTransition(current, wrongApprover, held).some(
      (error) => error.includes("require approver Jarrad Henry"),
    ),
  );

  const approvedAssetWrongApprover = structuredClone(approved);
  approvedAssetWrongApprover.records[pendingIndex].approver = "Not Jarrad";
  const remainingHeld = held.filter(
    (asset) =>
      asset.source_key !== approvedAssetWrongApprover.records[pendingIndex].source_key ||
      asset.checksum_sha256 !== approvedAssetWrongApprover.records[pendingIndex].sha256,
  );
  assert.ok(
    validateHeldVideoApprovalLedger(
      approvedAssetWrongApprover,
      remainingHeld,
    ).some((error) => error.includes("require approver Jarrad Henry")),
  );

  const missingEvidence = structuredClone(approved);
  missingEvidence.records[pendingIndex].approver = null;
  assert.ok(
    validateHeldVideoApprovalTransition(current, missingEvidence, held).some(
      (error) => error.includes("requires an approver"),
    ),
  );

  const rewrittenDecision = structuredClone(approved);
  Object.assign(rewrittenDecision.records[pendingIndex], {
    decision: "rejected",
    notes: "Rewritten history",
  });
  assert.ok(
    validateHeldVideoApprovalTransition(approved, rewrittenDecision, held).some(
      (error) => error.includes("decision is terminal"),
    ),
  );

  const policyDefectiveApproval = structuredClone(ledger);
  Object.assign(policyDefectiveApproval.records[0], {
    approver: "Jarrad Henry",
    date: "2026-07-16",
    decision: "approved",
    notes: "Approve the old source cut.",
  });
  assert.ok(
    validateHeldVideoApprovalTransition(
      ledger,
      policyDefectiveApproval,
      held,
    ).some((error) => error.includes("policy-defective source cut")),
  );

  const rewrittenPolicyOwner = structuredClone(ledger);
  rewrittenPolicyOwner.records[0].approver = "Jarrad Henry";
  assert.ok(
    validateHeldVideoApprovalLedger(rewrittenPolicyOwner, held).some((error) =>
      error.includes("must retain the BMH Institute content QA decision"),
    ),
  );
});

test("the builder-facing history check rejects a rewritten decided record", async () => {
  const [ledger, reviewAssets] = await Promise.all([ledgerPromise, currentReviewAssets()]);
  const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
  const ledgerPath = fileURLToPath(new URL(
    "../../docs/course-production/held-video-review/approvals.json",
    import.meta.url,
  ));

  assert.deepEqual(await validateHeldVideoApprovalHistory({
    ledger,
    currentReviewAssets: reviewAssets,
    repoRoot,
    ledgerPath,
  }), []);

  const rewritten = structuredClone(ledger);
  const decided = rewritten.records.find((record) => record.decision === "changes_requested");
  assert.ok(decided);
  decided.notes = `${decided.notes} rewritten`;
  const errors = await validateHeldVideoApprovalHistory({
    ledger: rewritten,
    currentReviewAssets: reviewAssets,
    repoRoot,
    ledgerPath,
  });
  assert.ok(errors.some((error) => error.includes("decision is terminal")));
});

test("a corrected replacement can enter review as a new checksum-keyed pending candidate", async () => {
  const [ledger, held] = await Promise.all([ledgerPromise, currentReviewAssets()]);
  const replacementSha256 = "a".repeat(64);
  const replacementPath =
    "course-assets/review-lesson17/LESSON-17-policy-safe-v2.mp4";
  const replacementHeld = held.map((asset) =>
    asset.source_key === "video-slot-17-compensation"
      ? {
          ...asset,
          checksum_sha256: replacementSha256,
          local_path: replacementPath,
        }
      : asset,
  );
  const next = structuredClone(ledger);
  next.updated_at = "2026-07-17";
  next.records.push({
    source_key: "video-slot-17-compensation",
    sha256: replacementSha256,
    candidate_local_path: replacementPath,
    title: "Compensation Engine policy-safe replacement",
    decision: "pending",
    approver: null,
    date: null,
    notes: null,
  });

  assert.deepEqual(
    validateHeldVideoApprovalTransition(ledger, next, replacementHeld),
    [],
  );
});

test("a corrected version can replace a previously pending cut without rewriting history", async () => {
  const [ledger, reviewAssets] = await Promise.all([ledgerPromise, currentReviewAssets()]);
  const current = structuredClone(ledger);
  const old = current.records.find((record) =>
    record.source_key === "video-slot-16-kpis" && record.decision === "approved",
  );
  assert.ok(old);
  Object.assign(old, {
    decision: "pending",
    approver: null,
    date: null,
    notes: null,
  });
  const replacementSha256 = "b".repeat(64);
  const replacementPath = "course-assets/review-lessonA/LESSON-1A-v8.mp4";
  const nextAssets = reviewAssets.map((asset) =>
    asset.source_key === old.source_key && asset.checksum_sha256 === old.sha256
    ? { ...asset, checksum_sha256: replacementSha256, local_path: replacementPath }
    : asset,
  );
  const next = structuredClone(current);
  next.updated_at = "2026-07-17";
  Object.assign(next.records.find((record) => record.decision === "pending"), {
    decision: "changes_requested",
    approver: "Jarrad Henry",
    date: "2026-07-17",
    notes: "Exact checksum-locked cut needs a correction.",
  });
  next.records.push({
    source_key: old.source_key,
    sha256: replacementSha256,
    candidate_local_path: replacementPath,
    title: `${old.title} corrected candidate`,
    decision: "pending",
    approver: null,
    date: null,
    notes: null,
  });

  assert.deepEqual(validateHeldVideoApprovalTransition(current, next, nextAssets), []);
});

test("the immutable ledger supports a final manifest with all 29 videos approved and zero held", async () => {
  const [manifest, ledger] = await Promise.all([manifestPromise, ledgerPromise]);
  const finalLedger = structuredClone(ledger);
  finalLedger.updated_at = "2026-07-17";
  for (const record of finalLedger.records.filter((candidate) => candidate.decision === "pending")) {
    Object.assign(record, {
      decision: "approved",
      approver: "Jarrad Henry",
      date: "2026-07-17",
      notes: "Watched and approved this exact checksum-locked local policy cut.",
    });
  }
  const existingCandidatesBySource = new Map(
    finalLedger.records
      .filter((record) => record.decision === "approved")
      .map((record) => [record.source_key, record]),
  );
  const reviewedKeys = new Set(
    finalLedger.records.map((record) => record.source_key),
  );
  const finalReviewAssets = manifest.assets
    .filter((asset) => asset.kind === "video" && reviewedKeys.has(asset.source_key))
    .map((asset, index) => {
      const existing = existingCandidatesBySource.get(asset.source_key);
      if (existing) {
        return {
          ...asset,
          checksum_sha256: existing.sha256,
          local_path: existing.candidate_local_path,
          approval_status: "approved",
        };
      }
      const checksum = String(index + 1).repeat(64).slice(0, 64);
      const localPath = `course-assets/review-final/${asset.source_key}.mp4`;
      finalLedger.records.push({
        source_key: asset.source_key,
        sha256: checksum,
        candidate_local_path: localPath,
        title: `${asset.source_key} policy-safe replacement`,
        decision: "approved",
        approver: "Jarrad Henry",
        date: "2026-07-17",
        notes: "Watched and approved this exact checksum-locked replacement.",
      });
      return {
        ...asset,
        checksum_sha256: checksum,
        local_path: localPath,
        approval_status: "approved",
      };
    });

  const finalBySource = new Map(finalReviewAssets.map((asset) => [asset.source_key, asset]));
  const finalVideoAssets = manifest.assets
    .filter((asset) => asset.kind === "video")
    .map((asset) => finalBySource.get(asset.source_key) ?? asset);
  assert.equal(finalVideoAssets.length, 29);
  assert.equal(finalVideoAssets.filter((asset) => asset.approval_status === "hold").length, 0);
  assert.ok(finalVideoAssets.every((asset) => asset.approval_status === "approved"));
  assert.deepEqual(validateHeldVideoApprovalLedger(finalLedger, finalReviewAssets), []);
  assert.deepEqual(validateHeldVideoManifestApprovalState(finalLedger, finalReviewAssets), []);
});

test("the real manifest generator selects the latest non-defective checksum record and preserves defective history", async () => {
  const ledger = structuredClone(await ledgerPromise);
  const replacement = {
    source_key: "video-slot-17-compensation",
    sha256: "a".repeat(64),
    candidate_local_path: "course-assets/review-lesson17/LESSON-17-policy-safe-v2.mp4",
    title: "Compensation Engine policy-safe replacement",
    decision: "pending",
    approver: null,
    date: null,
    notes: null,
  };
  ledger.records.push(replacement);

  assert.deepEqual(
    currentReviewedVideoRecord("video-slot-17-compensation", ledger),
    replacement,
  );
  assert.ok(
    ledger.records.some((record) =>
      record.sha256 === "cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846"
      && record.decision === "changes_requested"),
  );

  replacement.decision = "approved";
  replacement.approver = "Jarrad Henry";
  replacement.date = "2026-07-17";
  replacement.notes = "Watched and approved the exact checksum-locked replacement.";
  assert.equal(
    currentReviewedVideoRecord("video-slot-17-compensation", ledger).decision,
    "approved",
  );

  ledger.records.push({
    ...replacement,
    sha256: "b".repeat(64),
    candidate_local_path: "course-assets/review-lesson17/LESSON-17-policy-safe-v3.mp4",
    title: "Compensation Engine second approved replacement",
  });
  assert.throws(
    () => currentReviewedVideoRecord("video-slot-17-compensation", ledger),
    /multiple approved corrected cuts.*explicit supersession/,
  );
});

test("generated scripts contain the exact locked final transition", async () => {
  for (const pkg of await loadRecutPackages()) {
    assert.equal(
      pkg.scenes.at(-1).spoken_text,
      pkg.lesson_contract.transition_spoken_text,
    );
  }
});

test("source evidence fails closed when its file is missing or its checksum is tampered", async () => {
  const [manifest, policy, packages] = await Promise.all([
    manifestPromise,
    policyPromise,
    loadRecutPackages(),
  ]);
  const original = packages.find(
    (pkg) => pkg.source.source_key === "video-slot-01-welcome",
  );

  const missing = structuredClone(original);
  missing.source.source_script_reference =
    "docs/course-production/held-video-recuts/source-evidence/missing.md";
  assert.ok(
    (await validateRecutPackage(missing, manifest, policy)).some((error) =>
      error.includes("source script reference cannot be read"),
    ),
  );

  const tampered = structuredClone(original);
  tampered.source.source_script_sha256 = "0".repeat(64);
  assert.ok(
    (await validateRecutPackage(tampered, manifest, policy)).some((error) =>
      error.includes("source script reference checksum changed"),
    ),
  );
});

test("every recut scene requires a complete visual plan", async () => {
  const [manifest, policy, packages] = await Promise.all([
    manifestPromise,
    policyPromise,
    loadRecutPackages(),
  ]);
  const missingPlan = structuredClone(packages[0]);
  delete missingPlan.scenes[0].visual_plan.editor_note;
  assert.ok(
    (await validateRecutPackage(missingPlan, manifest, policy)).some((error) =>
      error.includes("needs a complete visual plan"),
    ),
  );
});

test("source-depth contracts reject compressed scripts and missing teaching coverage", async () => {
  const [manifest, policy, packages] = await Promise.all([
    manifestPromise,
    policyPromise,
    loadRecutPackages(),
  ]);
  for (const pkg of packages) {
    assert.ok(
      recutSpokenWordCount(pkg) >=
        pkg.source_depth_contract.minimum_replacement_word_count,
      `${pkg.source.source_key} must retain substantive source depth`,
    );
    const compressed = structuredClone(pkg);
    for (const scene of compressed.scenes.slice(0, -1)) {
      scene.spoken_text = "Short placeholder.";
    }
    assert.ok(
      (await validateRecutPackage(compressed, manifest, policy)).some((error) =>
        error.includes("replacement is materially compressed"),
      ),
      `${pkg.source.source_key} compression must fail closed`,
    );

    const missingBeat = structuredClone(pkg);
    const removedBeat = missingBeat.source_depth_contract.required_teaching_beats[0].beat_id;
    for (const scene of missingBeat.scenes) {
      scene.teaching_beat_ids = scene.teaching_beat_ids.filter(
        (beatId) => beatId !== removedBeat,
      );
    }
    assert.ok(
      (await validateRecutPackage(missingBeat, manifest, policy)).some((error) =>
        error.includes(`does not cover required teaching beat ${removedBeat}`),
      ),
      `${pkg.source.source_key} missing beat must fail closed`,
    );
  }
});

test("the objection replacement retains 32 ordered seller-gap-response drills without narrated labels", async () => {
  const pkg = (await loadRecutPackages()).find(
    (candidate) => candidate.source.source_key === "video-slot-10-objection-scripts",
  );
  assert.equal(pkg.source_depth_contract.required_examples.length, 32);
  assert.equal(
    pkg.scenes.flatMap((scene) => scene.example_ids).filter((id) => id.startsWith("d")).length,
    32,
  );
  const delivered = pkg.scenes.map(spokenDeliveryText).join("\n");
  assert.doesNotMatch(delivered, /(?:^|\n)Seller:|\bResponse:/);
  assert.equal(
    pkg.scenes.filter((scene) => scene.spoken_text.startsWith("Seller:")).length,
    32,
  );
  const providerScenes = providerSceneSequence(pkg);
  const thinkGaps = providerScenes.filter(
    (scene) => scene.pause_kind === "learner_think_gap",
  );
  const artifact = JSON.parse(renderHeygenDraftPackage(pkg));
  const payloadThinkGaps = artifact.provider_preparation.scene_boundaries.filter(
    (boundary) => boundary.pause_kind === "learner_think_gap",
  );
  assert.equal(providerScenes.length, pkg.scenes.length + 32);
  assert.equal(thinkGaps.length, 32);
  assert.equal(payloadThinkGaps.length, 32);
  for (const gap of thinkGaps) {
    const response = providerScenes[gap.input_index + 1];
    const payloadGap = payloadThinkGaps.find(
      (boundary) => boundary.segment_id === gap.segment_id,
    );
    const payloadPushback =
      artifact.request_body.video_inputs[gap.input_index].voice.input_text;
    const payloadResponse =
      artifact.request_body.video_inputs[gap.input_index + 1].voice.input_text;
    assert.equal(gap.segment_kind, "seller_pushback");
    assert.equal(gap.pause_after_seconds, LEARNER_THINK_GAP_SECONDS);
    assert.equal(payloadGap.pause_after_seconds, LEARNER_THINK_GAP_SECONDS);
    assert.equal(response.segment_kind, "andrea_response");
    assert.equal(response.segment_id, gap.response_segment_id);
    assert.equal(response.responds_to_segment_id, gap.segment_id);
    assert.equal(response.source_scene_id, gap.source_scene_id);
    assert.equal(payloadGap.response_segment_id, response.segment_id);
    assert.equal(payloadPushback, gap.input_text);
    assert.equal(payloadResponse, response.input_text);
    assert.doesNotMatch(gap.input_text, /\bResponse:/);
    assert.doesNotMatch(response.input_text, /(?:^|\s)Seller:|\bResponse:/);
  }
});

test("humanizer validation rejects negative parallelism before payload preparation", async () => {
  const [manifest, policy, packages] = await Promise.all([
    manifestPromise,
    policyPromise,
    loadRecutPackages(),
  ]);
  const career = structuredClone(
    packages.find(
      (pkg) => pkg.source.source_key === "video-slot-19-career",
    ),
  );
  const scene = career.scenes.find(
    (candidate) => candidate.scene_id === "career-clean-output",
  );
  scene.spoken_text = `${scene.spoken_text} The point is not to fill the page. The point is to make the record useful.`;
  assert.deepEqual(
    humanizerNegativeParallelismViolations(
      career.scenes.map(spokenDeliveryText).join(" "),
    ),
    ["the-point-is-not-the-point-is"],
  );
  assert.ok(
    (await validateRecutPackage(career, manifest, policy)).some((error) =>
      error.includes("violates humanizer negative parallelism"),
    ),
  );
  assert.throws(
    () => renderHeygenDraftPackage(career),
    /violates humanizer negative parallelism/,
  );
});

test("offline HeyGen draft packages are exact, humanized, and provider-gated", async () => {
  for (const pkg of await loadRecutPackages()) {
    const sourceKey = pkg.source.source_key;
    const expected = renderHeygenDraftPackage(pkg);
    assert.equal(
      await readFile(generatedRecutPaths(sourceKey).heygenDraft, "utf8"),
      expected,
    );
    const artifact = JSON.parse(expected);
    assert.equal(
      artifact.status,
      "offline_payload_only_provider_call_forbidden",
    );
    assert.equal(artifact.humanizer_review.result, "passed");
    assert.deepEqual(artifact.provider_gate, {
      provider_call_allowed: false,
      render_allowed: false,
      generate_button_allowed_for_codex: false,
      required_approval: "Jarrad Henry",
      provider_call_executor_after_approval: "Codex controller only",
      final_generate_button_actor: "Jarrad Henry",
    });
    assert.equal(artifact.api_endpoint, HEYGEN_DRAFT_CONTRACT.apiEndpoint);
    assert.equal(
      artifact.request_body.folder_id,
      HEYGEN_DRAFT_CONTRACT.folderId,
    );
    assert.deepEqual(
      artifact.request_body.dimension,
      HEYGEN_DRAFT_CONTRACT.dimension,
    );
    const providerScenes = providerSceneSequence(pkg);
    assert.equal(
      artifact.request_body.video_inputs.length,
      providerScenes.length,
    );
    assert.deepEqual(
      artifact.request_body.video_inputs.map((input) => input.voice.input_text),
      providerScenes.map((scene) => scene.input_text),
    );
    assert.equal(artifact.provider_preparation.every_scene_andrea_speaks, true);
    assert.equal(
      artifact.provider_preparation.canonical_video_input_count,
      providerScenes.length,
    );
    assert.equal(
      artifact.provider_preparation.studio_api_single_request_video_input_limit,
      HEYGEN_MAX_VIDEO_INPUTS,
    );
    assert.equal(
      artifact.provider_preparation.canonical_sequence_fits_single_api_request,
      providerScenes.length <= HEYGEN_MAX_VIDEO_INPUTS,
    );
    assert.deepEqual(
      artifact.provider_preparation.scene_boundaries.map((boundary) =>
        boundary.input_index
      ),
      providerScenes.map((scene) => scene.input_index),
    );
    for (const input of artifact.request_body.video_inputs) {
      assert.equal(
        input.character.talking_photo_id,
        HEYGEN_DRAFT_CONTRACT.avatarLookId,
      );
      assert.equal(input.character.use_avatar_iv_model, true);
      assert.equal(input.voice.type, "text");
      assert.equal(input.voice.voice_id, HEYGEN_DRAFT_CONTRACT.voiceId);
      assert.ok(input.voice.input_text.trim().length > 0);
      assert.ok(input.voice.input_text.length <= 1_800);
      assert.deepEqual(input.background, { type: "color", value: "#ffffff" });
    }
    for (const boundary of artifact.provider_preparation.scene_boundaries) {
      assert.equal(boundary.andrea_speaks, true);
      assert.ok(boundary.pause_after_seconds >= 2);
    }
    assert.doesNotMatch(expected, /api[_-]?key|authorization|secret|token/i);
  }
});

test("one checksum-bound review surface covers all seven scripts and scene plans without authorizing generation", async () => {
  const packages = await loadRecutPackages();
  const expected = await buildHeldVideoScriptReviewArtifacts(packages);
  const [requestText, surface] = await Promise.all([
    readFile(HELD_VIDEO_SCRIPT_REVIEW_PATHS.request, "utf8"),
    readFile(HELD_VIDEO_SCRIPT_REVIEW_PATHS.surface, "utf8"),
  ]);
  assert.equal(requestText, expected.request);
  assert.equal(surface, expected.surface);

  const request = JSON.parse(requestText);
  assert.equal(
    request.schema_version,
    "bmh-held-video-script-review-request/v1",
  );
  assert.equal(request.status, "pending-human-script-and-scene-approval");
  assert.equal(request.question, HELD_VIDEO_SCRIPT_REVIEW_QUESTION);
  assert.equal(request.scope.replacement_video_count, 7);
  assert.deepEqual(request.scope.source_keys, packages.map((pkg) =>
    pkg.source.source_key
  ));
  assert.match(request.scope.bindings_sha256, /^[a-f0-9]{64}$/);
  assert.equal(request.records.length, 7);
  assert.equal(
    request.approval_effect.exact_rendered_cut_review_required_after_generation,
    true,
  );
  assert.ok(request.approval_effect.does_not_authorize.includes("Codex clicking Generate"));
  assert.ok(request.approval_effect.does_not_authorize.includes("any HeyGen or provider API call"));
  assert.ok(request.approval_effect.does_not_authorize.includes("POST https://api.heygen.com/v2/video/generate"));
  assert.equal(request.response_contract.literal_response_required, true);
  assert.equal(
    request.response_contract.complete_request_sha256_binding_required,
    true,
  );
  assert.equal(
    request.response_contract.external_action_allowed_before_valid_response,
    false,
  );
  assert.equal(
    sha256(Buffer.from(JSON.stringify(heldVideoScriptReviewBindingPayload(request)))),
    request.scope.bindings_sha256,
  );
  for (const [index, record] of request.records.entries()) {
    const pkg = packages[index];
    assert.equal(record.source_key, pkg.source.source_key);
    assert.equal(record.held_source_sha256, pkg.source.held_sha256);
    assert.match(record.package_sha256, /^[a-f0-9]{64}$/);
    assert.match(record.script_sha256, /^[a-f0-9]{64}$/);
    assert.match(record.edit_spec_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(record.production_constraints, {
      provider_call_allowed: false,
      render_allowed: false,
      caption_generation_allowed: false,
      approval_status_change_allowed: false,
      generate_button_allowed_for_codex: false,
    });
    assert.match(surface, new RegExp(record.source_key));
    assert.match(surface, new RegExp(record.package_sha256));
    assert.match(surface, new RegExp(record.script_sha256));
    assert.match(
      surface,
      new RegExp(`${record.replacement_scene_count} / ${record.provider_scene_count}`),
    );
    for (const scene of pkg.scenes) assert.match(surface, new RegExp(scene.scene_id));
  }
});

test("the hypothetical future-response shape must preserve literal approval and bind the complete request bytes and scope", async () => {
  const packages = await loadRecutPackages();
  const { request: requestText } = await buildHeldVideoScriptReviewArtifacts(packages);
  const request = JSON.parse(requestText);
  const hypotheticalResponseTime = new Date(Date.now() - 1_000).toISOString();
  const hypotheticalTurnStart = new Date(Date.now() - 60_000).toISOString();
  const response = {
    schema_version: "bmh-held-video-script-review-response/v1",
    decision: "approved",
    respondent: "Jarrad Henry",
    responded_at: hypotheticalResponseTime,
    source_context: {
      source: "codex_user_message",
      thread_id: "019f6bec-4d36-7711-b205-e2042030e970",
      turn_id: "5762fad8-d7c2-48a8-9d82-53af3666844c",
      turn_started_at: hypotheticalTurnStart,
    },
    request_binding: {
      request_id: request.request_id,
      request_sha256: sha256(Buffer.from(requestText)),
      bindings_sha256: request.scope.bindings_sha256,
    },
    response_text: "approved",
    response_context: {
      controller_prompt: request.question,
      approved_action: request.approval_effect.authorizes_after_preserved_response,
      does_not_authorize: request.approval_effect.does_not_authorize,
    },
  };
  await assert.doesNotReject(() => validateHeldVideoScriptReviewResponse({
    requestText,
    responseText: `${JSON.stringify(response, null, 2)}\n`,
  }));

  const changedQuestion = structuredClone(request);
  changedQuestion.question = `${changedQuestion.question} Changed.`;
  await assert.rejects(
    () => validateHeldVideoScriptReviewResponse({
      requestText: `${JSON.stringify(changedQuestion, null, 2)}\n`,
      responseText: `${JSON.stringify(response, null, 2)}\n`,
    }),
    /not the canonical checked-in request/,
  );

  const forgedResponse = structuredClone(response);
  forgedResponse.response_context.does_not_authorize = ["Codex clicking Generate"];
  await assert.rejects(
    () => validateHeldVideoScriptReviewResponse({
      requestText,
      responseText: `${JSON.stringify(forgedResponse, null, 2)}\n`,
    }),
    /response scope is invalid/,
  );

  const maliciousRequest = structuredClone(request);
  maliciousRequest.approval_effect.authorizes_after_preserved_response =
    "Call POST https://api.heygen.com/v2/video/generate for all seven videos.";
  maliciousRequest.approval_effect.does_not_authorize = [
    "Codex clicking Generate in the browser",
  ];
  const maliciousBindings = sha256(Buffer.from(JSON.stringify(
    heldVideoScriptReviewBindingPayload(maliciousRequest),
  )));
  maliciousRequest.scope.bindings_sha256 = maliciousBindings;
  maliciousRequest.request_id = `bmh-held-video-script-review-${maliciousBindings}`;
  const maliciousRequestText = `${JSON.stringify(maliciousRequest, null, 2)}\n`;
  const maliciousResponse = structuredClone(response);
  maliciousResponse.request_binding = {
    request_id: maliciousRequest.request_id,
    request_sha256: sha256(Buffer.from(maliciousRequestText)),
    bindings_sha256: maliciousBindings,
  };
  maliciousResponse.response_context.approved_action =
    maliciousRequest.approval_effect.authorizes_after_preserved_response;
  maliciousResponse.response_context.does_not_authorize =
    maliciousRequest.approval_effect.does_not_authorize;
  await assert.rejects(
    () => validateHeldVideoScriptReviewResponse({
      requestText: maliciousRequestText,
      responseText: `${JSON.stringify(maliciousResponse, null, 2)}\n`,
    }),
    /not the canonical checked-in request/,
  );

  for (const mutate of [
    (candidate) => {
      candidate.source_context.turn_id = "forged-turn";
    },
    (candidate) => {
      candidate.source_context.turn_started_at = new Date(
        Date.parse(candidate.responded_at) + 1_000,
      ).toISOString();
    },
    (candidate) => {
      candidate.responded_at = "2020-01-01T00:00:00.000Z";
    },
    (candidate) => {
      candidate.responded_at = "2099-01-01T00:00:00.000Z";
    },
  ]) {
    const provenanceDrift = structuredClone(response);
    mutate(provenanceDrift);
    await assert.rejects(
      () => validateHeldVideoScriptReviewResponse({
        requestText,
        responseText: `${JSON.stringify(provenanceDrift, null, 2)}\n`,
      }),
      /response is invalid/,
    );
  }
});

test("missing script approval remains pending and cannot authorize setup or release", async () => {
  await assert.rejects(
    () => readFile(HELD_VIDEO_SCRIPT_REVIEW_PATHS.response, "utf8"),
    (error) => error?.code === "ENOENT",
  );
  const result = await validateHeldVideoRecuts();
  assert.equal(result.scriptReviewStatus, "pending-human-script-and-scene-approval");
  assert.equal(result.studioSettingsVerificationAuthorized, false);
  assert.equal(result.releaseQaStatus, "pending-script-approval");
  assert.equal(result.heldVideoReleaseReady, false);
  assert.deepEqual(result.errors, []);
});

test("Studio setup preserves exact draft links while browser evidence cannot widen beyond visible labels", async () => {
  const [packages, requestText, ledgerText] = await Promise.all([
    loadRecutPackages(),
    readFile(HELD_VIDEO_SCRIPT_REVIEW_PATHS.request, "utf8"),
    readFile(new URL(`../../${HELD_VIDEO_STUDIO_SETUP_PATH}`, import.meta.url), "utf8"),
  ]);
  const ledger = JSON.parse(ledgerText);
  assert.deepEqual(validateHeldVideoStudioSetup({
    ledger,
    packages,
    requestText,
  }), []);
  assert.equal(ledger.browser_audit.scene_selections_checked, 128);
  assert.equal(ledger.browser_audit.expected_scene_selections, 128);
  assert.deepEqual(ledger.browser_audit.visible_labels, {
    avatar: "Doodle Andrea cafe (course)",
    voice: "Hope",
    motion_engine: "Avatar IV",
  });
  assert.deepEqual(ledger.browser_audit.window, {
    first_success_at: "2026-07-18T17:12:06.346Z",
    finished_at: "2026-07-18T17:21:20.804Z",
  });
  assert.equal(ledger.drafts.length, 7);
  assert.equal(
    ledger.drafts.reduce((sum, draft) => sum + draft.scene_count, 0),
    128,
  );

  const forged = structuredClone(ledger);
  forged.manual_setup.generate_clicked_by_codex = true;
  assert.match(
    validateHeldVideoStudioSetup({
      ledger: forged,
      packages,
      requestText,
    }).join("\n"),
    /safety state drifted/,
  );

  const wrongDraft = structuredClone(ledger);
  wrongDraft.drafts[2].scene_count = 36;
  assert.match(
    validateHeldVideoStudioSetup({
      ledger: wrongDraft,
      packages,
      requestText,
    }).join("\n"),
    /video-slot-10-objection-scripts is invalid/,
  );

  const draftIdentityDrift = structuredClone(ledger);
  draftIdentityDrift.drafts[0].draft_id = "f".repeat(32);
  draftIdentityDrift.drafts[0].url =
    `https://app.heygen.com/create-v4/${draftIdentityDrift.drafts[0].draft_id}?vt=l&panel=scene`;
  assert.match(
    validateHeldVideoStudioSetup({
      ledger: draftIdentityDrift,
      packages,
      requestText,
    }).join("\n"),
    /video-slot-01-welcome is invalid/,
  );

  for (const [claim, value] of [
    ["selected_look_id", HEYGEN_DRAFT_CONTRACT.avatarLookId],
    ["voice_id", HEYGEN_DRAFT_CONTRACT.voiceId],
    ["auto_enhance_every_scene", true],
    ["pause_counts", { "2s": 128 }],
    ["voice_speed", 1],
    ["all_settings_match", true],
    ["audited_at", "2026-07-18T17:22:54.000Z"],
  ]) {
    const widenedEvidence = structuredClone(ledger);
    widenedEvidence.browser_audit[claim] = value;
    assert.match(
      validateHeldVideoStudioSetup({
        ledger: widenedEvidence,
        packages,
        requestText,
      }).join("\n"),
      /browser evidence widened beyond visible labels/,
    );
  }

  const fabricatedPerSceneAudit = structuredClone(ledger);
  fabricatedPerSceneAudit.drafts[0].live_scene_settings_audit = {
    scene_numbers: [1, 2, 3],
    selected_look_id: HEYGEN_DRAFT_CONTRACT.avatarLookId,
  };
  assert.match(
    validateHeldVideoStudioSetup({
      ledger: fabricatedPerSceneAudit,
      packages,
      requestText,
    }).join("\n"),
    /video-slot-01-welcome is invalid/,
  );
});

test("clean Studio imports match canonical narration and checksum-bound pause sidecars", async () => {
  const [packages, inventory] = await Promise.all([
    loadRecutPackages(),
    studioImportInventoryPromise,
  ]);
  assert.equal(inventory.schema_version, "bmh-held-video-studio-import-inventory/v1");
  assert.equal(inventory.provider_call_allowed, false);
  assert.equal(inventory.records.length, packages.length);
  assert.equal(
    await readFile(
      new URL(
        "../../docs/course-production/held-video-recuts/generated/studio-import-inventory.json",
        import.meta.url,
      ),
      "utf8",
    ),
    renderStudioImportInventory(packages),
  );

  for (const pkg of packages) {
    const sourceKey = pkg.source.source_key;
    const paths = generatedRecutPaths(sourceKey);
    const [narration, sidecarText] = await Promise.all([
      readFile(paths.studioImport, "utf8"),
      readFile(paths.studioImportSidecar, "utf8"),
    ]);
    const providerScenes = providerSceneSequence(pkg);
    const lines = narration.slice(0, -1).split("\n");
    assert.equal(narration, renderStudioImportText(pkg));
    assert.ok(narration.endsWith("\n"));
    assert.equal(lines.length, providerScenes.length);
    assert.deepEqual(
      lines,
      providerScenes.map((scene) => scene.input_text),
    );
    for (const line of lines) {
      assert.ok(line.length > 0);
      assert.doesNotMatch(
        line,
        /^(?:SCENE(?:\s|\d|:)|\[?EDITOR\b|Seller:|Response:)/i,
      );
      assert.doesNotMatch(
        line,
        /\b(?:Do not narrate this instruction|seconds of silence at this scene boundary)\b/i,
      );
    }

    assert.equal(sidecarText, renderStudioImportSidecar(pkg));
    const sidecar = JSON.parse(sidecarText);
    assert.equal(sidecar.status, "manual_studio_preparation_only");
    assert.equal(sidecar.provider_call_allowed, false);
    assert.equal(sidecar.render_allowed, false);
    assert.equal(sidecar.generate_button_allowed_for_codex, false);
    assert.equal(sidecar.narration.sha256, sha256(Buffer.from(narration)));
    assert.equal(sidecar.narration.line_count, lines.length);
    assert.equal(sidecar.studio_preparation.manual_only, true);
    assert.equal(
      sidecar.studio_preparation.narration_line_character_limit,
      STUDIO_IMPORT_MAX_CHARS,
    );
    assert.equal(
      sidecar.studio_preparation.canonical_sequence_fits_single_api_request,
      lines.length <= HEYGEN_MAX_VIDEO_INPUTS,
    );
    assert.deepEqual(
      sidecar.scene_map.map((entry) => entry.input_index),
      providerScenes.map((scene) => scene.input_index),
    );
    for (const [index, entry] of sidecar.scene_map.entries()) {
      assert.equal(entry.line_number, index + 1);
      assert.equal(entry.input_text_sha256, sha256(Buffer.from(lines[index])));
      assert.equal(entry.pause_after_seconds, providerScenes[index].pause_after_seconds);
    }

    const record = inventory.records.find(
      (candidate) => candidate.source_key === sourceKey,
    );
    assert.ok(record);
    assert.equal(record.narration_sha256, sha256(Buffer.from(narration)));
    assert.equal(record.narration_line_count, lines.length);
    assert.equal(record.sidecar_sha256, sha256(Buffer.from(sidecarText)));

    if (sourceKey === "video-slot-10-objection-scripts") {
      assert.equal(lines.length, 68);
      assert.equal(
        sidecar.scene_map.filter(
          (entry) => entry.pause_kind === "learner_think_gap",
        ).length,
        32,
      );
      assert.equal(
        sidecar.studio_preparation.canonical_sequence_fits_single_api_request,
        false,
      );
      assert.match(
        sidecar.studio_preparation.instruction,
        /manually.*not a one-shot API request/i,
      );
      for (const gap of sidecar.scene_map.filter(
        (entry) => entry.pause_kind === "learner_think_gap",
      )) {
        const response = sidecar.scene_map[gap.input_index + 1];
        assert.equal(gap.pause_after_seconds, LEARNER_THINK_GAP_SECONDS);
        assert.equal(response.segment_kind, "andrea_response");
        assert.equal(response.segment_id, gap.response_segment_id);
        assert.equal(response.responds_to_segment_id, gap.segment_id);
      }
    }
  }
});

test("Studio import rendering rejects narratable structural and gap instructions", () => {
  for (const unsafe of [
    "SCENE 1: Welcome",
    "Editor gap: add three seconds here.",
    "[EDITOR GAP: 3 seconds]",
    "Seller: I want more money.",
    "Response: Ask what the number needs to cover.",
    "Do not narrate this instruction.",
    "Add three seconds of silence at this scene boundary.",
    "",
    "Narration with\na structural break",
    "x".repeat(STUDIO_IMPORT_MAX_CHARS + 1),
  ]) {
    assert.throws(
      () => assertCleanStudioNarrationLine(unsafe, "test-source", 0),
      /Studio import input 0/,
    );
  }
  assert.doesNotThrow(() =>
    assertCleanStudioNarrationLine(
      "x".repeat(STUDIO_IMPORT_MAX_CHARS),
      "test-source",
      0,
    )
  );
});

test("all seven deterministic Word team references match their locked source packages", async () => {
  const [inventory, packages] = await Promise.all([
    teamReferenceInventoryPromise,
    loadRecutPackages(),
  ]);
  assert.equal(inventory.schema_version, 1);
  assert.equal(inventory.provider_call_allowed, false);
  assert.equal(inventory.documents.length, 7);
  assert.deepEqual(
    inventory.documents.map((document) => document.source_key).sort(),
    packages.map((pkg) => pkg.source.source_key).sort(),
  );

  for (const document of inventory.documents) {
    const pkg = packages.find(
      (candidate) => candidate.source.source_key === document.source_key,
    );
    assert.ok(pkg, `${document.source_key} must resolve to a recut package`);
    assert.match(document.path, new RegExp(`${document.source_key}-script\\.docx$`));

    const [docx, packageBytes, scriptBytes, fileStats] = await Promise.all([
      readFile(new URL(`../../${document.path}`, import.meta.url)),
      readFile(new URL(`../../${document.package_path}`, import.meta.url)),
      readFile(new URL(`../../${document.script_path}`, import.meta.url)),
      stat(new URL(`../../${document.path}`, import.meta.url)),
    ]);
    assert.equal(sha256(docx), document.sha256);
    assert.equal(fileStats.size, document.size_bytes);
    assert.equal(sha256(packageBytes), document.package_sha256);
    assert.equal(sha256(scriptBytes), document.script_sha256);

    const documentXml = readZipEntry(docx, "word/document.xml").toString("utf8");
    assert.match(documentXml, new RegExp(document.source_key));
    assert.match(documentXml, new RegExp(pkg.source.held_sha256));
    assert.match(documentXml, /does not authorize a HeyGen provider call or render/);
    for (const scene of pkg.scenes) {
      for (const segment of sceneDeliverySegments(scene)) {
        assert.ok(
          documentXml.includes(segment.input_text.replaceAll("&", "&amp;")),
          `${document.source_key} Word copy must include ${scene.title} ${segment.segment_kind}`,
        );
      }
    }
  }
});

test("offline package preparation has no executable provider-call path", async () => {
  const implementation = await Promise.all(
    [
      "../../scripts/course-content/build-held-video-recut-docs.mjs",
      "../../scripts/course-content/validate-held-video-recuts.mjs",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  ).then((parts) => parts.join("\n"));

  assert.doesNotMatch(implementation, /\bfetch\s*\(/);
  assert.doesNotMatch(implementation, /from\s+["']node:https?["']/);
  assert.doesNotMatch(implementation, /from\s+["']node:child_process["']/);
  assert.doesNotMatch(implementation, /\bHEYGEN_API_KEY\b|\bX-Api-Key\b/);
});

test("the offline payload builder refuses every pre-approval production permission", async () => {
  const [pkg] = await loadRecutPackages();
  for (const field of [
    "provider_call_allowed",
    "render_allowed",
    "caption_generation_allowed",
    "approval_status_change_allowed",
  ]) {
    const unsafe = structuredClone(pkg);
    unsafe.production_constraints[field] = true;
    assert.throws(
      () => renderHeygenDraftPackage(unsafe),
      new RegExp(`${field} must remain false`),
    );
  }
});
