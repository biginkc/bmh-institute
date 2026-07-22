import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildReconciliationEvidence } from "../../../scripts/course-content/build-import-reconciliation-evidence";
import {
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
} from "./environment";

const cleanDatabase = { checked: 103, missing: [], mismatches: [], unexpected: [], catalogSha256: "a".repeat(64), inventorySha256: "b".repeat(64) };

describe("exact reconciliation evidence", () => {
  it("is checksum-bound and deterministic for the same recorded inputs", () => {
    const input = { manifestBytes: Buffer.from("manifest"), importId: "bmh-test-v1", scope: "full" as const, environment: "test" as const, environmentUrl: COURSE_IMPORT_TEST_URL, database: cleanDatabase, assetProblems: [], unexpectedStorage: [], expectedStoragePaths: ["courses/bmh-test/v1/a"], storagePrefix: "courses/bmh-test/v1/" };
    expect(buildReconciliationEvidence(input)).toEqual(buildReconciliationEvidence(input));
    expect(buildReconciliationEvidence(input)).toMatchObject({
      environment: "test",
      environment_url: COURSE_IMPORT_TEST_URL,
    });
  });

  it("refuses extra rows, extra objects, missing rows, field drift, and asset drift", () => {
    for (const mutation of [
      { database: { ...cleanDatabase, unexpected: [{ table: "lessons" as const, id: "extra" }] } },
      { database: { ...cleanDatabase, missing: [{ table: "lessons" as const, id: "missing" }] } },
      { database: { ...cleanDatabase, mismatches: [{ table: "lessons" as const, id: "drift", fields: ["title"] }] } },
      { unexpectedStorage: ["courses/bmh-test/v1/stale.bin"] },
      { assetProblems: [{ path: "courses/bmh-test/v1/a", problem: "checksum" }] },
    ]) {
      expect(() => buildReconciliationEvidence({ manifestBytes: Buffer.from("manifest"), importId: "bmh-test-v1", scope: "full", environment: "test", environmentUrl: COURSE_IMPORT_TEST_URL, database: cleanDatabase, assetProblems: [], unexpectedStorage: [], expectedStoragePaths: [], storagePrefix: "courses/bmh-test/v1/", ...mutation })).toThrow(/reconciliation failed/);
    }
  });

  it("binds the canonical prefix and rejects duplicate or escaping expected objects", () => {
    const base = { manifestBytes: Buffer.from("manifest"), importId: "bmh-test-v1", scope: "full" as const, environment: "test" as const, environmentUrl: COURSE_IMPORT_TEST_URL, database: cleanDatabase, assetProblems: [], unexpectedStorage: [] };
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/other/v1/", expectedStoragePaths: [] })).toThrow(/canonical storage prefix/);
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/bmh-test/v1/", expectedStoragePaths: ["courses/bmh-test/v1/a", "courses/bmh-test/v1/a"] })).toThrow(/duplicate/);
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/bmh-test/v1/", expectedStoragePaths: ["courses/other/v1/a"] })).toThrow(/outside/);
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/bmh-test/v1/", expectedStoragePaths: ["courses/bmh-test/v1/../../outside.bin"] })).toThrow(/noncanonical/);
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/bmh-test/v1/", expectedStoragePaths: ["courses/bmh-test/v1/%2e%2e/outside.bin"] })).toThrow(/noncanonical/);
    expect(() => buildReconciliationEvidence({ ...base, storagePrefix: "courses/bmh-test/v1/", expectedStoragePaths: ["courses/bmh-test/v1/..\\outside.bin"] })).toThrow(/noncanonical/);
  });

  it("separates required objects from optional rollback paths and observed presence", () => {
    const evidence = buildReconciliationEvidence({
      manifestBytes: Buffer.from("manifest"),
      importId: "bmh-test-v1",
      scope: "full",
      environment: "test",
      environmentUrl: COURSE_IMPORT_TEST_URL,
      database: cleanDatabase,
      assetProblems: [],
      unexpectedStorage: [],
      expectedStoragePaths: ["courses/bmh-test/v1/current.webp"],
      optionalAllowedStoragePaths: ["courses/bmh-test/v1/old-a.webp", "courses/bmh-test/v1/old-b.webp"],
      presentOptionalStoragePaths: ["courses/bmh-test/v1/old-a.webp"],
      storagePrefix: "courses/bmh-test/v1/",
    });
    expect(evidence).toMatchObject({
      expected_storage_object_count: 1,
      optional_allowed_storage_object_count: 2,
      present_optional_storage_object_count: 1,
      absent_optional_storage_object_count: 1,
    });
    expect(() => buildReconciliationEvidence({
      manifestBytes: Buffer.from("manifest"),
      importId: "bmh-test-v1",
      scope: "full",
      environment: "test",
      environmentUrl: COURSE_IMPORT_TEST_URL,
      database: cleanDatabase,
      assetProblems: [],
      unexpectedStorage: [],
      expectedStoragePaths: [],
      optionalAllowedStoragePaths: ["courses/bmh-test/v1/old.webp"],
      presentOptionalStoragePaths: ["courses/bmh-test/v1/not-allowed.webp"],
      storagePrefix: "courses/bmh-test/v1/",
    })).toThrow(/invalid optional retained/i);
  });

  it("binds evidence to the exact canonical project and BMH manifest scope", () => {
    const base = {
      manifestBytes: Buffer.from("manifest"),
      database: cleanDatabase,
      assetProblems: [],
      unexpectedStorage: [],
      expectedStoragePaths: [],
    };
    expect(() => buildReconciliationEvidence({
      ...base,
      importId: "bmh-employee-training-canary-v1",
      scope: "full",
      environment: "test",
      environmentUrl: COURSE_IMPORT_TEST_URL,
      storagePrefix: "courses/bmh-employee-training-canary/v1/",
    })).toThrow(/requires canary scope/);
    expect(() => buildReconciliationEvidence({
      ...base,
      importId: "bmh-employee-training-v1",
      scope: "canary",
      environment: "production",
      environmentUrl: COURSE_IMPORT_PRODUCTION_URL,
      storagePrefix: "courses/bmh-employee-training/v1/",
    })).toThrow(/requires full scope/);
    expect(() => buildReconciliationEvidence({
      ...base,
      importId: "bmh-test-v1",
      scope: "full",
      environment: "test",
      environmentUrl: COURSE_IMPORT_PRODUCTION_URL,
      storagePrefix: "courses/bmh-test/v1/",
    })).toThrow(/environment URL does not match/);
    expect(() => buildReconciliationEvidence({
      ...base,
      importId: "bmh-test-v1",
      scope: "full",
      environment: "test",
      environmentUrl: "https://user:password@jvaabkchkihkjllehmft.supabase.co",
      storagePrefix: "courses/bmh-test/v1/",
    })).toThrow(/canonical BMH Institute test or production/);
  });

  it("wires the regular verify CLI to throw on exact reconciliation drift", () => {
    const command = readFileSync(join(process.cwd(), "scripts/course-import.ts"), "utf8");
    expect(command).toMatch(/if \(command === "verify"\)[\s\S]*assertExactReconciliationClean\(\{ database: reconciliation, assetProblems, unexpectedStorage \}\)/);
  });
});
