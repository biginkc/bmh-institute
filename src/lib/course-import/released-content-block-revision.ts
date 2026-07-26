import { createHash } from "node:crypto";

import type {
  CourseImportAsset,
  CourseImportManifest,
} from "./manifest";
import { validateCourseManifest } from "./manifest";
import { buildImportPlan, type ImportOperation, type ImportPlan } from "./operations";

export const RELEASED_CONTENT_BLOCK_REVISION = {
  importId: "bmh-employee-training-v1",
  originalReleaseManifestSha256: "71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c",
  expectedActiveManifestSha256: "440ec4d85bc6dc0aec9d471fb0f5ecbe0ca8c17236b3012e8b036b8d045a154d",
  expectedActiveCatalogSha256: "ca42e3d6347a71f46bd1aabee6c7b5c9fc570e797473865ceee30d4fe2a36ae0",
  targetManifestSha256: "585b72c923a560d2228f6149a5b906ec02958f19d62818dc5c109c3968345a33",
  expectedPriorCatalogSha256: "e66250effa99bda93e8dd828077811585a5369e2e142bfa9bc5381f5ccd94eb4",
  expectedClientPayloadSha256: "81d918fd621bb82da935a81f06a08196ce27b2cb853fafcf0f8a2df88de8201b",
} as const;

const GUIDE_SOURCE_KEYS = Array.from(
  { length: 19 },
  (_, index) => `block-guide-pdf-slot-${String(index + 1).padStart(2, "0")}`,
);
const FLASHCARD_SOURCE_KEYS = Array.from(
  { length: 19 },
  (_, index) => `block-flashcards-slot-${String(index + 1).padStart(2, "0")}`,
);
const ROLE_PLAY_SOURCE_KEYS = [
  "block-role-play-guarded-inbound",
  "block-role-play-tired-landlord",
  "block-role-play-scam-suspicious-preforeclosure",
  "block-role-play-probate-follow-up",
  "block-role-play-family-dynamics-dayton",
  "block-role-play-full-cycle-capstone",
] as const;

export type ReleasedContentBlockMutation = {
  action: "update" | "insert";
  source_key: string;
  block_id: string;
  lesson_id: string;
  block_type: "download" | "flashcard" | "role_play";
  expected_content: Record<string, unknown> | null;
  replacement_content: Record<string, unknown>;
  sort_order: number;
  is_required_for_completion: boolean;
  replacement_sha256: string | null;
  replacement_size_bytes: number | null;
};

export type ReleasedContentBlockRevision = {
  mutations: ReleasedContentBlockMutation[];
  summary: {
    guide_updates: 19;
    flashcard_updates: 19;
    role_play_inserts: 6;
  };
};

export type ReleasedContentBlockRow = {
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

function parseLegacyManifest(bytes: Uint8Array) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Released content revision legacy manifest is not valid JSON.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as Record<string, unknown>).import_id !== RELEASED_CONTENT_BLOCK_REVISION.importId
  ) {
    throw new Error("Released content revision legacy manifest has the wrong import identity.");
  }
  return parsed as CourseImportManifest;
}

function parseTargetManifest(bytes: Uint8Array) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error("Released content revision target manifest is not valid JSON.");
  }
  const validation = validateCourseManifest(parsed, { gate: "release" });
  if (!validation.ok) {
    throw new Error(`Released content revision target manifest is invalid:\n${validation.errors.join("\n")}`);
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

function requiredBlock(
  blocks: Map<string, ImportOperation>,
  sourceKey: string,
  label: "legacy" | "target",
) {
  const block = blocks.get(sourceKey);
  if (!block) {
    throw new Error(`Released content revision ${label} manifest is missing ${sourceKey}.`);
  }
  return block;
}

function assertStableBlockPlacement(
  legacy: ImportOperation,
  target: ImportOperation,
  sourceKey: string,
) {
  for (const field of [
    "id",
    "lesson_id",
    "block_type",
    "sort_order",
    "is_required_for_completion",
  ]) {
    if (legacy.row[field] !== target.row[field]) {
      throw new Error(`Released content revision changed ${sourceKey}.${field} outside the approved content delta.`);
    }
  }
}

function exactContent(operation: ImportOperation, sourceKey: string) {
  const content = operation.row.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error(`Released content revision ${sourceKey} has invalid block content.`);
  }
  return content as Record<string, unknown>;
}

