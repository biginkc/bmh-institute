#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintAll } from "./lib/lint.mjs";
import { loadSnapshot, validateSnapshot } from "./lib/ledger.mjs";
import { stableStringify } from "./lib/stable-json.mjs";

export function loadSlotFiles(repoRoot, directoryName) {
  const files = new Map();
  for (let slot = 1; slot <= 19; slot++) {
    const relativePath = `${directoryName}/slot-${String(slot).padStart(2, "0")}.json`;
    const filePath = path.join(repoRoot, "content/quiz-generation", relativePath);
    if (existsSync(filePath)) {
      files.set(slot, { data: JSON.parse(readFileSync(filePath, "utf8")), path: filePath, relativePath });
    }
  }
  return files;
}

export function runLint(repoRoot, { strictReviews = false } = {}) {
  const ledger = validateSnapshot(loadSnapshot(repoRoot));
  const banks = loadSlotFiles(repoRoot, "distractor-banks");
  const reviews = loadSlotFiles(repoRoot, "distractor-reviews");
  return { ledger, banks, reviews, findings: lintAll({ ledger, banks, reviews, strictReviews }) };
}

function printHuman(findings) {
  for (const severity of ["error", "warning"]) {
    const matching = findings.filter((item) => item.severity === severity);
    console.log(`${severity.toUpperCase()} (${matching.length})`);
    let priorSlot = null;
    for (const item of matching) {
      if (item.slot !== priorSlot) {
        console.log(`  slot ${String(item.slot).padStart(2, "0")}`);
        priorSlot = item.slot;
      }
      const record = item.record_id === null ? "" : ` ${item.record_id}`;
      console.log(`    ${item.code}${record}: ${item.detail}`);
    }
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    if (!["--json", "--strict-reviews"].includes(arg)) throw new Error(`unknown argument: ${arg}`);
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const { findings } = runLint(repoRoot, { strictReviews: args.has("--strict-reviews") });
  if (args.has("--json")) process.stdout.write(stableStringify(findings));
  else printHuman(findings);
  if (findings.some((item) => item.severity === "error")) process.exitCode = 1;
}
