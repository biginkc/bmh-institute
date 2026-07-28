import { createHash } from "node:crypto";

import type { CourseImportManifest } from "./manifest";
import { validateCourseManifest } from "./manifest";
import { buildImportPlan, type ImportOperation, type ImportPlan } from "./operations";

/**
 * Versioned, reusable successor to released-content-block-revision.ts (the
 * one-shot 44-block correction). That module hardcoded three fixed source-key
 * lists (19 guides, 19 flashcards, 6 role-plays), two manifest SHA-256
 * constants, and an exact 44-row payload assertion baked into its types --
 * none of that generalizes to a different set of blocks.
 *
 * This module instead diffs an arbitrary legacy manifest against an arbitrary
 * target manifest for a given import_id and derives whatever mutation set
 * the diff actually contains: any block present in target but not legacy is
 * an insert, any block present in both whose content/placement changed is an
 * update. Nothing here is hardcoded to a specific block count, block type
 * allow-list, or checksum -- those come from the manifests and the caller's
 * own preflight, mirroring fn_revise_released_content_blocks_v2's own lack of
 * hardcoded pins.
 */

export type ReleasedContentBlockRevisionV2Mutation = {
  action: "update" | "insert";
  source_key: string;
  block_id: string;
  lesson_id: string;
  block_type: string;
  expected_content: Record<string, unknown> | null;
  replacement_content: Record<string, unknown>;
  sort_order: number;
  is_required_for_completion: boolean;
  replacement_sha256: string | null;
  replacement_size_bytes: number | null;
};

export type ReleasedContentBlockRevisionV2 = {
  import_id: string;
  mutations: ReleasedContentBlockRevisionV2Mutation[];
  summary: {
    mutation_count: number;
    update_count: number;
    insert_count: number;
  };
};

export type ReleasedContentBlockRevisionV2Row = {
  id: string;
  lesson_id: string;
  block_type: string;
  content: Record<string, unknown>;
  sort_order: number;
  is_required_for_completion: boolean;
};

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseManifest(bytes: Uint8Array, importId: string, label: "legacy" | "target") {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`Released content revision v2 ${label} manifest is not valid JSON.`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as Record<string, unknown>).import_id !== importId
  ) {
    throw new Error(
      `Released content revision v2 ${label} manifest does not carry import_id ${importId}.`,
    );
  }
  return parsed as CourseImportManifest;
}

function validatedTargetManifest(bytes: Uint8Array, importId: string) {
  const parsed = parseManifest(bytes, importId, "target");
  const validation = validateCourseManifest(parsed, { gate: "release" });
  if (!validation.ok) {
    throw new Error(
      `Released content revision v2 target manifest is invalid:\n${validation.errors.join("\n")}`,
    );
  }
  return validation.value;
}

function contentBlocks(plan: ImportPlan) {
  return new Map(
    plan.operations
      .filter((operation) => operation.table === "content_blocks")
      .map((operation) => [operation.sourceKey, operation]),
  );
}

/** Stable, order-independent JSON serialization used only for TS-side diff
 * detection (not a security-relevant hash -- fn_revise_released_content_blocks_v2
 * computes its own canonical digest of the mutation payload server-side). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Every operation OTHER than content_blocks, keyed by `table:sourceKey`, so
 * they can be diffed for out-of-scope drift. content_blocks is deliberately
 * excluded -- that is the one table this builder is allowed to mutate.
 */
function nonContentBlockOperations(plan: ImportPlan) {
  return new Map(
    plan.operations
      .filter((operation) => operation.table !== "content_blocks")
      .map((operation) => [`${operation.table}:${operation.sourceKey}`, operation]),
  );
}

/**
 * Refuses if the target manifest changed anything OTHER than content_blocks
 * rows relative to the legacy manifest. Without this, a target manifest that
 * bundles an in-scope content-block edit together with an out-of-scope
 * change (a course title, a quiz question, a lesson's prerequisite, ...)
 * would silently commit only the content-block mutation while this
 * function's caller goes on to record the WHOLE target manifest's checksum
 * as the new "active manifest" -- so a later revision would trust that
 * checksum as accurately describing live data when it does not.
 */
