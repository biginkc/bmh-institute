#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { validateHeldVideoApprovalTransition } from "./held-video-approval-ledger.mjs";
import { validateLocalPolicyCandidates } from "./held-video-local-policy-candidates.mjs";

const [currentPath, nextPath, manifestPath, localCandidatesPath] = process.argv.slice(2);
if (!currentPath || !nextPath || !manifestPath) {
  throw new Error("Usage: node scripts/course-content/validate-held-video-approval-transition.mjs <current-ledger.json> <next-ledger.json> <manifest.json> [local-policy-candidates.json]");
}

const resolvedNextPath = resolve(nextPath);
const [currentLedger, nextLedger, manifest, localCandidates] = await Promise.all([
  readFile(resolve(currentPath), "utf8").then(JSON.parse),
  readFile(resolvedNextPath, "utf8").then(JSON.parse),
  readFile(resolve(manifestPath), "utf8").then(JSON.parse),
  readFile(
    localCandidatesPath
      ? resolve(localCandidatesPath)
      : resolve(dirname(resolvedNextPath), "local-policy-candidates.json"),
    "utf8",
  ).then(JSON.parse),
]);
const reviewAssets = [
  ...manifest.assets.filter((asset) => asset.kind === "video" && asset.approval_status === "hold"),
  ...(localCandidates.candidates ?? []).map((candidate) => ({
    source_key: candidate.source_key,
    checksum_sha256: candidate.sha256,
    local_path: candidate.local_path,
    approval_status: "hold",
  })),
];
const errors = [
  ...validateLocalPolicyCandidates(localCandidates, manifest, nextLedger).map(
    (error) => `local candidates: ${error}`,
  ),
  ...validateHeldVideoApprovalTransition(currentLedger, nextLedger, reviewAssets),
];
console.log(JSON.stringify({ errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
