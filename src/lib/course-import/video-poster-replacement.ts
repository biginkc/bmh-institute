import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { CourseImportAsset } from "./manifest";
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
  expected_size_bytes: number;
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
    const expectedSize = rollback?.size_bytes;
    const replacementChecksum = manifestAsset.checksum_sha256;
    if (
      typeof expectedChecksum !== "string"
      || !/^[0-9a-f]{64}$/.test(expectedChecksum)
      || !Number.isSafeInteger(expectedSize)
      || (expectedSize as number) < 1
    ) {
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
      expected_size_bytes: expectedSize as number,
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

export function buildSupersededVideoPosterAssets(
  replacements: ImportedVideoPosterReplacement[],
): CourseImportAsset[] {
  return replacements.map((replacement) => ({
    source_key: `superseded-${replacement.poster_asset_key}`,
    kind: "image",
    local_path: `course-assets/posters/redesign-history/${replacement.poster_asset_key}-${replacement.expected_poster_sha256}.webp`,
    storage_path: replacement.expected_poster_path,
    mime_type: "image/webp",
    checksum_sha256: replacement.expected_poster_sha256,
    size_bytes: replacement.expected_size_bytes,
    approval_status: "approved",
  }));
}

export async function assertLocalSupersededVideoPosterAssets(
  sourceRoot: string,
  assets: CourseImportAsset[],
) {
  const root = await realpath(resolve(sourceRoot));
  for (const asset of assets) {
    if (asset.checksum_sha256 === null || asset.size_bytes === null) {
      throw new Error(`${asset.source_key} has incomplete local rollback evidence.`);
    }
    const requested = resolve(root, asset.local_path);
    const withinRoot = relative(root, requested);
    if (withinRoot.startsWith("..") || resolve(root, withinRoot) !== requested) {
      throw new Error(`${asset.source_key} rollback path escapes the repository.`);
    }
    const requestedStat = await lstat(requested);
    if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) {
      throw new Error(`${asset.source_key} rollback path is not a regular file.`);
    }
    const canonical = await realpath(requested);
    const canonicalWithinRoot = relative(root, canonical);
    if (canonicalWithinRoot.startsWith("..") || resolve(root, canonicalWithinRoot) !== canonical) {
      throw new Error(`${asset.source_key} rollback file escapes the repository.`);
    }
    const bytes = await readFile(canonical);
    if (
      bytes.length !== asset.size_bytes
      || createHash("sha256").update(bytes).digest("hex") !== asset.checksum_sha256
    ) {
      throw new Error(`${asset.source_key} local rollback bytes do not match their exact evidence.`);
    }
  }
}

export function hashVideoPosterReplacementPayload(
  replacements: ImportedVideoPosterReplacement[],
) {
  return createHash("sha256").update(JSON.stringify(replacements)).digest("hex");
}

export function hashVideoPosterTargetState(
  replacements: ImportedVideoPosterReplacement[],
) {
  const targets = replacements
    .map((replacement) => ({
      id: replacement.block_id,
      content: canonicalizeJson(replacement.expected_content),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify(targets)).digest("hex");
}

export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson((value as Record<string, unknown>)[key])]),
  );
}

export function buildVideoPosterProductionPreflight(options: {
  importId: string;
  catalogSha256: string;
  currentBlocks: Array<{ id: string; content: unknown }>;
  replacements: ImportedVideoPosterReplacement[];
  approvalPath: string;
  approvalSha256: string;
  recordedAt: string;
}) {
  const currentById = new Map(options.currentBlocks.map((block) => [block.id, block.content]));
  const mismatchCount = options.replacements.filter((replacement) =>
    JSON.stringify(canonicalizeJson(currentById.get(replacement.block_id)))
      !== JSON.stringify(canonicalizeJson(replacement.expected_content)),
  ).length;
  if (
    !/^[0-9a-f]{64}$/.test(options.catalogSha256)
    || !/^[0-9a-f]{64}$/.test(options.approvalSha256)
    || !Number.isFinite(Date.parse(options.recordedAt))
  ) {
    throw new Error("Production preflight requires exact catalog, approval, and timestamp evidence.");
  }
  return {
    schema_version: "bmh-video-poster-production-preflight/v1" as const,
    import_id: options.importId,
    catalog_sha256: options.catalogSha256,
    target_count: options.replacements.length,
    target_mismatch_count: mismatchCount,
    target_state_sha256: hashVideoPosterTargetState(options.replacements),
    client_payload_sha256: hashVideoPosterReplacementPayload(options.replacements),
    approval_evidence: options.approvalPath,
    approval_evidence_sha256: options.approvalSha256,
    recorded_at: options.recordedAt,
  };
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
