import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildTechStackCanary } from "./build-canary-manifest.mjs";
import { validateArtworkManifestTrustBoundary } from "./build-manifest.mjs";
import { inspectApprovedCaptionAssets } from "./validate-caption-assets.mjs";
import { validateCaptionApprovalHistory, validateCaptionApprovalLedger } from "./caption-approval-ledger.mjs";
import {
  REVIEWED_VIDEO_SOURCE_KEYS,
  validateHeldVideoApprovalHistory,
} from "./held-video-approval-ledger.mjs";
import { localPolicyCandidateAssets } from "./held-video-local-policy-candidates.mjs";
import {
  fetchCloserProductionGraph,
  rolePlayBindings,
  validateScenarioProductionTrust,
} from "./closer-lab-production-mapping.mjs";
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
const CAPTION_APPROVAL_LEDGER_PATH = join(
  REPO_ROOT,
  "docs/course-production/caption-approvals.json",
);
const VIDEO_APPROVAL_LEDGER_PATH = join(
  REPO_ROOT,
  "docs/course-production/held-video-review/approvals.json",
);
const SCENARIO_MAPPING_LEDGER_PATH = join(
  REPO_ROOT,
  "docs/course-production/closer-lab-production-mapping.json",
);
const SCENARIO_RECONCILIATION_PATH = join(
  REPO_ROOT,
  "docs/course-production/closer-lab-production-mapping-reconciliation.json",
);
const SCENARIO_PRODUCTION_CATALOG_PATH = join(
  REPO_ROOT,
  "docs/course-production/closer-lab-production-catalog.json",
);
const SCENARIO_PRODUCTION_CATALOG_PROVENANCE_PATH = join(
  REPO_ROOT,
  "docs/course-production/closer-lab-production-catalog.provenance.json",
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

async function validateBmhFileBackedReleaseTrust({
  manifest,
  artworkLedger,
  captionApprovalLedger,
  videoApprovalLedger,
  localPolicyCandidates,
}) {
  const blockers = await validateBmhArtworkReleaseTrust({ manifest, artworkLedger });
  const captionReport = await inspectApprovedCaptionAssets(
    manifest,
    pathToFileURL(`${REPO_ROOT}/`),
  );
  blockers.push(...captionReport.errors.map(
    (error) => `Caption/transcript file trust failed: ${error}`,
  ));
  blockers.push(...captionReport.policyBlockers.map(
    (blocker) => `Approved media role policy: ${blocker}`,
  ));
  const captionApprovalErrors = await validateCaptionApprovalLedger({
    ledger: captionApprovalLedger,
    manifest,
    repoRoot: REPO_ROOT,
  });
  captionApprovalErrors.push(...await validateCaptionApprovalHistory({
    ledger: captionApprovalLedger,
    repoRoot: REPO_ROOT,
    ledgerPath: CAPTION_APPROVAL_LEDGER_PATH,
  }));
  blockers.push(...captionApprovalErrors.map(
    (error) => `Caption/transcript approval trust failed: ${error}`,
  ));
  const currentReviewAssets = [
    ...(manifest.assets ?? []).filter((asset) =>
      asset.kind === "video" && REVIEWED_VIDEO_SOURCE_KEYS.has(asset.source_key),
    ),
    ...localPolicyCandidateAssets(localPolicyCandidates),
  ];
  const videoHistoryErrors = await validateHeldVideoApprovalHistory({
    ledger: videoApprovalLedger,
    currentReviewAssets,
    repoRoot: REPO_ROOT,
    ledgerPath: VIDEO_APPROVAL_LEDGER_PATH,
  });
  blockers.push(...videoHistoryErrors.map(
    (error) => `Held-video approval history trust failed: ${error}`,
  ));
  return blockers;
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function validateScenarioTrust(manifest) {
  const [manifestBytes, ledgerBytes, evidence, productionCatalogBytes, productionCatalogProvenance] = await Promise.all([
    readFile(join(CANONICAL_MANIFEST_DIRECTORY, "bmh-employee-training.v1.json")),
    readFile(SCENARIO_MAPPING_LEDGER_PATH),
    optionalJson(SCENARIO_RECONCILIATION_PATH),
    readFile(SCENARIO_PRODUCTION_CATALOG_PATH),
    optionalJson(SCENARIO_PRODUCTION_CATALOG_PROVENANCE_PATH),
  ]);
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  let liveAttestationBytes = null;
  if (ledger.status === "finalized") {
    try {
      liveAttestationBytes = await fetchCloserProductionGraph({
        catalogBytes: productionCatalogBytes,
        catalogProvenance: productionCatalogProvenance,
        url: process.env.CLOSER_LAB_PRODUCTION_SUPABASE_URL,
        serviceRoleKey: process.env.CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY,
      });
    } catch {
      liveAttestationBytes = null;
    }
  }
  return validateScenarioProductionTrust({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    evidence,
    catalogBytes: productionCatalogBytes,
    liveAttestationBytes,
  });
}

export async function validateBmhImportSemanticGate({
  manifest,
  now = new Date(),
}) {
  if (![BMH_FULL_IMPORT_ID, BMH_CANARY_IMPORT_ID].includes(manifest.import_id)) {
    return null;
  }
  const [stackConfirmation, approvalLedger, localPolicyCandidates, artworkLedger, captionApprovalLedger] = await Promise.all([
    loadManifest(join(CANONICAL_MANIFEST_DIRECTORY, "bmh-operating-stack-confirmation.v1.json")),
    loadManifest(join(REPO_ROOT, "docs/course-production/held-video-review/approvals.json")),
    loadManifest(join(REPO_ROOT, "docs/course-production/held-video-review/local-policy-candidates.json")),
    loadManifest(ARTWORK_LEDGER_PATH),
    loadManifest(CAPTION_APPROVAL_LEDGER_PATH),
  ]);

  if (manifest.import_id === BMH_FULL_IMPORT_ID) {
    const canonicalFull = await loadManifest(
      join(CANONICAL_MANIFEST_DIRECTORY, "bmh-employee-training.v1.json"),
    );
    const report = validateManifest(manifest, {
      stackConfirmation,
      approvalLedger,
      localPolicyCandidates,
      now,
    });
    const trustBlockers = await validateBmhFileBackedReleaseTrust({
      manifest,
      artworkLedger,
      captionApprovalLedger,
      videoApprovalLedger: approvalLedger,
      localPolicyCandidates,
    });
    const scenarioTrust = await validateScenarioTrust(manifest);
    const identityErrors = isDeepStrictEqual(manifest, canonicalFull)
      ? []
      : ["Full BMH manifest is not source-equivalent to the canonical release manifest."];
    return {
      scope: "full",
      ...report,
      errors: [...report.errors, ...identityErrors, ...scenarioTrust.errors],
      publicationBlockers: [
        ...report.publicationBlockers,
        ...trustBlockers,
        ...scenarioTrust.blockers,
      ],
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
    captionApprovalLedger,
    videoApprovalLedger: approvalLedger,
    localPolicyCandidates,
  });
  const scenarioTrust = rolePlayBindings(manifest).length > 0
    ? await validateScenarioTrust(manifest)
    : { errors: [], blockers: [] };
  const errors = fullReport.errors.map((error) => `full-source semantic QA: ${error}`);
  errors.push(...scenarioTrust.errors.map((error) => `canary scenario trust: ${error}`));
  if (!isDeepStrictEqual(manifest, expectedCanary)) {
    errors.push("Canary manifest is not the exact deterministic Tech Stack slice derived from the full BMH manifest.");
  }
  const publicationBlockers = [];
  publicationBlockers.push(...fullTrustBlockers.map((blocker) =>
    `full-source release trust: ${blocker}`,
  ));
  publicationBlockers.push(...scenarioTrust.blockers.map((blocker) =>
    `canary scenario trust: ${blocker}`,
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