function updateMutation(
  legacy: ImportOperation,
  target: ImportOperation,
  sourceKey: string,
  blockType: "download" | "flashcard",
): ReleasedContentBlockMutation {
  assertStableBlockPlacement(legacy, target, sourceKey);
  if (target.row.block_type !== blockType) {
    throw new Error(`Released content revision ${sourceKey} must remain ${blockType}.`);
  }
  const expectedContent = exactContent(legacy, sourceKey);
  const replacementContent = exactContent(target, sourceKey);
  if (JSON.stringify(expectedContent) === JSON.stringify(replacementContent)) {
    throw new Error(`Released content revision ${sourceKey} does not contain an approved content change.`);
  }

  let replacementSha256: string | null = null;
  let replacementSizeBytes: number | null = null;
  if (blockType === "download") {
    const filePath = replacementContent.file_path;
    const sizeBytes = replacementContent.size_bytes;
    const match = typeof filePath === "string"
      ? /^courses\/bmh-employee-training\/v1\/guides\/guide-slot-\d{2}\.([0-9a-f]{64})\.pdf$/.exec(filePath)
      : null;
    if (!match || !Number.isInteger(sizeBytes) || Number(sizeBytes) < 1) {
      throw new Error(`Released content revision ${sourceKey} lacks an immutable guide asset binding.`);
    }
    replacementSha256 = match[1];
    replacementSizeBytes = Number(sizeBytes);
  }

  return {
    action: "update",
    source_key: sourceKey,
    block_id: target.id,
    lesson_id: String(target.row.lesson_id),
    block_type: blockType,
    expected_content: expectedContent,
    replacement_content: replacementContent,
    sort_order: Number(target.row.sort_order),
    is_required_for_completion: Boolean(target.row.is_required_for_completion),
    replacement_sha256: replacementSha256,
    replacement_size_bytes: replacementSizeBytes,
  };
}

function insertMutation(
  legacyBlocks: Map<string, ImportOperation>,
  target: ImportOperation,
  sourceKey: string,
): ReleasedContentBlockMutation {
  if (legacyBlocks.has(sourceKey)) {
    throw new Error(`Released content revision ${sourceKey} unexpectedly exists in the original release.`);
  }
  if (target.row.block_type !== "role_play") {
    throw new Error(`Released content revision ${sourceKey} must be a role_play block.`);
  }
  return {
    action: "insert",
    source_key: sourceKey,
    block_id: target.id,
    lesson_id: String(target.row.lesson_id),
    block_type: "role_play",
    expected_content: null,
    replacement_content: exactContent(target, sourceKey),
    sort_order: Number(target.row.sort_order),
    is_required_for_completion: Boolean(target.row.is_required_for_completion),
    replacement_sha256: null,
    replacement_size_bytes: null,
  };
}

export function buildReleasedContentBlockRevision(input: {
  legacyManifest: Uint8Array;
  targetManifest: Uint8Array;
}): ReleasedContentBlockRevision {
  const legacySha256 = sha256(input.legacyManifest);
  if (legacySha256 !== RELEASED_CONTENT_BLOCK_REVISION.originalReleaseManifestSha256) {
    throw new Error(`Released content revision legacy manifest checksum mismatch: ${legacySha256}.`);
  }
  const targetSha256 = sha256(input.targetManifest);
  if (targetSha256 !== RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256) {
    throw new Error(`Released content revision target manifest checksum mismatch: ${targetSha256}.`);
  }

  const legacyPlan = buildImportPlan(parseLegacyManifest(input.legacyManifest));
  const targetPlan = buildImportPlan(parseTargetManifest(input.targetManifest));
  if (
    legacyPlan.importId !== RELEASED_CONTENT_BLOCK_REVISION.importId ||
    targetPlan.importId !== RELEASED_CONTENT_BLOCK_REVISION.importId
  ) {
    throw new Error("Released content revision plans have the wrong import identity.");
  }
  const legacyBlocks = contentBlocks(legacyPlan);
  const targetBlocks = contentBlocks(targetPlan);
  const mutations: ReleasedContentBlockMutation[] = [];

  for (const sourceKey of GUIDE_SOURCE_KEYS) {
    mutations.push(updateMutation(
      requiredBlock(legacyBlocks, sourceKey, "legacy"),
      requiredBlock(targetBlocks, sourceKey, "target"),
      sourceKey,
      "download",
    ));
  }
  for (const sourceKey of FLASHCARD_SOURCE_KEYS) {
    mutations.push(updateMutation(
      requiredBlock(legacyBlocks, sourceKey, "legacy"),
      requiredBlock(targetBlocks, sourceKey, "target"),
      sourceKey,
      "flashcard",
    ));
  }
  for (const sourceKey of ROLE_PLAY_SOURCE_KEYS) {
    mutations.push(insertMutation(
      legacyBlocks,
      requiredBlock(targetBlocks, sourceKey, "target"),
      sourceKey,
    ));
  }

  return {
    mutations,
    summary: {
      guide_updates: 19,
      flashcard_updates: 19,
      role_play_inserts: 6,
    },
  };
}

