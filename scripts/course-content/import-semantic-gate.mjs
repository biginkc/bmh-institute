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
  validateScenarioMappingLedgerShape,
  validateScenarioProductionTrust,
  validateScenarioReconciliationEvidencePins,
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
const SCENARIO_ATTESTATION_PATH = join(
  REPO_ROOT,
  "docs/course-production/closer-lab-production-attestation.json",
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
    (error) => `Caption file trust failed: ${error}`,
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
    (error) => `Caption approval trust failed: ${error}`,
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
  if (rolePlayBindings(manifest).length === 0) {
    return { errors: [], blockers: [] };
  }
  const [manifestBytes, ledgerBytes, evidence, attestation, productionCatalogBytes, productionCatalogProvenance] = await Promise.all([
    readFile(join(CANONICAL_MANIFEST_DIRECTORY, "bmh-employee-training.v1.json")),
    readFile(SCENARIO_MAPPING_LEDGER_PATH),
    optionalJson(SCENARIO_RECONCILIATION_PATH),
    optionalJson(SCENARIO_ATTESTATION_PATH),
    readFile(SCENARIO_PRODUCTION_CATALOG_PATH),
    optionalJson(SCENARIO_PRODUCTION_CATALOG_PROVENANCE_PATH),
  ]);
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));

  // Hermetic by default: this runs in every PR's required CI check, so it
  // must never need a production credential -- exposing a Closer Lab
  // service-role key to arbitrary PR-triggered CI is its own security
  // exposure, independent of what the key can prove. It proves the checked-in
  // manifest, ledger, reconciliation record, and production attestation are
  // all mutually consistent -- the reconciliation and attestation were
  // themselves produced by a real, independently-run live fetch (see
  // course:reconcile:closer-lab) -- not by trusting only the ledger or
  // reconciliation file it's checking.
  const errors = validateScenarioMappingLedgerShape(manifest, ledger);
  const blockers = validateScenarioReconciliationEvidencePins({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    reconciliation: evidence,
    catalogBytes: productionCatalogBytes,
    attestation,
  });

  // Defense in depth, explicit opt-in only: when production credentials ARE
  // present, AND a separate flag explicitly requests live verification, also
  // re-verify live and require BOTH to agree. This is deliberately not just
  // "credentials happen to be present" -- ambient credentials in a dev shell
  // or an unrelated job must never silently turn a routine, hermetic test
  // command into one that calls production. Missing either the flag or the
  // credentials never weakens the hermetic result above; it just skips this
  // additional layer.
  if (
    ledger.status === "finalized" &&
    process.env.BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION === "1" &&
    process.env.CLOSER_LAB_PRODUCTION_SUPABASE_URL &&
    process.env.CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY &&
    process.env.BMH_INSTITUTE_SCENARIOS_ELEVENLABS_VOICE_ID
  ) {
    let liveAttestationBytes = null;
    try {
      liveAttestationBytes = await fetchCloserProductionGraph({
        catalogBytes: productionCatalogBytes,
        catalogProvenance: productionCatalogProvenance,
        url: process.env.CLOSER_LAB_PRODUCTION_SUPABASE_URL,
        serviceRoleKey: process.env.CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY,
        approvedVoiceId: process.env.BMH_INSTITUTE_SCENARIOS_ELEVENLABS_VOICE_ID,
      });
    } catch {
      liveAttestationBytes = null;
    }
    const live = await validateScenarioProductionTrust({
      manifest,
      manifestBytes,
      ledger,
      ledgerBytes,
      evidence,
      catalogBytes: productionCatalogBytes,
      liveAttestationBytes,
      approvedVoiceId: process.env.BMH_INSTITUTE_SCENARIOS_ELEVENLABS_VOICE_ID,
    });
    errors.push(...live.errors);
    blockers.push(...live.blockers);
  }

  return { errors, blockers };
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

export function assertBmhImportInvocationScope(report, canary) {
  if (!report) return;
  if (report.scope === "canary" && !canary) {
    throw new Error("The canonical BMH Tech Stack canary manifest requires --canary.");
  }
  if (report.scope === "full" && canary) {
    throw new Error("The canonical full BMH manifest cannot use --canary.");
  }
}
