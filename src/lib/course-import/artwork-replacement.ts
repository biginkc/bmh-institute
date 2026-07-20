import type { ImportPlan } from "./operations";

type ProductionLedgerAsset = {
  asset_key?: unknown;
  history?: unknown;
  current_replacement_provenance?: unknown;
};

type ProductionLedger = {
  assets?: unknown;
};

export type ImportedLessonArtworkReplacement = {
  lesson_id: string;
  expected_thumbnail_asset_key: string;
  expected_thumbnail_approved_path: string;
  expected_thumbnail_approved_sha256: string;
  expected_thumbnail_path: string;
  replacement_thumbnail_asset_key: string;
  replacement_thumbnail_approved_path: string;
  replacement_thumbnail_approved_sha256: string;
  replacement_thumbnail_path: string;
};

export function buildImportedLessonArtworkReplacements(
  plan: ImportPlan,
  ledgerInput: unknown,
): ImportedLessonArtworkReplacement[] {
  const ledger = ledgerInput as ProductionLedger;
  if (!Array.isArray(ledger.assets)) {
    throw new Error("Production artwork ledger has no assets array.");
  }

  const replacementAssets = new Map<string, ProductionLedgerAsset>();
  for (const candidate of ledger.assets as ProductionLedgerAsset[]) {
    if (
      typeof candidate.asset_key === "string"
      && candidate.current_replacement_provenance != null
    ) {
      replacementAssets.set(candidate.asset_key, candidate);
    }
  }

  const manifestAssetKeys = new Set(plan.assets.map((asset) => asset.source_key));
  const replacements: ImportedLessonArtworkReplacement[] = [];
  for (const operation of plan.operations) {
    if (operation.table !== "lessons") continue;
    const assetKey = operation.row.thumbnail_asset_key;
    if (typeof assetKey !== "string" || !manifestAssetKeys.has(assetKey)) continue;
    const ledgerAsset = replacementAssets.get(assetKey);
    if (!ledgerAsset) continue;

    const history = Array.isArray(ledgerAsset.history) ? ledgerAsset.history : [];
    const rollback = history.findLast((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const archivedPath = (entry as Record<string, unknown>).archived_path;
      return typeof archivedPath === "string"
        && archivedPath.startsWith("course-assets/thumbnails/redesign-history/");
    }) as Record<string, unknown> | undefined;
    const expectedChecksum = rollback?.checksum_sha256;
    if (typeof expectedChecksum !== "string" || !/^[0-9a-f]{64}$/.test(expectedChecksum)) {
      throw new Error(`${assetKey} has no exact redesign rollback checksum.`);
    }

    const approvedPath = operation.row.thumbnail_approved_path;
    const replacementChecksum = operation.row.thumbnail_approved_sha256;
    const replacementPath = operation.row.thumbnail_path;
    if (
      typeof approvedPath !== "string"
      || typeof replacementChecksum !== "string"
      || typeof replacementPath !== "string"
      || !replacementPath.includes(replacementChecksum)
    ) {
      throw new Error(`${assetKey} has incomplete replacement provenance in the import plan.`);
    }

    replacements.push({
      lesson_id: operation.id,
      expected_thumbnail_asset_key: assetKey,
      expected_thumbnail_approved_path: approvedPath,
      expected_thumbnail_approved_sha256: expectedChecksum,
      expected_thumbnail_path: replacementPath.replace(replacementChecksum, expectedChecksum),
      replacement_thumbnail_asset_key: assetKey,
      replacement_thumbnail_approved_path: approvedPath,
      replacement_thumbnail_approved_sha256: replacementChecksum,
      replacement_thumbnail_path: replacementPath,
    });
  }

  if (replacements.length === 0) {
    throw new Error("The import plan contains no approved lesson artwork replacements.");
  }
  return replacements;
}