export function releasedContentBlockRevisionPayloadSha256(
  mutations: ReleasedContentBlockMutation[],
) {
  return sha256(JSON.stringify(mutations));
}

export function selectReleasedContentBlockRevisionGuideAssets(
  assets: CourseImportAsset[],
  mutations: ReleasedContentBlockMutation[],
) {
  const guideMutations = mutations.filter((mutation) =>
    mutation.action === "update" &&
    mutation.block_type === "download"
  );
  if (guideMutations.length !== 19) {
    throw new Error(
      "Released content revision requires exactly 19 guide mutations.",
    );
  }
  const mutationByStoragePath =
    new Map<string, ReleasedContentBlockMutation>();
  for (const mutation of guideMutations) {
    const storagePath = mutation.replacement_content.file_path;
    if (
      typeof storagePath !== "string" ||
      mutationByStoragePath.has(storagePath)
    ) {
      throw new Error(
        "Released content revision guide mutations require 19 unique storage paths.",
      );
    }
    mutationByStoragePath.set(storagePath, mutation);
  }

  const selected = assets.filter((asset) =>
    mutationByStoragePath.has(asset.storage_path)
  );
  if (
    selected.length !== 19 ||
    new Set(selected.map((asset) => asset.source_key)).size !== 19
  ) {
    throw new Error(
      "Released content revision requires the exact 19 guide assets.",
    );
  }
  for (const asset of selected) {
    const mutation = mutationByStoragePath.get(asset.storage_path)!;
    if (
      asset.approval_status !== "approved" ||
      asset.kind !== "pdf" ||
      asset.mime_type !== "application/pdf" ||
      asset.storage_path !== mutation.replacement_content.file_path ||
      asset.size_bytes !== mutation.replacement_size_bytes ||
      asset.checksum_sha256 !== mutation.replacement_sha256
    ) {
      throw new Error(
        `Released content revision asset ${asset.source_key} does not match its exact guide mutation.`,
      );
    }
  }
  return selected.sort((left, right) =>
    left.source_key.localeCompare(right.source_key)
  );
}

export function releasedContentBlockRevisionDatabasePayloadSha256(
  mutations: ReleasedContentBlockMutation[],
) {
  return sha256(postgresJsonbText(mutations));
}

export function matchesReleasedContentBlockMutation(
  row: ReleasedContentBlockRow,
  mutation: ReleasedContentBlockMutation,
  state: "expected" | "replacement",
) {
  const content = state === "expected"
    ? mutation.expected_content
    : mutation.replacement_content;
  return (
    row.lesson_id === mutation.lesson_id &&
    row.block_type === mutation.block_type &&
    postgresJsonbText(row.content) === postgresJsonbText(content) &&
    row.sort_order === mutation.sort_order &&
    row.is_required_for_completion ===
      mutation.is_required_for_completion
  );
}

export function assertReleasedContentBlockInitialOrRevisedState(
  rows: ReleasedContentBlockRow[],
  mutations: ReleasedContentBlockMutation[],
) {
  try {
    assertReleasedContentBlockRevisedState(rows, mutations);
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
          `Released content revision found a partially inserted target: ${mutation.source_key}.`,
        );
      }
      continue;
    }
    if (!row || !matchesReleasedContentBlockMutation(row, mutation, "expected")) {
      throw new Error(
        `Released content revision found target drift before execution: ${mutation.source_key}.`,
      );
    }
  }
  return "initial" as const;
}

export function assertReleasedContentBlockRevisedState(
  rows: ReleasedContentBlockRow[],
  mutations: ReleasedContentBlockMutation[],
) {
  if (rows.length !== 44) {
    throw new Error(
      `Released content revision expected 44 target rows after apply, found ${rows.length}.`,
    );
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const mutation of mutations) {
    const row = byId.get(mutation.block_id);
    if (!row || !matchesReleasedContentBlockMutation(row, mutation, "replacement")) {
      throw new Error(
        `Released content revision target verification failed: ${mutation.source_key}.`,
      );
    }
  }
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
  throw new Error("Released content revision payload contains a non-JSON value.");
}

export function releasedContentBlockRevisionConfirmation(input: {
  expectedCatalogSha256: string;
  payloadSha256: string;
}) {
  return [
    "REVISE-RELEASED-CONTENT-BLOCKS",
    RELEASED_CONTENT_BLOCK_REVISION.importId,
    RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256,
    RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    input.expectedCatalogSha256,
    input.payloadSha256,
    "19",
    "19",
    "6",
  ].join(":");
}
