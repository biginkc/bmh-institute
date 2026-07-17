import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  HEYGEN_DRAFT_CONTRACT,
  generatedRecutPaths,
  loadRecutPackages,
  renderHeygenDraftPackage,
} from "../../scripts/course-content/build-held-video-recut-docs.mjs";
import {
  validateHeldVideoRecuts,
  validateSpokenPolicy,
} from "../../scripts/course-content/validate-held-video-recuts.mjs";
import {
  validateHeldVideoApprovalLedger,
  validateHeldVideoManifestApprovalState,
  validateHeldVideoApprovalTransition,
} from "../../scripts/course-content/held-video-approval-ledger.mjs";
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

test("all three policy recuts preserve source, objective, transition, and production gates", async () => {
  const result = await validateHeldVideoRecuts();
  assert.deepEqual(result, {
    approvalRecords: 9,
    pendingApprovalRecords: 6,
    recutPackages: 3,
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

test("six review candidates are pending and three proven-defective source cuts require replacement", async () => {
  const [manifest, ledger] = await Promise.all([
    manifestPromise,
    ledgerPromise,
  ]);
  const held = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
  assert.deepEqual(validateHeldVideoApprovalLedger(ledger, held), []);
  assert.equal(ledger.records.length, 9);
  assert.equal(
    ledger.records.filter(
      (record) =>
        record.decision === "pending" &&
        record.approver === null &&
        record.date === null &&
        record.notes === null,
    ).length,
    6,
  );
  assert.equal(
    ledger.records.filter(
      (record) =>
        record.decision === "changes_requested" &&
        record.approver === "BMH Institute content QA" &&
        record.date === "2026-07-16" &&
        record.notes.includes("Replacement required"),
    ).length,
    3,
  );
});

test("approval transitions require evidence and keep decided checksums immutable", async () => {
  const [manifest, ledger] = await Promise.all([
    manifestPromise,
    ledgerPromise,
  ]);
  const held = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
  const approved = structuredClone(ledger);
  Object.assign(approved.records[0], {
    approver: "Jarrad Henry",
    date: "2026-07-16",
    decision: "approved",
    notes: "Watched the exact checksum-locked cut.",
  });
  assert.deepEqual(
    validateHeldVideoApprovalTransition(ledger, approved, held),
    [],
  );

  const wrongApprover = structuredClone(approved);
  wrongApprover.records[0].approver = "Not Jarrad";
  assert.ok(
    validateHeldVideoApprovalTransition(ledger, wrongApprover, held).some(
      (error) => error.includes("require approver Jarrad Henry"),
    ),
  );

  const approvedAssetWrongApprover = structuredClone(approved);
  approvedAssetWrongApprover.records[0].approver = "Not Jarrad";
  const remainingHeld = held.filter(
    (asset) =>
      asset.source_key !== approvedAssetWrongApprover.records[0].source_key ||
      asset.checksum_sha256 !== approvedAssetWrongApprover.records[0].sha256,
  );
  assert.ok(
    validateHeldVideoApprovalLedger(
      approvedAssetWrongApprover,
      remainingHeld,
    ).some((error) => error.includes("require approver Jarrad Henry")),
  );

  const missingEvidence = structuredClone(approved);
  missingEvidence.records[0].approver = null;
  assert.ok(
    validateHeldVideoApprovalTransition(ledger, missingEvidence, held).some(
      (error) => error.includes("requires an approver"),
    ),
  );

  const rewrittenDecision = structuredClone(approved);
  Object.assign(rewrittenDecision.records[0], {
    decision: "rejected",
    notes: "Rewritten history",
  });
  assert.ok(
    validateHeldVideoApprovalTransition(approved, rewrittenDecision, held).some(
      (error) => error.includes("decision is terminal"),
    ),
  );

  const policyDefectiveApproval = structuredClone(ledger);
  Object.assign(policyDefectiveApproval.records[6], {
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
  rewrittenPolicyOwner.records[6].approver = "Jarrad Henry";
  assert.ok(
    validateHeldVideoApprovalLedger(rewrittenPolicyOwner, held).some((error) =>
      error.includes("must retain the BMH Institute content QA decision"),
    ),
  );
});

test("a corrected replacement can enter review as a new checksum-keyed pending candidate", async () => {
  const [manifest, ledger] = await Promise.all([
    manifestPromise,
    ledgerPromise,
  ]);
  const held = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
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
  const [manifest, ledger] = await Promise.all([manifestPromise, ledgerPromise]);
  const reviewAssets = manifest.assets.filter((asset) =>
    asset.kind === "video" && ledger.records.some((record) => record.source_key === asset.source_key),
  );
  const old = ledger.records[0];
  const replacementSha256 = "b".repeat(64);
  const replacementPath = "course-assets/review-lessonA/LESSON-1A-v8.mp4";
  const nextAssets = reviewAssets.map((asset) => asset.source_key === old.source_key
    ? { ...asset, checksum_sha256: replacementSha256, local_path: replacementPath }
    : asset);
  const next = structuredClone(ledger);
  next.updated_at = "2026-07-17";
  Object.assign(next.records[0], {
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
  const reviewedKeys = new Set(finalLedger.records.map((record) => record.source_key));
  const finalReviewAssets = manifest.assets
    .filter((asset) => asset.kind === "video" && reviewedKeys.has(asset.source_key))
    .map((asset, index) => {
      if (index < 6) {
        Object.assign(finalLedger.records[index], {
          decision: "approved",
          approver: "Jarrad Henry",
          date: "2026-07-17",
          notes: "Watched and approved this exact checksum-locked cut.",
        });
        return { ...asset, approval_status: "approved" };
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
});

test("generated scripts contain the exact locked final transition", async () => {
  for (const pkg of await loadRecutPackages()) {
    assert.equal(
      pkg.scenes.at(-1).spoken_text,
      pkg.lesson_contract.transition_spoken_text,
    );
  }
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
