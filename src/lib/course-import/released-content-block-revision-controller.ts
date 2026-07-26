import { resolve } from "node:path";

import type { CourseImportAsset } from "./manifest";
import type { RemoteAssetProblem } from "./asset-transfer";
import {
  RELEASED_CONTENT_BLOCK_REVISION,
  assertReleasedContentBlockInitialOrRevisedState,
  assertReleasedContentBlockRevisedState,
  selectReleasedContentBlockRevisionGuideAssets,
  type ReleasedContentBlockMutation,
  type ReleasedContentBlockRow,
} from "./released-content-block-revision";
import {
  buildReleasedContentBlockRevisionAssetReceiptExpectation,
  releasedContentBlockRevisionAssetReceiptPath,
  type CompletedReleasedContentBlockRevisionAssetReceipt,
  type ReleasedContentBlockRevisionAssetReceiptExpectation,
} from "./released-content-block-revision-receipt";
import {
  type CourseImportEnvironment,
} from "./upload-receipt";

export type ReleasedContentBlockRevisionCommandOptions = {
  execute: boolean;
  allowProduction: boolean;
  confirmation: string | undefined;
  stateRoot: string;
};

export type ReleasedContentBlockRevisionCliOptions =
  ReleasedContentBlockRevisionCommandOptions & {
    mode: "prepare-assets" | "apply";
    manifestPath: string;
    sourceRoot: string;
  };

export function parseReleasedContentBlockRevisionCliOptions(
  args: string[],
  options: {
    cwd: string;
    defaultManifest: string;
  },
): ReleasedContentBlockRevisionCliOptions {
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const mode =
    positional[0] === "prepare-assets" || positional[0] === "apply"
      ? positional.shift() as "prepare-assets" | "apply"
      : "apply";
  if (positional.length > 1) {
    throw new Error(
      "Released content revision accepts one mode and one manifest path.",
    );
  }
  return {
    mode,
    manifestPath: positional[0] ?? options.defaultManifest,
    execute: args.includes("--execute"),
    allowProduction: args.includes("--allow-production"),
    confirmation: cliValue(args, "--confirm="),
    stateRoot: resolve(
      options.cwd,
      cliValue(args, "--state-root=") ??
        ".course-import-state",
    ),
    sourceRoot: resolve(
      options.cwd,
      cliValue(args, "--source-root=") ?? ".",
    ),
  };
}

export type ReleasedContentBlockRevisionCommandInput = {
  options: ReleasedContentBlockRevisionCommandOptions;
  targetManifest: Buffer;
  guideAssets: CourseImportAsset[];
  mutations: ReleasedContentBlockMutation[];
  clientPayloadSha256: string;
  databasePayloadSha256: string;
  expectedConfirmation: string;
  environment: {
    url: string | undefined;
    serviceRoleKey: string | undefined;
  };
  plan: Record<string, unknown>;
};

type ActiveRelease = {
  import_id: string;
  active_revision: number | string;
  active_manifest_sha256: string;
  active_catalog_sha256: string;
};

export type ReleasedContentBlockRevisionAudit = {
  import_id: string;
  manifest_sha256: string;
  prior_catalog_sha256: string;
  replacement_catalog_sha256: string;
  database_payload_sha256: string;
  client_payload_sha256: string;
  guide_update_count: number;
  flashcard_update_count: number;
  role_play_insert_count: number;
  evidence: unknown;
};

export type ReleasedContentBlockRevisionRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

export type ReleasedContentBlockRevisionDependencies<Client> = {
  classifyEnvironment: (
    url: string,
    allowProduction: boolean,
  ) => CourseImportEnvironment;
  loadUploadReceipt: (
    path: string,
    expectation: ReleasedContentBlockRevisionAssetReceiptExpectation,
  ) => Promise<CompletedReleasedContentBlockRevisionAssetReceipt>;
  createClient: (url: string, serviceRoleKey: string) => Client;
  verifyGuideAssets: (
    client: Client,
    guideAssets: CourseImportAsset[],
  ) => Promise<RemoteAssetProblem[]>;
  loadActiveRelease: (client: Client) => Promise<ActiveRelease>;
  loadCatalogSha256: (client: Client) => Promise<string>;
  loadAudit: (
    client: Client,
  ) => Promise<ReleasedContentBlockRevisionAudit | null>;
  loadMutationRows: (
    client: Client,
    mutations: ReleasedContentBlockMutation[],
  ) => Promise<ReleasedContentBlockRow[]>;
  callRevision: (
    client: Client,
    args: Record<string, unknown>,
  ) => Promise<ReleasedContentBlockRevisionRpcResult>;
  log: (value: string) => void;
};

