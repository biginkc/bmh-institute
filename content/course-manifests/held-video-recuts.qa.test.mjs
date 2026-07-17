import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";

import {
  HEYGEN_DRAFT_CONTRACT,
  generatedRecutPaths,
  loadRecutPackages,
  renderHeygenDraftPackage,
} from "../../scripts/course-content/build-held-video-recut-docs.mjs";
import {
  validateRecutPackage,
  validateHeldVideoRecuts,
  validateSpokenPolicy,
} from "../../scripts/course-content/validate-held-video-recuts.mjs";
import {
  validateHeldVideoApprovalLedger,
  validateHeldVideoManifestApprovalState,
  validateHeldVideoApprovalTransition,
} from "../../scripts/course-content/held-video-approval-ledger.mjs";
import { validateLocalPolicyCandidates } from "../../scripts/course-content/held-video-local-policy-candidates.mjs";
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
    pendingApprovalRecords: 1,
    recutPackages: 7,
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

test("Terms v10 is exactly approved, KPIs v12 is pending, and all nine originals remain changes requested", async () => {
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
    1,
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
    ...ledger.records.find((record) => record.decision === "pending"),
    source_key: "video-slot-evil",
    sha256: "e".repeat(64),
    candidate_local_path: "course-assets/review-evil/evil.mp4",
  });
  const errors = validateLocalPolicyCandidates(inventory, manifest, ledger);
  assert.ok(errors.some((error) => error.includes("unexpected local policy candidate")));
});

test("approval transitions require evidence and keep decided checksums immutable", async () => {
  const [ledger, held] = await Promise.all([ledgerPromise, currentReviewAssets()]);
  const approved = structuredClone(ledger);
  const pendingIndex = approved.records.findIndex((record) => record.decision === "pending");
  Object.assign(approved.records[pendingIndex], {
    approver: "Jarrad Henry",
    date: "2026-07-17",
    decision: "approved",
    notes: "Watched the exact checksum-locked cut.",
  });
  assert.deepEqual(
    validateHeldVideoApprovalTransition(ledger, approved, held),
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
    validateHeldVideoApprovalTransition(ledger, wrongApprover, held).some(
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
    validateHeldVideoApprovalTransition(ledger, missingEvidence, held).some(
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
  const old = ledger.records.find((record) => record.decision === "pending");
  const replacementSha256 = "b".repeat(64);
  const replacementPath = "course-assets/review-lessonA/LESSON-1A-v8.mp4";
  const nextAssets = reviewAssets.map((asset) =>
    asset.source_key === old.source_key && asset.checksum_sha256 === old.sha256
    ? { ...asset, checksum_sha256: replacementSha256, local_path: replacementPath }
    : asset,
  );
  const next = structuredClone(ledger);
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

  assert.deepEqual(validateHeldVideoApprovalTransition(ledger, next, nextAssets), []);
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
      provider_call_executor_after_approval: "Codex parent agent only",
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
    assert.equal(artifact.request_body.video_inputs.length, pkg.scenes.length);
    assert.deepEqual(
      artifact.request_body.video_inputs.map((input) => input.voice.input_text),
      pkg.scenes.map((scene) => scene.spoken_text),
    );
    for (const input of artifact.request_body.video_inputs) {
      assert.equal(
        input.character.talking_photo_id,
        HEYGEN_DRAFT_CONTRACT.avatarId,
      );
      assert.equal(input.voice.voice_id, HEYGEN_DRAFT_CONTRACT.voiceId);
      assert.ok(input.voice.input_text.length <= 1_800);
      assert.deepEqual(input.background, { type: "color", value: "#ffffff" });
    }
    assert.doesNotMatch(expected, /api[_-]?key|authorization|secret|token/i);
  }
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
      assert.ok(
        documentXml.includes(scene.spoken_text.replaceAll("&", "&amp;")),
        `${document.source_key} Word copy must include ${scene.title}`,
      );
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
