import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildTechStackCanary } from "./build-canary-manifest.mjs";
import { validateArtworkManifestTrustBoundary } from "./build-manifest.mjs";
import { inspectApprovedCaptionAssets } from "./validate-caption-assets.mjs";
import {
  collectDialPadReferences,
  loadManifest,
  validateManifest,
  validateStackConfirmation,
} from "./validate-manifest.mjs";

export const BMH_FULL_IMPORT_ID = "bmh-employee-training-v1";
export const BMH_CANARY_IMPORT_ID = "bmh-employee-training-canary-v1";
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CANONICAL_MANIFEST_DIRECTORY = join(REPO_ROOT, "content/course-manifests");
const ARTWORK_LEDGER_PATH = join(
  REPO_ROOT,
  "docs/course-production/thumbnail-pilots/production-ledger.json",
);
const ARTWORK_INVENTORY_PATH = join(
  REPO_ROOT,
  "docs/course-production/thumbnail-pilots/production-inventory.json",
);

export async function validateBmhArtworkReleaseTrust({
  manifest,
  artworkLedger,
  repoRoot = REPO_ROOT,
  inventoryPath = ARTWORK_INVENTORY_PATH,
}) {
  if (artworkLedger?.status !== "finalized") {
    return ["Artwork production ledger is not finalized with Jarrad's exact approval evidence."];
  }
  try {
    const trusted = await validateArtworkManifestTrustBoundary(manifest, artworkLedger, {
      repoRoot,
      inventoryPath,
    });
    if (!isDeepStrictEqual(trusted, manifest)) {
      return ["Manifest artwork metadata does not exactly match the finalized artwork ledger."];
    }
  } catch (error) {
    return [`Artwork trust verification failed: ${error instanceof Error ? error.message : String(error)}`];
  }
  return [];
}

async function validateBmhFileBackedReleaseTrust({ manifest, artworkLedger }) {
  const blockers = await validateBmhArtworkReleaseTrust({ manifest, artworkLedger });
  const captionReport = await inspectApprovedCaptionAssets(
    manifest,
    pathToFileURL(`${REPO_ROOT}/`),
  );
  blockers.push(...captionReport.errors.map(
    (error) => `Caption/transcript file trust failed: ${error}`,
  ));
  return blockers;
}

export async function validateBmhImportSemanticGate({
  manifest,
  now = new Date(),
}) {
  if (![BMH_FULL_IMPORT_ID, BMH_CANARY_IMPORT_ID].includes(manifest.import_id)) {
    return null;
  }
  const [stackConfirmation, approvalLedger, localPolicyCandidates, artworkLedger] = await Promise.all([
    loadManifest(join(CANONICAL_MANIFEST_DIRECTORY, "bmh-operating-stack-confirmation.v1.json")),
    loadManifest(join(REPO_ROOT, "docs/course-production/held-video-review/approvals.json")),
    loadManifest(join(REPO_ROOT, "docs/course-production/held-video-review/local-policy-candidates.json")),
    loadManifest(ARTWORK_LEDGER_PATH),
  ]);

  if (manifest.import_id === BMH_FULL_IMPORT_ID) {
    const report = validateManifest(manifest, {
      stackConfirmation,
      approvalLedger,
      localPolicyCandidates,
      now,
    });
    const trustBlockers = await validateBmhFileBackedReleaseTrust({
      manifest,
      artworkLedger,
    });
    return {
      scope: "full",
      ...report,
      publicationBlockers: [...report.publicationBlockers, ...trustBlockers],
    };
  }

  const full = await loadManifest(join(CANONICAL_MANIFEST_DIRECTORY, "bmh-employee-training.v1.json"));
  const expectedCanary = buildTechStackCanary(full);
  const fullReport = validateManifest(full, {
    stackConfirmation,
    approvalLedger,
    localPolicyCandidates,
    now,
  });
  const fullTrustBlockers = await validateBmhFileBackedReleaseTrust({
    manifest: full,
    artworkLedger,
  });
  const errors = fullReport.errors.map((error) => `full-source semantic QA: ${error}`);
  if (!isDeepStrictEqual(manifest, expectedCanary)) {
    errors.push("Canary manifest is not the exact deterministic Tech Stack slice derived from the full BMH manifest.");
  }
  const publicationBlockers = [];
  publicationBlockers.push(...fullTrustBlockers.map((blocker) =>
    `full-source release trust: ${blocker}`,
  ));
  for (const asset of manifest.assets ?? []) {
    if (asset.approval_status === "hold") {
      publicationBlockers.push(`${asset.source_key} is held and cannot enter the canary`);
    } else if (asset.approval_status === "missing") {
      publicationBlockers.push(`${asset.source_key} has not been produced for the canary`);
    }
  }
  if (collectDialPadReferences(manifest).length > 0) {
    const stackIssues = validateStackConfirmation(manifest, stackConfirmation, now);
    if (stackIssues.length > 0) {
      publicationBlockers.push(
        `DialPad references require a valid current-stack confirmation: ${stackIssues.join("; ")}`,
      );
    }
  }
  return {
    scope: "canary",
    errors,
    publicationBlockers,
    warnings: fullReport.warnings,
    summary: {
      derived_from: BMH_FULL_IMPORT_ID,
      assets: manifest.assets?.length ?? 0,
      lessons: manifest.program?.courses?.[0]?.modules?.[0]?.lessons?.length ?? 0,
    },
  };
}

export function assertBmhImportSemanticGate(
  report,
  { enforcePublicationBlockers },
) {
  if (!report) return;
  if (report.errors.length > 0) {
    throw new Error(`BMH semantic validation failed:\n${report.errors.map((error) => `- ${error}`).join("\n")}`);
  }
  if (enforcePublicationBlockers && report.publicationBlockers.length > 0) {
    throw new Error(
      `BMH publication gate failed:\n${report.publicationBlockers.map((error) => `- ${error}`).join("\n")}`,
    );
  }
}