function assertNoOutOfScopeManifestDrift(legacyPlan: ImportPlan, targetPlan: ImportPlan) {
  const legacy = nonContentBlockOperations(legacyPlan);
  const target = nonContentBlockOperations(targetPlan);
  const allKeys = new Set([...legacy.keys(), ...target.keys()]);
  for (const key of allKeys) {
    const legacyOperation = legacy.get(key);
    const targetOperation = target.get(key);
    if (!legacyOperation) {
      throw new Error(
        `Released content revision v2 refused: ${key} was added outside content_blocks. This mechanism only supports content-block mutations; an out-of-scope manifest change would be recorded as part of the active manifest without actually being applied.`,
      );
    }
    if (!targetOperation) {
      throw new Error(
        `Released content revision v2 refused: ${key} was removed outside content_blocks. This mechanism only supports content-block mutations.`,
      );
    }
    if (stableJson(legacyOperation.row) !== stableJson(targetOperation.row)) {
      throw new Error(
        `Released content revision v2 refused: ${key} changed outside content_blocks. This mechanism only supports content-block mutations; an out-of-scope manifest change would be recorded as part of the active manifest without actually being applied.`,
      );
    }
  }
}

/**
 * ImportPlan.assets is carried SEPARATELY from plan.operations, so the
 * operations-level drift check above cannot see it -- an added, removed, or
 * changed asset alongside a legitimate block edit would otherwise be
 * silently dropped while the full target manifest hash (including the
 * unapplied asset change) gets recorded as active. An asset difference is
 * permitted only when it is explicitly tied to a download mutation in this
 * revision's own payload (its storage_path is the mutation's replacement
 * file_path) -- and even then the SQL function independently verifies the
 * referenced storage object's existence, checksum, size, and import
 * ownership against storage.objects before applying anything, so the tie is
 * receipt-verified server-side rather than trusted from the manifest.
 */
function assertNoOutOfScopeAssetDrift(
  legacyPlan: ImportPlan,
  targetPlan: ImportPlan,
  mutations: ReleasedContentBlockRevisionV2Mutation[],
) {
  const legacyAssets = new Map(legacyPlan.assets.map((asset) => [asset.source_key, asset]));
  const targetAssets = new Map(targetPlan.assets.map((asset) => [asset.source_key, asset]));
  const mutationBackedPaths = new Set(
    mutations
      .filter((mutation) => mutation.block_type === "download")
      .map((mutation) => mutation.replacement_content.file_path)
      .filter((path): path is string => typeof path === "string"),
  );

  for (const [sourceKey, legacyAsset] of legacyAssets) {
    if (!targetAssets.has(sourceKey)) {
      throw new Error(
        `Released content revision v2 refused: asset ${sourceKey} was removed from the target manifest. This mechanism cannot apply asset removals; the removal would be recorded as part of the active manifest without actually happening.`,
      );
    }
    void legacyAsset;
  }
  for (const [sourceKey, targetAsset] of targetAssets) {
    const legacyAsset = legacyAssets.get(sourceKey);
    if (legacyAsset && stableJson(legacyAsset) === stableJson(targetAsset)) {
      continue;
    }
    if (!mutationBackedPaths.has(targetAsset.storage_path)) {
      throw new Error(
        `Released content revision v2 refused: asset ${sourceKey} was ${legacyAsset ? "changed in" : "added to"} the target manifest without a download mutation binding it. This mechanism only applies content-block mutations; an untied asset change would be recorded as part of the active manifest without actually being applied.`,
      );
    }
  }
}

function exactContent(operation: ImportOperation, sourceKey: string) {
  const content = operation.row.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error(`Released content revision v2 ${sourceKey} has invalid block content.`);
  }
  return content as Record<string, unknown>;
}

function downloadAssetBinding(
  operation: ImportOperation,
  sourceKey: string,
): { replacement_sha256: string | null; replacement_size_bytes: number | null } {
  if (operation.row.block_type !== "download") {
    return { replacement_sha256: null, replacement_size_bytes: null };
  }
  const content = exactContent(operation, sourceKey);
  const filePath = content.file_path;
  const sizeBytes = content.size_bytes;
  const match = typeof filePath === "string"
    ? /\.([0-9a-f]{64})\.[a-z0-9]{1,16}$/.exec(filePath)
    : null;
  if (!match || !Number.isInteger(sizeBytes) || Number(sizeBytes) < 1) {
    throw new Error(
      `Released content revision v2 ${sourceKey} is a download block without an immutable, content-addressed asset binding.`,
    );
  }
  return { replacement_sha256: match[1], replacement_size_bytes: Number(sizeBytes) };
}

function insertMutation(target: ImportOperation, sourceKey: string): ReleasedContentBlockRevisionV2Mutation {
  return {
    action: "insert",
    source_key: sourceKey,
    block_id: target.id,
    lesson_id: String(target.row.lesson_id),
    block_type: String(target.row.block_type),
    expected_content: null,
    replacement_content: exactContent(target, sourceKey),
    sort_order: Number(target.row.sort_order),
    is_required_for_completion: Boolean(target.row.is_required_for_completion),
    replacement_sha256: null,
    replacement_size_bytes: null,
  };
}

