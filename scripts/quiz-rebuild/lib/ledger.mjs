import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const EXPECTED_SELECTED_BY_SLOT = [55, 50, 50, 81, 78, 44, 40, 35, 78, 50, 60, 38, 60, 40, 35, 38, 55, 38, 52];

const EXPECTED_COUNTS = {
  raw: 1224,
  selected: 977,
  superseded: 198,
  excluded: 49,
};

export function loadSnapshot(repoRoot) {
  const snapshotPath = path.join(repoRoot, "content/quiz-generation/source-ledger.v1.json");
  const ledger = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (ledger.schema_version !== "bmh.quiz-source-ledger.v1") {
    throw new Error(`source ledger schema_version mismatch: expected bmh.quiz-source-ledger.v1, got ${JSON.stringify(ledger.schema_version)}`);
  }
  return ledger;
}

export function validateSnapshot(ledger) {
  if (!Array.isArray(ledger.records)) {
    throw new Error("source ledger records must be an array");
  }

  const actualCounts = {
    raw: ledger.records.length,
    selected: ledger.records.filter((record) => record.disposition === "selected").length,
    superseded: ledger.records.filter((record) => record.disposition === "superseded_by_newer_slot_bank").length,
    excluded: ledger.records.filter((record) => record.disposition === "excluded_deleted_track").length,
  };
  for (const key of Object.keys(EXPECTED_COUNTS)) {
    if (actualCounts[key] !== EXPECTED_COUNTS[key]) {
      throw new Error(`source ledger ${key} count mismatch: expected ${EXPECTED_COUNTS[key]}, got ${actualCounts[key]}`);
    }
  }

  const bySlot = selectedBySlot(ledger);
  const actualVector = [];
  for (let slot = 1; slot <= 19; slot++) {
    actualVector.push(bySlot.get(slot).length);
  }
  if (JSON.stringify(actualVector) !== JSON.stringify(EXPECTED_SELECTED_BY_SLOT)) {
    throw new Error(`source ledger selected per-slot mismatch: expected [${EXPECTED_SELECTED_BY_SLOT.join(",")}], got [${actualVector.join(",")}]`);
  }
  return ledger;
}

export function selectedBySlot(ledger) {
  const result = new Map();
  for (let slot = 1; slot <= 19; slot++) result.set(slot, []);
  for (const record of ledger.records) {
    if (record.disposition === "selected" && result.has(record.candidate_slot)) {
      result.get(record.candidate_slot).push(record);
    }
  }
  return result;
}

export function sha256OfFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function sha256OfText(text) {
  return createHash("sha256").update(text).digest("hex");
}
