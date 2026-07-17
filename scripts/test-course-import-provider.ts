import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  assertCourseImportProviderAcceptanceEnvironment,
  assertCourseImportProviderAcceptanceResult,
} from "../src/lib/course-import/provider-acceptance";

const integrationFiles = [
  "src/lib/course-import/atomic-apply.integration.test.ts",
  "src/lib/course-import/atomic-rollback.integration.test.ts",
  "src/lib/course-import/artwork-provenance.integration.test.ts",
  "src/lib/course-import/exact-reconciliation.integration.test.ts",
  "src/lib/security/import-release-control.integration.test.ts",
];

process.exitCode = main();

function main() {
  const env = { ...process.env, ...readLocalTestEnvironment() };
  try {
    assertCourseImportProviderAcceptanceEnvironment(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }

  const reportDirectory = mkdtempSync(join(tmpdir(), "bmh-provider-acceptance-"));
  const reportPath = join(reportDirectory, "vitest.json");
  try {
    const result = spawnSync(
      "npm",
      [
        "run",
        "test:integration",
        "--",
        ...integrationFiles,
        "--reporter=json",
        `--outputFile=${reportPath}`,
      ],
      { cwd: process.cwd(), env, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
    const summary = assertCourseImportProviderAcceptanceResult(
      JSON.parse(readFileSync(reportPath, "utf8")),
      integrationFiles.length,
    );
    console.log(`Provider acceptance executed ${summary.tests} tests across ${summary.files} files.`);
    return 0;
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}

function readLocalTestEnvironment() {
  const path = resolve(process.cwd(), ".env.test.local");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return {};
    throw error;
  }
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) parsed[key] = value;
  }
  return parsed;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
