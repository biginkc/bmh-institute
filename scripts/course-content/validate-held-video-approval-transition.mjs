#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateHeldVideoApprovalTransition } from "./held-video-approval-ledger.mjs";

const [currentPath, nextPath, manifestPath] = process.argv.slice(2);
if (!currentPath || !nextPath || !manifestPath) {
  throw new Error("Usage: node scripts/course-content/validate-held-video-approval-transition.mjs <current-ledger.json> <next-ledger.json> <manifest.json>");
}

const [currentLedger, nextLedger, manifest] = await Promise.all(
  [currentPath, nextPath, manifestPath].map((path) => readFile(resolve(path), "utf8").then(JSON.parse)),
);
const heldAssets = manifest.assets.filter((asset) => asset.kind === "video" && asset.approval_status === "hold");
const errors = validateHeldVideoApprovalTransition(currentLedger, nextLedger, heldAssets);
console.log(JSON.stringify({ errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