function updateMutation(
  legacy: ImportOperation,
  target: ImportOperation,
  sourceKey: string,
): ReleasedContentBlockRevisionV2Mutation {
  if (legacy.id !== target.id || legacy.row.lesson_id !== target.row.lesson_id) {
    throw new Error(
      `Released content revision v2 ${sourceKey} changed identity or lesson ownership; this mechanism does not support reparenting a released block.`,
    );
  }
  if (legacy.row.block_type !== target.row.block_type) {
    throw new Error(
      `Released content revision v2 ${sourceKey} changed block_type; this mechanism does not support retyping a released block.`,
    );
  }
  const binding = downloadAssetBinding(target, sourceKey);
  return {
    action: "update",
    source_key: sourceKey,
    block_id: target.id,
    lesson_id: String(target.row.lesson_id),
    block_type: String(target.row.block_type),
    expected_content: exactContent(legacy, sourceKey),
    replacement_content: exactContent(target, sourceKey),
    sort_order: Number(target.row.sort_order),
    is_required_for_completion: Boolean(target.row.is_required_for_completion),
    replacement_sha256: binding.replacement_sha256,
    replacement_size_bytes: binding.replacement_size_bytes,
  };
}

/**
 * Includes lesson_id and block_type, not just content/sort_order/required --
 * a block reparented to a different lesson or retyped while its content,
 * sort_order, and required flag happen to stay byte-identical must still be
 * treated as changed, so it reaches updateMutation's own reparenting/
 * retyping refusal instead of being silently skipped as a no-op.
 */
function blockRowIdentity(operation: ImportOperation) {
  return JSON.stringify({
    lesson_id: operation.row.lesson_id,
    block_type: operation.row.block_type,
    content: operation.row.content,
    sort_order: operation.row.sort_order,
    is_required_for_completion: operation.row.is_required_for_completion,
  });
}

/**
 * Diffs every content_blocks row between a legacy (currently-released) and
 * target manifest for the same import_id. Returns one mutation per block
 * whose content, sort_order, or is_required_for_completion changed, plus one
 * insert mutation per block that exists only in the target manifest.
 *
 * Refuses (rather than silently ignoring) a block that disappears between
 * legacy and target -- removing a previously-released block is out of scope
 * for this mechanism -- and refuses a no-op diff, since an empty mutation set
 * is never a legitimate revision.
 */
export function buildReleasedContentBlockRevisionV2(input: {
  importId: string;
  legacyManifest: Uint8Array;
  targetManifest: Uint8Array;
}): ReleasedContentBlockRevisionV2 {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input.importId)) {
    throw new Error("Released content revision v2 refused: invalid import_id.");
  }
  const legacyManifest = parseManifest(input.legacyManifest, input.importId, "legacy");
  const targetManifest = validatedTargetManifest(input.targetManifest, input.importId);

  const legacyPlan = buildImportPlan(legacyManifest);
  const targetPlan = buildImportPlan(targetManifest);
  if (legacyPlan.importId !== input.importId || targetPlan.importId !== input.importId) {
    throw new Error("Released content revision v2 plans have the wrong import identity.");
  }
  assertNoOutOfScopeManifestDrift(legacyPlan, targetPlan);

  const legacyBlocks = contentBlocks(legacyPlan);
  const targetBlocks = contentBlocks(targetPlan);

  for (const sourceKey of legacyBlocks.keys()) {
    if (!targetBlocks.has(sourceKey)) {
      throw new Error(
        `Released content revision v2 refused: ${sourceKey} exists in the legacy manifest but not the target manifest. This mechanism does not support removing a previously-released block.`,
      );
    }
  }

  const mutations: ReleasedContentBlockRevisionV2Mutation[] = [];
  for (const [sourceKey, target] of targetBlocks) {
    const legacy = legacyBlocks.get(sourceKey);
    if (!legacy) {
      mutations.push(insertMutation(target, sourceKey));
      continue;
    }
    if (blockRowIdentity(legacy) === blockRowIdentity(target)) {
      continue;
    }
    mutations.push(updateMutation(legacy, target, sourceKey));
  }

  if (mutations.length === 0) {
    throw new Error(
      "Released content revision v2 refused: no drift was found between the legacy and target manifests.",
    );
  }
  assertNoOutOfScopeAssetDrift(legacyPlan, targetPlan, mutations);

  const updateCount = mutations.filter((mutation) => mutation.action === "update").length;
  const insertCount = mutations.filter((mutation) => mutation.action === "insert").length;
  return {
    import_id: input.importId,
    mutations,
    summary: {
      mutation_count: mutations.length,
      update_count: updateCount,
      insert_count: insertCount,
    },
  };
}

export function releasedContentBlockRevisionV2ClientPayloadSha256(
  mutations: ReleasedContentBlockRevisionV2Mutation[],
) {
  return sha256(JSON.stringify(mutations));
}