export type ReleasedContentBlockRevisionAssetPreparationInput = {
  options: ReleasedContentBlockRevisionCommandOptions;
  targetManifest: Buffer;
  guideAssets: CourseImportAsset[];
  mutations: ReleasedContentBlockMutation[];
  clientPayloadSha256: string;
  expectedConfirmation: string;
  sourceRoot: string;
  environment: {
    url: string | undefined;
    serviceRoleKey: string | undefined;
  };
  plan: Record<string, unknown>;
};

export type ReleasedContentBlockRevisionAssetPreparationDependencies<Client> = {
  classifyEnvironment: (
    url: string,
    allowProduction: boolean,
  ) => CourseImportEnvironment;
  createClient: (url: string, serviceRoleKey: string) => Client;
  invalidateReceipt: (path: string) => Promise<void>;
  uploadGuideAssets: (
    client: Client,
    input: {
      endpoint: string;
      serviceRoleKey: string;
      importId: string;
      sourceRoot: string;
      assets: CourseImportAsset[];
      stateRoot: string;
    },
  ) => Promise<void>;
  verifyGuideAssets: (
    client: Client,
    guideAssets: CourseImportAsset[],
  ) => Promise<RemoteAssetProblem[]>;
  writeReceipt: (
    path: string,
    expectation: ReleasedContentBlockRevisionAssetReceiptExpectation,
  ) => Promise<CompletedReleasedContentBlockRevisionAssetReceipt>;
  log: (value: string) => void;
};

type ValidatedRpcResult = {
  status: "revised" | "already_revised";
  mutation_count: 44;
  catalog_sha256: string;
};

