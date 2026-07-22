import type { ImportPlan } from "./operations";

type ProductionLedgerAsset = {
  asset_key?: unknown;
  checksum_sha256?: unknown;
  history?: unknown;
  poster_redesign_replacement?: unknown;
  current_poster_replacement_provenance?: unknown;
};

type ProductionLedger = {
  assets?: unknown;
  video_poster_redesign_approval?: unknown;
};

export type ImportedVideoPosterReplacement = {
  block_id: string;
  poster_asset_key: string;
  expected_content: Record<string, unknown>;
  expected_poster_path: string;
  expected_poster_sha256: string;
  replacement_poster_path: string;
  replacement_poster_sha256: string;
  replacement_size_bytes: number;
};

type VideoPosterApproval = {
  schema_version?: unknown;
  decision?: unknown;
  approver?: unknown;
  assets?: unknown;
};

export function buildImportedVideoPosterReplacements(
  plan: ImportPlan,
  ledgerInput: unknown,
): ImportedVideoPosterReplacement[] {
  const ledger = ledgerInput as ProductionLedger;
  if (!Array.isArray(ledger.assets)) {
    throw new Error("Production artwork ledger has no assets array.");
  }

  const posterAssetsByPath = new Map(
    plan.assets
      .filter((asset) => asset.source_key.startsWith("poster-") && asset.kind === "image")
      .map((asset) => [asset.storage_path, asset]),
  );
  const ledgerAssets = new Map(
    (ledger.assets as ProductionLedgerAsset[])
      .filter((asset) => typeof asset.asset_key === "string")
      .map((asset) => [asset.asset_key as string, asset]),
  );
  const replacements: ImportedVideoPosterReplacement[] = [];

  for (const operation of plan.operations) {
    if (operation.table !== "content_blocks" || operation.row.block_type !== "video") continue;
    const content = operation.row.content;
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      throw new Error(`${operation.sourceKey} has invalid video content.`);
    }
    const replacementPath = (content as Record<string, unknown>).poster_path;
    if (typeof replacementPath !== "string") {
      throw new Error(`${operation.sourceKey} has no approved replacement poster path.`);
    }
    const manifestAsset = posterAssetsByPath.get(replacementPath);
    if (!manifestAsset) {
      throw new Error(`${operation.sourceKey} poster path does not bind to one manifest poster asset.`);
    }
    const ledgerAsset = ledgerAssets.get(manifestAsset.source_key);
    if (!ledgerAsset || ledgerAsset.current_poster_replacement_provenance == null) {
      throw new Error(`${manifestAsset.source_key} has no current poster replacement provenance.`);
    }
    const history = Array.isArray(ledgerAsset.history) ? ledgerAsset.history : [];
    const rollback = history.findLast((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const archivedPath = (entry as Record<string, unknown>).archived_path;
      return typeof archivedPath === "string"
        && archivedPath.startsWith("course-assets/posters/redesign-history/");
    }) as Record<string, unknown> | undefined;
    const expectedChecksum = rollback?.checksum_sha256;
    const replacementChecksum = manifestAsset.checksum_sha256;
    if (typeof expectedChecksum !== "string" || !/^[0-9a-f]{64}$/.test(expectedChecksum)) {
      throw new Error(`${manifestAsset.source_key} has no exact poster redesign rollback checksum.`);
    }
    if (
      typeof replacementChecksum !== "string"
      || !/^[0-9a-f]{64}$/.test(replacementChecksum)
      || !replacementPath.includes(replacementChecksum)
      || !Number.isSafeInteger(manifestAsset.size_bytes)
      || manifestAsset.size_bytes === null
      || manifestAsset.size_bytes < 1
    ) {
      throw new Error(`${manifestAsset.source_key} has incomplete replacement provenance in the import plan.`);
    }

    replacements.push({
      block_id: operation.id,
      poster_asset_key: manifestAsset.source_key,
      expected_content: {
        ...(content as Record<string, unknown>),
        poster_path: replacementPath.replace(replacementChecksum, expectedChecksum),
      },
      expected_poster_path: replacementPath.replace(replacementChecksum, expectedChecksum),
      expected_poster_sha256: expectedChecksum,
      replacement_poster_path: replacementPath,
      replacement_poster_sha256: replacementChecksum,
      replacement_size_bytes: manifestAsset.size_bytes,
    });
  }

  if (replacements.length === 0) {
    throw new Error("The import plan contains no approved video poster replacements.");
  }
  if (new Set(replacements.map((replacement) => replacement.block_id)).size !== replacements.length) {
    throw new Error("The import plan contains duplicate video block IDs.");
  }
  return replacements;
}

export function assertImportedVideoPosterReplacementApproval(options: {
  replacements: ImportedVideoPosterReplacement[];
  ledgerInput: unknown;
  approvalInput: unknown;
  approvalPath: string;
  approvalSha256: string;
}) {
  const ledger = options.ledgerInput as ProductionLedger;
  const approval = options.approvalInput as VideoPosterApproval;
  if (
    approval.schema_version !== "bmh-video-poster-redesign-approval/v1"
    || approval.decision !== "approved"
    || approval.approver !== "Jarrad Henry"
    || !Array.isArray(approval.assets)
  ) {
    throw new Error("Video poster replacement approval artifact is invalid.");
  }
  const ledgerApproval = ledger.video_poster_redesign_approval as Record<string, unknown> | undefined;
  if (
    ledgerApproval?.status !== "approved"
    || ledgerApproval.approved_by !== "Jarrad Henry"
    || ledgerApproval.evidence !== options.approvalPath
    || ledgerApproval.evidence_sha256 !== options.approvalSha256
  ) {
    throw new Error("Video poster replacement approval is not bound to the production ledger.");
  }
  if (!Array.isArray(ledger.assets)) {
    throw new Error("Production artwork ledger has no assets array.");
  }

  const replacementKeys = [...options.replacements.map((replacement) => replacement.poster_asset_key)].sort();
  const approvalKeys = approval.assets.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Video poster replacement approval has an invalid asset binding.");
    }
    const key = (candidate as Record<string, unknown>).poster_asset_key;
    if (typeof key !== "string") {
      throw new Error("Video poster replacement approval has an invalid poster asset key.");
    }
    return key;
  }).sort();
  if (
    approvalKeys.length !== replacementKeys.length
    || new Set(approvalKeys).size !== approvalKeys.length
    || JSON.stringify(approvalKeys) !== JSON.stringify(replacementKeys)
  ) {
    throw new Error("Video poster replacement approval does not bind the exact replacement asset set.");
  }

  const ledgerAssets = new Map(
    (ledger.assets as ProductionLedgerAsset[])
      .filter((asset) => typeof asset.asset_key === "string")
      .map((asset) => [asset.asset_key as string, asset]),
  );
  for (const replacement of options.replacements) {
    const asset = ledgerAssets.get(replacement.poster_asset_key);
    const provenance = asset?.poster_redesign_replacement as Record<string, unknown> | undefined;
    if (
      asset?.checksum_sha256 !== replacement.replacement_poster_sha256
      || provenance?.approval_evidence !== options.approvalPath
      || provenance.approval_evidence_sha256 !== options.approvalSha256
      || provenance.replaced_checksum_sha256 !== replacement.expected_poster_sha256
      || provenance.output_checksum_sha256 !== replacement.replacement_poster_sha256
    ) {
      throw new Error(`${replacement.poster_asset_key} replacement provenance is not bound to the exact approval and checksums.`);
    }
  }
}
