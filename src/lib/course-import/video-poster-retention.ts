import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateCourseManifest } from "./manifest";
import { buildImportPlan, type ImportPlan } from "./operations";
import {
  assertImportedVideoPosterReplacementApproval,
  assertLocalSupersededVideoPosterAssets,
  buildImportedVideoPosterReplacements,
  buildSupersededVideoPosterAssets,
  hashVideoPosterReplacementPayload,
} from "./video-poster-replacement";

const FULL_IMPORT_ID = "bmh-employee-training-v1";
const CANARY_IMPORT_ID = "bmh-employee-training-canary-v1";
const FULL_MANIFEST = "content/course-manifests/bmh-employee-training.v1.json";
const LEDGER = "docs/course-production/thumbnail-pilots/production-ledger.json";
const APPROVAL = "docs/course-production/thumbnail-redesign/approvals/video-poster-redesign-approval-2026-07-21.json";

export async function loadApprovedVideoPosterRetention(
  plan: ImportPlan,
  sourceRoot = process.cwd(),
) {
  if (plan.importId !== FULL_IMPORT_ID && plan.importId !== CANARY_IMPORT_ID) return null;
  const [fullBytes, ledgerBytes, approvalBytes] = await Promise.all([
    readFile(resolve(sourceRoot, FULL_MANIFEST)),
    readFile(resolve(sourceRoot, LEDGER)),
    readFile(resolve(sourceRoot, APPROVAL)),
  ]);
  const full = validateCourseManifest(JSON.parse(fullBytes.toString("utf8")) as unknown, { gate: "release" });
  if (!full.ok) throw new Error(full.errors.map((error) => `- ${error}`).join("\n"));
  const ledger = JSON.parse(ledgerBytes.toString("utf8")) as unknown;
  const approvalSha256 = createHash("sha256").update(approvalBytes).digest("hex");
  const fullReplacements = buildImportedVideoPosterReplacements(buildImportPlan(full.value), ledger);
  assertImportedVideoPosterReplacementApproval({
    replacements: fullReplacements,
    ledgerInput: ledger,
    approvalInput: JSON.parse(approvalBytes.toString("utf8")) as unknown,
    approvalPath: APPROVAL,
    approvalSha256,
  });

  const replacements = plan.importId === FULL_IMPORT_ID
    ? fullReplacements
    : buildImportedVideoPosterReplacements(plan, ledger);
  const assets = buildSupersededVideoPosterAssets(replacements);
  await assertLocalSupersededVideoPosterAssets(sourceRoot, assets);
  return {
    importId: plan.importId,
    auditTable: plan.importId === FULL_IMPORT_ID
      ? "content_import_video_poster_replacement_records" as const
      : "content_import_canary_video_poster_replacement_records" as const,
    clientPayloadSha256: hashVideoPosterReplacementPayload(replacements),
    assets,
  };
}
