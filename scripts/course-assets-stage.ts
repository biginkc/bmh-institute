import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  cleanupStagingRoot,
  stageManifestAssets,
  writeMachineReport,
} from "../src/lib/course-import/asset-staging";
import {
  validateCanaryScope,
  validateCourseManifest,
} from "../src/lib/course-import/manifest";

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "cleanup") {
    const report = await cleanupStagingRoot(parsed.target);
    if (parsed.reportPath) await writeMachineReport(parsed.reportPath, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const manifestPath = resolve(parsed.target);
  const manifestBytes = await readFile(manifestPath);
  const raw = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  const validation = validateCourseManifest(raw, { gate: "draft" });
  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => `- ${error}`).join("\n"));
  }
  if (parsed.canary) {
    const errors = validateCanaryScope(validation.value);
    if (errors.length > 0) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  }

  const mode = parsed.command === "check" || parsed.dryRun ? "check" : "stage";
  const report = await stageManifestAssets({
    manifest: validation.value,
    manifestPath,
    manifestBytes,
    sourceRoots: parsed.sourceRoots,
    mode,
    stagingRoot: parsed.stagingRoot,
  });
  if (parsed.reportPath) await writeMachineReport(parsed.reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exitCode = 1;
  else if (report.blockers.length > 0) process.exitCode = 2;
}

function parseArgs(args: string[]) {
  const command = args[0];
  const target = args[1];
  if (!command || !target || !["check", "stage", "cleanup"].includes(command)) {
    throw new Error(
      "Usage: npm run course:assets:stage -- <check|stage> <manifest.json> --source-root=<trusted-root> [--source-root=<fallback-root>] [--staging-root=<path>] [--report=<path>] [--canary] [--dry-run]\n" +
        "       npm run course:assets:stage -- cleanup <staging-root> [--report=<path>]",
    );
  }
  const value = (prefix: string) =>
    args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const sourceRoots = args
    .filter((arg) => arg.startsWith("--source-root="))
    .map((arg) => arg.slice("--source-root=".length));
  if (command !== "cleanup" && sourceRoots.length === 0) {
    throw new Error("At least one explicit --source-root is required.");
  }
  if (command === "stage" && !args.includes("--dry-run") && !value("--staging-root=")) {
    throw new Error("--staging-root is required in stage mode.");
  }
  return {
    command: command as "check" | "stage" | "cleanup",
    target,
    sourceRoots,
    stagingRoot: value("--staging-root="),
    reportPath: value("--report="),
    canary: args.includes("--canary"),
    dryRun: args.includes("--dry-run"),
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