export async function runReleasedContentBlockRevisionCommand<Client>(
  input: ReleasedContentBlockRevisionCommandInput,
  dependencies: ReleasedContentBlockRevisionDependencies<Client>,
) {
  const guideAssets = selectReleasedContentBlockRevisionGuideAssets(
    input.guideAssets,
    input.mutations,
  );
  assertOnlyExactGuideAssets(input.guideAssets, guideAssets);
  dependencies.log(JSON.stringify(input.plan, null, 2));
  if (!input.options.execute) {
    dependencies.log(
      "Dry run only. No database connection or write was attempted.",
    );
    return { status: "dry_run" as const };
  }
  if (input.options.confirmation !== input.expectedConfirmation) {
    throw new Error(
      `Execution confirmation must equal: ${input.expectedConfirmation}`,
    );
  }

  const url = requiredValue(
    input.environment.url,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const serviceRoleKey = requiredValue(
    input.environment.serviceRoleKey,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const environment = dependencies.classifyEnvironment(
    url,
    input.options.allowProduction,
  );
  const receiptExpectation =
    buildReleasedContentBlockRevisionAssetReceiptExpectation({
    targetManifest: input.targetManifest,
    importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
    clientPayloadSha256: input.clientPayloadSha256,
    environment,
    environmentUrl: url,
    guideAssets,
    mutations: input.mutations,
  });
  const receipt = await dependencies.loadUploadReceipt(
    releasedContentBlockRevisionAssetReceiptPath(
      resolve(input.options.stateRoot),
      receiptExpectation,
    ),
    receiptExpectation,
  );

  const client = dependencies.createClient(url, serviceRoleKey);
  assertNoRemoteAssetProblems(
    await dependencies.verifyGuideAssets(client, guideAssets),
  );
  await assertExactLiveReleaseLineage(
    client,
    input,
    receipt,
    dependencies,
  );
  const beforeRows = await dependencies.loadMutationRows(
    client,
    input.mutations,
  );
  const priorState = assertReleasedContentBlockInitialOrRevisedState(
    beforeRows,
    input.mutations,
  );

  const result = await dependencies.callRevision(client, {
    p_import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
    p_expected_active_manifest_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256,
    p_manifest_sha256: RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    p_expected_catalog_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
    p_mutations: input.mutations,
    p_client_payload_sha256: input.clientPayloadSha256,
    p_evidence: expectedEvidence(input, receipt),
    p_confirmation: input.expectedConfirmation,
  });
  if (result.error) {
    throw new Error(
      `Released content block revision failed: ${result.error.message}`,
    );
  }
  const rpc = assertRevisionRpcResult(result.data);

  const afterRows = await dependencies.loadMutationRows(
    client,
    input.mutations,
  );
  assertReleasedContentBlockRevisedState(afterRows, input.mutations);
  const catalogSha256 = await dependencies.loadCatalogSha256(client);
  if (catalogSha256 !== rpc.catalog_sha256) {
    throw new Error(
      "Released content revision postflight catalog does not match the atomic RPC receipt.",
    );
  }
  const audit = await dependencies.loadAudit(client);
  assertRevisionAudit(audit, input, receipt, catalogSha256);

  dependencies.log(JSON.stringify({
    phase: "released_content_blocks_revised",
    environment,
    prior_state: priorState,
    mutation_count: 44,
    catalog_sha256: catalogSha256,
    result: rpc,
  }, null, 2));
  return {
    status: rpc.status,
    environment,
    priorState,
    catalogSha256,
  };
}

export async function runReleasedContentBlockRevisionAssetPreparation<Client>(
  input: ReleasedContentBlockRevisionAssetPreparationInput,
  dependencies:
    ReleasedContentBlockRevisionAssetPreparationDependencies<Client>,
) {
  const guideAssets = selectReleasedContentBlockRevisionGuideAssets(
    input.guideAssets,
    input.mutations,
  );
  assertOnlyExactGuideAssets(input.guideAssets, guideAssets);
  dependencies.log(JSON.stringify(input.plan, null, 2));
  if (!input.options.execute) {
    dependencies.log(
      "Dry run only. No database connection, storage request, or write was attempted.",
    );
    return { status: "dry_run" as const };
  }
  if (input.options.confirmation !== input.expectedConfirmation) {
    throw new Error(
      `Execution confirmation must equal: ${input.expectedConfirmation}`,
    );
  }

  const url = requiredValue(
    input.environment.url,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const serviceRoleKey = requiredValue(
    input.environment.serviceRoleKey,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const environment = dependencies.classifyEnvironment(
    url,
    input.options.allowProduction,
  );
  const receiptExpectation =
    buildReleasedContentBlockRevisionAssetReceiptExpectation({
      targetManifest: input.targetManifest,
      importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
      clientPayloadSha256: input.clientPayloadSha256,
      environment,
      environmentUrl: url,
      guideAssets,
      mutations: input.mutations,
    });
  const receiptPath = releasedContentBlockRevisionAssetReceiptPath(
    resolve(input.options.stateRoot),
    receiptExpectation,
  );
  const client = dependencies.createClient(url, serviceRoleKey);
  await dependencies.invalidateReceipt(receiptPath);
  await dependencies.uploadGuideAssets(client, {
    endpoint: url,
    serviceRoleKey,
    importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
    sourceRoot: input.sourceRoot,
    assets: guideAssets,
    stateRoot: input.options.stateRoot,
  });
  assertNoRemoteAssetProblems(
    await dependencies.verifyGuideAssets(client, guideAssets),
  );
  const receipt = await dependencies.writeReceipt(
    receiptPath,
    receiptExpectation,
  );

  dependencies.log(JSON.stringify({
    phase: "released_content_block_revision_assets_prepared",
    environment,
    approved_asset_count: receipt.approved_asset_count,
    approved_assets_sha256: receipt.approved_assets_sha256,
    receipt_sha256: receipt.receipt_sha256,
    receipt_path: receiptPath,
  }, null, 2));
  return {
    status: "prepared" as const,
    environment,
    approvedAssetCount: receipt.approved_asset_count,
    receiptPath,
    receiptSha256: receipt.receipt_sha256,
  };
}

async function assertExactLiveReleaseLineage<Client>(
  client: Client,
  input: ReleasedContentBlockRevisionCommandInput,
  receipt: CompletedReleasedContentBlockRevisionAssetReceipt,
  dependencies: ReleasedContentBlockRevisionDependencies<Client>,
) {
  const active = await dependencies.loadActiveRelease(client);
  if (active.import_id !== RELEASED_CONTENT_BLOCK_REVISION.importId) {
    throw new Error(
      "Released content revision active-release import identity drifted.",
    );
  }
  if (Number(active.active_revision) !== 2) {
    throw new Error(
      "Released content revision active-release revision drifted from revision 2.",
    );
  }
  if (
    active.active_manifest_sha256 !==
    RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256
  ) {
    throw new Error(
      "Released content revision active-release manifest checksum drifted.",
    );
  }
  if (
    active.active_catalog_sha256 !==
    RELEASED_CONTENT_BLOCK_REVISION.expectedActiveCatalogSha256
  ) {
    throw new Error(
      "Released content revision active-release catalog checksum drifted.",
    );
  }

  const catalogSha256 = await dependencies.loadCatalogSha256(client);
  if (
    catalogSha256 ===
    RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256
  ) {
    return;
  }
  const audit = await dependencies.loadAudit(client);
  assertRevisionAudit(audit, input, receipt, catalogSha256);
}

function assertRevisionRpcResult(value: unknown): ValidatedRpcResult {
  const result = requiredRecord(
    value,
    "Released content revision RPC returned a malformed success receipt.",
  );
  const status = requiredRevisionStatus(result.status);
  assertExactValue(
    result.mutation_count,
    44,
    "Released content revision RPC returned the wrong mutation count.",
  );
  const catalogSha256 = requiredSha256(
    result.catalog_sha256,
    "Released content revision RPC returned an invalid catalog checksum.",
  );
  if (
    "import_id" in result &&
    result.import_id !== RELEASED_CONTENT_BLOCK_REVISION.importId
  ) {
    throw new Error(
      "Released content revision RPC returned the wrong import identity.",
    );
  }
  if (status === "revised") {
    assertExactRecord({
      guide_update_count: result.guide_update_count,
      flashcard_update_count: result.flashcard_update_count,
      role_play_insert_count: result.role_play_insert_count,
    }, {
      guide_update_count: 19,
      flashcard_update_count: 19,
      role_play_insert_count: 6,
    }, "Released content revision RPC returned the wrong mutation breakdown.");
  }
  return {
    status,
    mutation_count: 44,
    catalog_sha256: catalogSha256,
  };
}

function assertRevisionAudit(
  audit: ReleasedContentBlockRevisionAudit | null,
  input: ReleasedContentBlockRevisionCommandInput,
  receipt: CompletedReleasedContentBlockRevisionAssetReceipt,
  catalogSha256: string,
) {
  if (!audit) {
    throw new Error(
      "Released content revision audit receipt is missing.",
    );
  }
  const evidence = expectedEvidence(input, receipt);
  assertExactRecord({
    import_id: audit.import_id,
    manifest_sha256: audit.manifest_sha256,
    prior_catalog_sha256: audit.prior_catalog_sha256,
    replacement_catalog_sha256: audit.replacement_catalog_sha256,
    database_payload_sha256: audit.database_payload_sha256,
    client_payload_sha256: audit.client_payload_sha256,
    guide_update_count: audit.guide_update_count,
    flashcard_update_count: audit.flashcard_update_count,
    role_play_insert_count: audit.role_play_insert_count,
    evidence: audit.evidence,
  }, {
    import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
    manifest_sha256: RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    prior_catalog_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
    replacement_catalog_sha256: catalogSha256,
    database_payload_sha256: input.databasePayloadSha256,
    client_payload_sha256: input.clientPayloadSha256,
    guide_update_count: 19,
    flashcard_update_count: 19,
    role_play_insert_count: 6,
    evidence,
  }, "Released content revision audit receipt does not match the exact approved operation.");
}

function expectedEvidence(
  input: ReleasedContentBlockRevisionCommandInput,
  receipt: CompletedReleasedContentBlockRevisionAssetReceipt,
) {
  return {
    operation: "released_content_blocks_v1",
    original_release_manifest_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.originalReleaseManifestSha256,
    expected_active_manifest_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256,
    manifest_sha256: RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    expected_prior_catalog_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
    client_payload_sha256: input.clientPayloadSha256,
    upload_receipt_sha256: receipt.receipt_sha256,
  };
}

function assertNoRemoteAssetProblems(problems: RemoteAssetProblem[]) {
  if (problems.length === 0) return;
  throw new Error(
    `Released content revision guide verification failed: ${problems
      .map((problem) => `${problem.path}: ${problem.problem}`)
      .join("; ")}`,
  );
}

function assertOnlyExactGuideAssets(
  supplied: CourseImportAsset[],
  exact: CourseImportAsset[],
) {
  if (supplied.length !== exact.length) {
    throw new Error(
      "Released content revision accepts only the exact 19 guide assets.",
    );
  }
}

function requiredValue(value: string | undefined, name: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} must be set and non-empty.`);
  }
  return value;
}

function requiredRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function requiredRevisionStatus(
  value: unknown,
): "revised" | "already_revised" {
  if (value !== "revised" && value !== "already_revised") {
    throw new Error(
      "Released content revision RPC returned an unsupported status.",
    );
  }
  return value;
}

function requiredSha256(value: unknown, message: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(message);
  }
  return value;
}

function assertExactValue(
  actual: unknown,
  expected: unknown,
  message: string,
) {
  if (actual !== expected) throw new Error(message);
}

function assertExactRecord(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  message: string,
) {
  if (stableJson(actual) !== stableJson(expected)) throw new Error(message);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function cliValue(args: string[], prefix: string) {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
