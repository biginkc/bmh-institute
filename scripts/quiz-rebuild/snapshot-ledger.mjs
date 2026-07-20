#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSnapshot, sha256OfFile, validateSnapshot } from "./lib/ledger.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultSource = "/Users/jarradhenry/BMH-OS/_inbox/2026-07-20-bmh-quiz-source-ledger.json";
const args = process.argv.slice(2);
let source = defaultSource;
let force = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--source") {
    if (!args[index + 1]) throw new Error("--source requires a path");
    source = path.resolve(args[index + 1]);
    index += 1;
  } else if (args[index] === "--force") {
    force = true;
  } else {
    throw new Error(`unknown argument: ${args[index]}`);
  }
}

const outputDirectory = path.join(repoRoot, "content/quiz-generation");
const snapshotPath = path.join(outputDirectory, "source-ledger.v1.json");
const sidecarPath = path.join(outputDirectory, "source-ledger.v1.sha256");
if ((existsSync(snapshotPath) || existsSync(sidecarPath)) && !force) {
  throw new Error("source ledger snapshot already exists; pass --force to overwrite it");
}

mkdirSync(outputDirectory, { recursive: true });
const sourceBytes = readFileSync(source);
const sourceLedger = JSON.parse(sourceBytes.toString("utf8"));
if (sourceLedger.schema_version !== "bmh.quiz-source-ledger.v1") {
  throw new Error(`source ledger schema_version mismatch: expected bmh.quiz-source-ledger.v1, got ${JSON.stringify(sourceLedger.schema_version)}`);
}
validateSnapshot(sourceLedger);
writeFileSync(snapshotPath, sourceBytes);
const sha = sha256OfFile(snapshotPath);
writeFileSync(sidecarPath, `${sha}\n`);
console.log(sha);
validateSnapshot(loadSnapshot(repoRoot));
console.log("source ledger snapshot validation passed");
