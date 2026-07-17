import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { loadRecutPackages } from "../../scripts/course-content/build-held-video-recut-docs.mjs";
import {
  validateHeldVideoRecuts,
  validateSpokenPolicy,
} from "../../scripts/course-content/validate-held-video-recuts.mjs";
import {
  validateHeldVideoApprovalLedger,
  validateHeldVideoApprovalTransition,
} from "../../scripts/course-content/held-video-approval-ledger.mjs";

const manifestPromise = readFile(
  new URL("./bmh-employee-training.v1.json", import.meta.url),
  "utf8",
).then(JSON.parse);
const policyPromise = readFile(
  new URL("../../docs/course-production/held-video-recuts/recut-policy.json", import.meta.url),
  "utf8",
).then(JSON.parse);
const ledgerPromise = readFile(
  new URL("../../docs/course-production/held-video-review/approvals.json", import.meta.url),
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
    ["There is a management path with higher earnings.", "compensation_promise"],
    ["The Acquisition Manager takes over.", "role_title"],
    ["Take a 15 minute break.", "fixed_daily_schedule"],
  ];
  for (const [spokenText, expectedRule] of cases) {
    assert.ok(
      validateSpokenPolicy("video-slot-17-compensation", spokenText, policy)
        .some((error) => error.includes(expectedRule)),
      `${expectedRule} must fail closed`,
    );
  }
});

test("six review candidates are pending and three proven-defective source cuts require replacement", async () => {
  const [manifest, ledger] = await Promise.all([manifestPromise, ledgerPromise]);
  const held = manifest.assets.filter((asset) => asset.kind === "video" && asset.approval_status === "hold");
  assert.deepEqual(validateHeldVideoApprovalLedger(ledger, held), []);
  assert.equal(ledger.records.length, 9);
  assert.equal(ledger.records.filter((record) =>
    record.decision === "pending"
    && record.approver === null
    && record.date === null
    && record.notes === null).length, 6);
  assert.equal(ledger.records.filter((record) =>
    record.decision === "changes_requested"
    && record.approver === "BMH Institute content QA"
    && record.date === "2026-07-16"
    && record.notes.includes("Replacement required")).length, 3);
});

test("approval transitions require evidence and keep decided checksums immutable", async () => {
  const [manifest, ledger] = await Promise.all([manifestPromise, ledgerPromise]);
  const held = manifest.assets.filter((asset) => asset.kind === "video" && asset.approval_status === "hold");
  const approved = structuredClone(ledger);
  Object.assign(approved.records[0], {
    approver: "Jarrad Henry",
    date: "2026-07-16",
    decision: "approved",
    notes: "Watched the exact checksum-locked cut.",
  });
  assert.deepEqual(validateHeldVideoApprovalTransition(ledger, approved, held), []);

  const wrongApprover = structuredClone(approved);
  wrongApprover.records[0].approver = "Not Jarrad";
  assert.ok(validateHeldVideoApprovalTransition(ledger, wrongApprover, held)
    .some((error) => error.includes("require approver Jarrad Henry")));

  const missingEvidence = structuredClone(approved);
  missingEvidence.records[0].approver = null;
  assert.ok(validateHeldVideoApprovalTransition(ledger, missingEvidence, held)
    .some((error) => error.includes("requires an approver")));

  const rewrittenDecision = structuredClone(approved);
  Object.assign(rewrittenDecision.records[0], {
    decision: "rejected",
    notes: "Rewritten history",
  });
  assert.ok(validateHeldVideoApprovalTransition(approved, rewrittenDecision, held)
    .some((error) => error.includes("decision is terminal")));

  const policyDefectiveApproval = structuredClone(ledger);
  Object.assign(policyDefectiveApproval.records[6], {
    approver: "Jarrad Henry",
    date: "2026-07-16",
    decision: "approved",
    notes: "Approve the old source cut.",
  });
  assert.ok(validateHeldVideoApprovalTransition(ledger, policyDefectiveApproval, held)
    .some((error) => error.includes("policy-defective source cut")));

  const rewrittenPolicyOwner = structuredClone(ledger);
  rewrittenPolicyOwner.records[6].approver = "Jarrad Henry";
  assert.ok(validateHeldVideoApprovalLedger(rewrittenPolicyOwner, held)
    .some((error) => error.includes("must retain the BMH Institute content QA decision")));
});

test("generated scripts contain the exact locked final transition", async () => {
  for (const pkg of await loadRecutPackages()) {
    assert.equal(pkg.scenes.at(-1).spoken_text, pkg.lesson_contract.transition_spoken_text);
  }
});
