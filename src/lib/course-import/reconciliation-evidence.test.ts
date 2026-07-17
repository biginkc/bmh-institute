import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildReconciliationEvidence } from "../../../scripts/course-content/build-import-reconciliation-evidence";

const cleanDatabase = { checked: 103, missing: [], mismatches: [], unexpected: [], catalogSha256: "a".repeat(64), inventorySha256: "b".repeat(64) };

describe("exact reconciliation evidence", () => {
  it("is checksum-bound and deterministic for the same recorded inputs", () => {
    const input = { manifestBytes: Buffer.from("manifest"), importId: "bmh-test-v1", scope: "full" as const, environment: "test" as const, database: cleanDatabase, assetProblems: [], unexpectedStorage: [], expectedStoragePaths: ["courses/bmh-test/v1/a"], storagePrefix: "courses/bmh-test/v1/" };
    expect(buildReconciliationEvidence(input)).toEqual(buildReconciliationEvidence(input));
  });

  it("refuses extra rows, extra objects, missing rows, field drift, and asset drift", () => {
    for (const mutation of [
      { database: { ...cleanDatabase, unexpected: [{ table: "lessons" as const, id: "extra" }] } },
      { database: { ...cleanDatabase, missing: [{ table: "lessons" as const, id: "missing" }] } },
      { database: { ...cleanDatabase, mismatches: [{ table: "lessons" as const, id: "drift", fields: ["title"] }] } },
      { unexpectedStorage: ["courses/bmh-test/v1/stale.bin"] },
      { assetProblems: [{ path: "courses/bmh-test/v1/a", problem: "checksum" }] },
    ]) {
      expect(() => buildReconciliationEvidence({ manifestBytes: Buffer.from("manifest"), importId: "bmh-test-v1", scope: "full", environment: "test", database: cleanDatabase, assetProblems: [], unexpectedStorage: [], expectedStoragePaths: [], storagePrefix: "courses/bmh-test/v1/", ...mutation })).toThrow(/reconciliation failed/);
    }
  });

  it("binds the canonical prefix and rejects duplicate or escaping expected objects", () => {
    const base = { manifestBytes: Buffer.from("manifest"), importId: "bmh-test-v1", scope: "full" as const, environment: "test" as const, database: cleanDatabase, assetProblems: [], unexpectedStorage: [] };
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/other/v1/", expectedStoragePaths: [] })).toThrow(/canonical storage prefix/);
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/bmh-test/v1/", expectedStoragePaths: ["courses/bmh-test/v1/a", "courses/bmh-test/v1/a"] })).toThrow(/duplicate/);
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/bmh-test/v1/", expectedStoragePaths: ["courses/other/v1/a"] })).toThrow(/outside/);
  });

  it("wires the regular verify CLI to throw on exact reconciliation drift", () => {
    const command = readFileSync(join(process.cwd(), "scripts/course-import.ts"), "utf8");
    expect(command).toMatch(/if \(command === "verify"\)[\s\S]*assertExactReconciliationClean\(\{ database: reconciliation, assetProblems, unexpectedStorage \}\)/);
  });
});
