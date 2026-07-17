import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateHeldVideoApprovalHistory } from "../../scripts/course-content/held-video-approval-ledger.mjs";

test("held-video approval history fails closed without committed predecessor evidence", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "bmh-held-video-history-"));
  const ledgerPath = path.join(repoRoot, "approvals.json");
  const ledger = {
    schema_version: "1.0.0",
    updated_at: "2026-07-17",
    key_fields: ["source_key", "sha256"],
    records: [],
  };
  await writeFile(ledgerPath, JSON.stringify(ledger));
  try {
    const errors = await validateHeldVideoApprovalHistory({
      ledger,
      currentReviewAssets: [],
      repoRoot,
      ledgerPath,
    });
    assert.ok(errors.some((error) => error.includes("committed HEAD ledger")));
    assert.ok(errors.some((error) => error.includes("immutable predecessor baseline")));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("held-video approval history fails closed when the ledger escapes the repository", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "bmh-held-video-repo-"));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "bmh-held-video-outside-"));
  const ledgerPath = path.join(outsideRoot, "approvals.json");
  const ledger = {
    schema_version: "1.0.0",
    updated_at: "2026-07-17",
    key_fields: ["source_key", "sha256"],
    records: [],
  };
  await writeFile(ledgerPath, JSON.stringify(ledger));
  try {
    const errors = await validateHeldVideoApprovalHistory({
      ledger,
      currentReviewAssets: [],
      repoRoot,
      ledgerPath,
    });
    assert.deepEqual(errors, [
      "Held-video approval ledger must be inside the canonical repository root.",
    ]);
  } finally {
    await Promise.all([
      rm(repoRoot, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  }
});

test("the checked-in approval ledger has immutable HEAD and predecessor evidence", async () => {
  const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
  const ledgerPath = path.join(
    repoRoot,
    "docs/course-production/held-video-review/approvals.json",
  );
  const [ledger, manifest, inventory] = await Promise.all([
    readFile(ledgerPath, "utf8").then(JSON.parse),
    readFile(path.join(repoRoot, "content/course-manifests/bmh-employee-training.v1.json"), "utf8").then(JSON.parse),
    readFile(path.join(repoRoot, "docs/course-production/held-video-review/local-policy-candidates.json"), "utf8").then(JSON.parse),
  ]);
  const sourceKeys = new Set(ledger.records.map((record) => record.source_key));
  const currentReviewAssets = [
    ...manifest.assets.filter((asset) => asset.kind === "video" && sourceKeys.has(asset.source_key)),
    ...inventory.candidates.map((candidate) => ({
      source_key: candidate.source_key,
      checksum_sha256: candidate.sha256,
      local_path: candidate.local_path,
      approval_status: candidate.approval_status === "approved_exact_cut" ? "approved" : "hold",
    })),
  ];
  assert.deepEqual(await validateHeldVideoApprovalHistory({
    ledger,
    currentReviewAssets,
    repoRoot,
    ledgerPath,
  }), []);
});