/** Mirrors PostgreSQL's jsonb::text canonicalization (key order by UTF-8 byte
 * length then byte value, ": " / ", " separators) so the client can verify
 * its own payload hash will match what the database independently computes,
 * catching a JS-vs-Postgres canonicalization drift before it reaches a
 * confirmation-string mismatch at the RPC boundary. */
export function releasedContentBlockRevisionV2DatabasePayloadSha256(
  mutations: ReleasedContentBlockRevisionV2Mutation[],
) {
  return sha256(postgresJsonbText(mutations));
}

function postgresJsonbText(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) =>
        left.length - right.length || Buffer.compare(Buffer.from(left), Buffer.from(right))
      );
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}: ${postgresJsonbText(item)}`
    ).join(", ")}}`;
  }
  throw new Error("Released content revision v2 payload contains a non-JSON value.");
}

/**
 * Bound to databasePayloadSha256 -- the PostgreSQL-canonical digest
 * (releasedContentBlockRevisionV2DatabasePayloadSha256) fn_revise_released_content_blocks_v2
 * computes itself from the mutation payload -- not a caller-supplied
 * "client" hash. An operator's approved confirmation string is therefore
 * cryptographically tied to the exact bytes the database will apply; a
 * stale or buggy caller cannot get a different payload accepted under a
 * confirmation that was reviewed for this one.
 */
export function releasedContentBlockRevisionV2Confirmation(input: {
  importId: string;
  expectedPriorManifestSha256: string;
  manifestSha256: string;
  expectedPriorCatalogSha256: string;
  databasePayloadSha256: string;
  mutationCount: number;
}) {
  return [
    "REVISE-RELEASED-CONTENT-BLOCKS-V2",
    input.importId,
    input.expectedPriorManifestSha256,
    input.manifestSha256,
    input.expectedPriorCatalogSha256,
    input.databasePayloadSha256,
    String(input.mutationCount),
  ].join(":");
}

export function releasedContentBlockRevisionV2RollbackConfirmation(input: {
  importId: string;
  expectedRevision: number;
  manifestSha256: string;
  priorManifestSha256: string;
  rollbackSha256: string;
}) {
  return [
    "ROLLBACK-RELEASED-CONTENT-BLOCKS-V2",
    input.importId,
    String(input.expectedRevision),
    input.manifestSha256,
    input.priorManifestSha256,
    input.rollbackSha256,
  ].join(":");
}

export function matchesReleasedContentBlockRevisionV2Mutation(
  row: ReleasedContentBlockRevisionV2Row,
  mutation: ReleasedContentBlockRevisionV2Mutation,
  state: "expected" | "replacement",
) {
  const content = state === "expected" ? mutation.expected_content : mutation.replacement_content;
  return (
    row.lesson_id === mutation.lesson_id &&
    row.block_type === mutation.block_type &&
    postgresJsonbText(row.content) === postgresJsonbText(content) &&
    row.sort_order === mutation.sort_order &&
    row.is_required_for_completion === mutation.is_required_for_completion
  );
}

export function assertReleasedContentBlockRevisionV2InitialOrRevisedState(
  rows: ReleasedContentBlockRevisionV2Row[],
  mutations: ReleasedContentBlockRevisionV2Mutation[],
) {
  try {
    assertReleasedContentBlockRevisionV2RevisedState(rows, mutations);
    return "already_revised" as const;
  } catch {
    // The only other accepted state is the exact all-prior state.
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const mutation of mutations) {
    const row = byId.get(mutation.block_id);
    if (mutation.action === "insert") {
      if (row) {
        throw new Error(
          `Released content revision v2 found a partially inserted target: ${mutation.source_key}.`,
        );
      }
      continue;
    }
    if (!row || !matchesReleasedContentBlockRevisionV2Mutation(row, mutation, "expected")) {
      throw new Error(
        `Released content revision v2 found target drift before execution: ${mutation.source_key}.`,
      );
    }
  }
  return "initial" as const;
}

export function assertReleasedContentBlockRevisionV2RevisedState(
  rows: ReleasedContentBlockRevisionV2Row[],
  mutations: ReleasedContentBlockRevisionV2Mutation[],
) {
  if (rows.length !== mutations.length) {
    throw new Error(
      `Released content revision v2 expected ${mutations.length} target rows after apply, found ${rows.length}.`,
    );
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const mutation of mutations) {
    const row = byId.get(mutation.block_id);
    if (!row || !matchesReleasedContentBlockRevisionV2Mutation(row, mutation, "replacement")) {
      throw new Error(
        `Released content revision v2 target verification failed: ${mutation.source_key}.`,
      );
    }
  }
}
