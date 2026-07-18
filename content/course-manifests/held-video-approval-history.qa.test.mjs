import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

test("held-video approval history follows the feature parent of a GitHub-style synthetic merge", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "bmh-held-video-merge-"));
  const ledgerPath = path.join(repoRoot, "approvals.json");
  const canonicalLedger = JSON.parse(await readFile(new URL(
    "../../docs/course-production/held-video-review/approvals.json",
    import.meta.url,
  ), "utf8"));
  const currentReviewAssets = canonicalLedger.records.map((record) => ({
    source_key: record.source_key,
    checksum_sha256: record.sha256,
    local_path: record.candidate_local_path,
    approval_status: record.decision === "approved" ? "approved" : "hold",
  }));
  const git = (...args) => execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "BMH Course QA");
    git("config", "user.email", "course-qa@example.invalid");
    await writeFile(path.join(repoRoot, "base.txt"), "base branch predates the approval ledger\n");
    git("add", "base.txt");
    git("commit", "-m", "base without approval ledger");

    git("switch", "-c", "feature");
    await writeFile(ledgerPath, `${JSON.stringify(canonicalLedger, null, 2)}\n`);
    git("add", "approvals.json");
    git("commit", "-m", "add approval ledger on feature branch");
    const rewritten = structuredClone(canonicalLedger);
    rewritten.records.find((record) => record.decision === "approved").notes += " rewritten";
    await writeFile(ledgerPath, `${JSON.stringify(rewritten, null, 2)}\n`);
    git("add", "approvals.json");
    git("commit", "-m", "rewrite terminal approval at feature tip");
    await writeFile(path.join(repoRoot, "feature.txt"), "unrelated commit after the rewrite\n");
    git("add", "feature.txt");
    git("commit", "-m", "unrelated feature work after rewrite");

    git("switch", "-c", "synthetic-merge", "main");
    git("merge", "--no-ff", "feature", "-m", "GitHub-style pull request merge");
    assert.equal(git("rev-list", "--parents", "-n", "1", "HEAD").trim().split(/\s+/).length, 3);
    assert.throws(
      () => git("cat-file", "-e", "HEAD^:approvals.json"),
      /Command failed/,
      "base parent must not contain the feature ledger",
    );
    assert.equal(
      git("show", "HEAD^2^:approvals.json"),
      `${JSON.stringify(rewritten, null, 2)}\n`,
      "the immediate feature predecessor is already compromised in this attack",
    );

    const mergeLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const errors = await validateHeldVideoApprovalHistory({
      ledger: mergeLedger,
      currentReviewAssets,
      repoRoot,
      ledgerPath,
    });
    assert.ok(
      errors.some((error) => error.includes("decision is terminal")),
      `synthetic merge must still reject rewritten approval history: ${errors.join("; ")}`,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("held-video approval history rejects a rewrite committed by an ordinary feature merge", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "bmh-held-video-feature-merge-"));
  const ledgerPath = path.join(repoRoot, "approvals.json");
  const canonicalLedger = JSON.parse(await readFile(new URL(
    "../../docs/course-production/held-video-review/approvals.json",
    import.meta.url,
  ), "utf8"));
  const currentReviewAssets = canonicalLedger.records.map((record) => ({
    source_key: record.source_key,
    checksum_sha256: record.sha256,
    local_path: record.candidate_local_path,
    approval_status: record.decision === "approved" ? "approved" : "hold",
  }));
  const git = (...args) => execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "BMH Course QA");
    git("config", "user.email", "course-qa@example.invalid");
    await writeFile(path.join(repoRoot, "base.txt"), "base branch predates the approval ledger\n");
    git("add", "base.txt");
    git("commit", "-m", "base without approval ledger");

    git("switch", "-c", "feature");
    await writeFile(ledgerPath, `${JSON.stringify(canonicalLedger, null, 2)}\n`);
    git("add", "approvals.json");
    git("commit", "-m", "add immutable approval ledger");
    const rewritten = structuredClone(canonicalLedger);
    rewritten.records.find((record) => record.decision === "approved").notes += " rewritten";
    await writeFile(ledgerPath, `${JSON.stringify(rewritten, null, 2)}\n`);
    git("add", "approvals.json");
    git("commit", "-m", "rewrite held-video approval history");
    await writeFile(path.join(repoRoot, "feature.txt"), "unrelated commit after the rewrite\n");
    git("add", "feature.txt");
    git("commit", "-m", "unrelated feature work after rewrite");

    git("switch", "main");
    await writeFile(path.join(repoRoot, "main.txt"), "main advanced\n");
    git("add", "main.txt");
    git("commit", "-m", "advance main");

    git("switch", "feature");
    git("merge", "--no-ff", "main", "-m", "merge main after held-video rewrite");
    assert.equal(git("rev-list", "--parents", "-n", "1", "HEAD").trim().split(/\s+/).length, 3);
    assert.equal(
      git("show", "HEAD^1:approvals.json"),
      `${JSON.stringify(rewritten, null, 2)}\n`,
      "the ordinary merge first parent is already compromised in this attack",
    );

    const mergeLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const errors = await validateHeldVideoApprovalHistory({
      ledger: mergeLedger,
      currentReviewAssets,
      repoRoot,
      ledgerPath,
    });
    assert.ok(
      errors.some((error) => error.includes("decision is terminal")),
      `ordinary merge must reject held-video approval rewrites: ${errors.join("; ")}`,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("held-video approval history fails closed when a shallow checkout hides its predecessor", async () => {
  const canonicalLedger = JSON.parse(await readFile(new URL(
    "../../docs/course-production/held-video-review/approvals.json",
    import.meta.url,
  ), "utf8"));
  const currentReviewAssets = canonicalLedger.records.map((record) => ({
    source_key: record.source_key,
    checksum_sha256: record.sha256,
    local_path: record.candidate_local_path,
    approval_status: record.decision === "approved" ? "approved" : "hold",
  }));
  const parent = await mkdtemp(path.join(tmpdir(), "bmh-held-video-shallow-"));
  const source = path.join(parent, "source");
  const checkout = path.join(parent, "checkout");
  const git = (cwd, ...args) => execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  try {
    await mkdir(source);
    git(source, "init", "--initial-branch=main");
    git(source, "config", "user.name", "BMH Course QA");
    git(source, "config", "user.email", "course-qa@example.invalid");
    await writeFile(path.join(source, "approvals.json"), `${JSON.stringify(canonicalLedger, null, 2)}\n`);
    git(source, "add", "approvals.json");
    git(source, "commit", "-m", "add immutable approval ledger");
    const rewritten = structuredClone(canonicalLedger);
    rewritten.records.find((record) => record.decision === "approved").notes += " rewritten";
    await writeFile(path.join(source, "approvals.json"), `${JSON.stringify(rewritten, null, 2)}\n`);
    git(source, "add", "approvals.json");
    git(source, "commit", "-m", "rewrite held-video approval");

    git(parent, "clone", "--depth", "1", `file://${source}`, checkout);
    assert.equal(git(checkout, "rev-parse", "--is-shallow-repository").trim(), "true");
    const ledgerPath = path.join(checkout, "approvals.json");
    const shallowLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
    const errors = await validateHeldVideoApprovalHistory({
      ledger: shallowLedger,
      currentReviewAssets,
      repoRoot: checkout,
      ledgerPath,
    });
    assert.ok(errors.some((error) => error.includes("immutable predecessor baseline")));
  } finally {
    await rm(parent, { recursive: true, force: true });
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
