import {
  assertReleasedContentBlockRevisionV2InitialOrRevisedState,
  assertReleasedContentBlockRevisionV2RevisedState,
  releasedContentBlockRevisionV2Confirmation,
  type ReleasedContentBlockRevisionV2Mutation,
  type ReleasedContentBlockRevisionV2Row,
} from "./released-content-block-revision-v2";
import { type CourseImportEnvironment } from "./upload-receipt";

/**
 * Versioned, reusable successor to released-content-block-revision-controller.ts.
 * That module hardcoded a fixed 44-row mutation count, a fixed 19/19/6
 * breakdown, and literal manifest/catalog checksum constants throughout its
 * assertions. This controller carries none of that: every count and
 * checksum comes from the caller's own preflight and the RPC's own receipt.
 *
 * Scope note: no mutation in the pilot publish this was built for is a
 * `download` block, so this controller does not include the guide-asset
 * upload/verification ceremony released-content-block-revision-receipt.ts
 * built for the one-shot correction. A future publish that needs to replace
 * a guide PDF (or any other storage-backed asset) will need to extend this
 * with an equivalent receipt step before it can safely include a `download`
 * mutation -- the SQL function already verifies the referenced storage
 * object exists (fn_revise_released_content_blocks_v2's download-asset
 * binding check), but nothing here yet uploads or prepares one.
 */

export type ReleasedContentBlockRevisionV2CommandOptions = {
  execute: boolean;
  allowProduction: boolean;
  confirmation: string | undefined;
};

export type ReleasedContentBlockRevisionV2CommandInput = {
  options: ReleasedContentBlockRevisionV2CommandOptions;
  importId: string;
  expectedPriorManifestSha256: string;
  manifestSha256: string;
  mutations: ReleasedContentBlockRevisionV2Mutation[];
  clientPayloadSha256: string;
  uploadReceiptSha256: string;
  environment: {
    url: string | undefined;
    serviceRoleKey: string | undefined;
  };
  plan: Record<string, unknown>;
};

type ActiveRevision = {
  import_id: string;
  active_revision: number | string;
  active_manifest_sha256: string;
  active_catalog_sha256: string;
};

export type ReleasedContentBlockRevisionV2Audit = {
  import_id: string;
  revision: number;
  manifest_sha256: string;
  prior_catalog_sha256: string;
  catalog_sha256: string;
  database_payload_sha256: string;
  client_payload_sha256: string;
  mutation_count: number;
  update_count: number;
  insert_count: number;
  evidence: unknown;
};

export type ReleasedContentBlockRevisionV2RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

export type ReleasedContentBlockRevisionV2Dependencies<Client> = {
  classifyEnvironment: (url: string, allowProduction: boolean) => CourseImportEnvironment;
  createClient: (url: string, serviceRoleKey: string) => Client;
  loadActiveRevision: (client: Client, importId: string) => Promise<ActiveRevision>;
  loadCatalogSha256: (client: Client, importId: string) => Promise<string>;
  loadAudit: (
    client: Client,
    importId: string,
    manifestSha256: string,
  ) => Promise<ReleasedContentBlockRevisionV2Audit | null>;
  loadMutationRows: (
    client: Client,
    mutations: ReleasedContentBlockRevisionV2Mutation[],
  ) => Promise<ReleasedContentBlockRevisionV2Row[]>;
  callRevision: (client: Client, args: Record<string, unknown>) => Promise<ReleasedContentBlockRevisionV2RpcResult>;
  log: (value: string) => void;
};

type ValidatedRpcResult = {
  status: "revised" | "already_revised";
  revision: number;
  mutation_count: number;
  catalog_sha256: string;
};

export async function runReleasedContentBlockRevisionV2Command<Client>(
  input: ReleasedContentBlockRevisionV2CommandInput,
  dependencies: ReleasedContentBlockRevisionV2Dependencies<Client>,
) {
  const mutationCount = input.mutations.length;
  dependencies.log(JSON.stringify(input.plan, null, 2));
  if (!input.options.execute) {
    dependencies.log("Dry run only. No database connection or write was attempted.");
    return { status: "dry_run" as const };
  }

  const url = requiredValue(input.environment.url, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredValue(input.environment.serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
  const environment = dependencies.classifyEnvironment(url, input.options.allowProduction);
  const client = dependencies.createClient(url, serviceRoleKey);

  const active = await dependencies.loadActiveRevision(client, input.importId);
  if (active.import_id !== input.importId) {
    throw new Error("Released content revision v2 active-release import identity drifted.");
  }
  if (active.active_manifest_sha256 !== input.expectedPriorManifestSha256) {
    throw new Error(
      "Released content revision v2 refused: the live active manifest checksum no longer matches this preflight.",
    );
  }
  const expectedPriorCatalogSha256 = await dependencies.loadCatalogSha256(client, input.importId);
  const clientPayloadSha256 = input.clientPayloadSha256;
  const expectedConfirmation = releasedContentBlockRevisionV2Confirmation({
    importId: input.importId,
    expectedPriorManifestSha256: input.expectedPriorManifestSha256,
    manifestSha256: input.manifestSha256,
    expectedPriorCatalogSha256,
    clientPayloadSha256,
    mutationCount,
  });
  if (input.options.confirmation !== expectedConfirmation) {
    throw new Error(`Execution confirmation must equal: ${expectedConfirmation}`);
  }

  const beforeRows = await dependencies.loadMutationRows(client, input.mutations);
  const priorState = assertReleasedContentBlockRevisionV2InitialOrRevisedState(beforeRows, input.mutations);

  const evidence = {
    operation: "released_content_blocks_v2",
    manifest_sha256: input.manifestSha256,
    expected_prior_catalog_sha256: expectedPriorCatalogSha256,
    client_payload_sha256: clientPayloadSha256,
    upload_receipt_sha256: input.uploadReceiptSha256,
  };
  const result = await dependencies.callRevision(client, {
    p_import_id: input.importId,
    p_expected_prior_manifest_sha256: input.expectedPriorManifestSha256,
    p_manifest_sha256: input.manifestSha256,
    p_expected_prior_catalog_sha256: expectedPriorCatalogSha256,
    p_mutations: input.mutations,
    p_client_payload_sha256: clientPayloadSha256,
    p_evidence: evidence,
    p_confirmation: expectedConfirmation,
  });
  if (result.error) {
    throw new Error(`Released content block revision v2 failed: ${result.error.message}`);
  }
  const rpc = assertRevisionRpcResult(result.data, mutationCount);

  const afterRows = await dependencies.loadMutationRows(client, input.mutations);
  assertReleasedContentBlockRevisionV2RevisedState(afterRows, input.mutations);
  const catalogSha256 = await dependencies.loadCatalogSha256(client, input.importId);
  if (catalogSha256 !== rpc.catalog_sha256) {
    throw new Error(
      "Released content revision v2 postflight catalog does not match the atomic RPC receipt.",
    );
  }
  const audit = await dependencies.loadAudit(client, input.importId, input.manifestSha256);
  assertRevisionAudit(audit, input, evidence, expectedPriorCatalogSha256, catalogSha256, rpc.revision);

  dependencies.log(JSON.stringify({
    phase: "released_content_blocks_v2_revised",
    environment,
    prior_state: priorState,
    mutation_count: mutationCount,
    revision: rpc.revision,
    catalog_sha256: catalogSha256,
    result: rpc,
  }, null, 2));
  return { status: rpc.status, environment, priorState, revision: rpc.revision, catalogSha256 };
}

function assertRevisionRpcResult(value: unknown, expectedMutationCount: number): ValidatedRpcResult {
  const result = requiredRecord(value, "Released content revision v2 RPC returned a malformed success receipt.");
  const status = requiredRevisionStatus(result.status);
  const revision = requiredPositiveInteger(
    result.revision,
    "Released content revision v2 RPC returned an invalid revision number.",
  );
  assertExactValue(
    result.mutation_count,
    expectedMutationCount,
    "Released content revision v2 RPC returned the wrong mutation count.",
  );
  const catalogSha256 = requiredSha256(
    result.catalog_sha256,
    "Released content revision v2 RPC returned an invalid catalog checksum.",
  );
  if ("import_id" in result === false) {
    // import_id is optional on the receipt; callRevision already scoped the call.
  }
  return { status, revision, mutation_count: expectedMutationCount, catalog_sha256: catalogSha256 };
}

function assertRevisionAudit(
  audit: ReleasedContentBlockRevisionV2Audit | null,
  input: ReleasedContentBlockRevisionV2CommandInput,
  evidence: Record<string, unknown>,
  expectedPriorCatalogSha256: string,
  catalogSha256: string,
  revision: number,
) {
  if (!audit) {
    throw new Error("Released content revision v2 audit receipt is missing.");
  }
  assertExactRecord({
    import_id: audit.import_id,
    revision: audit.revision,
    manifest_sha256: audit.manifest_sha256,
    prior_catalog_sha256: audit.prior_catalog_sha256,
    catalog_sha256: audit.catalog_sha256,
    client_payload_sha256: audit.client_payload_sha256,
    mutation_count: audit.mutation_count,
    update_count: audit.update_count,
    insert_count: audit.insert_count,
    evidence: audit.evidence,
  }, {
    import_id: input.importId,
    revision,
    manifest_sha256: input.manifestSha256,
    prior_catalog_sha256: expectedPriorCatalogSha256,
    catalog_sha256: catalogSha256,
    client_payload_sha256: input.clientPayloadSha256,
    mutation_count: input.mutations.length,
    update_count: input.mutations.filter((mutation) => mutation.action === "update").length,
    insert_count: input.mutations.filter((mutation) => mutation.action === "insert").length,
    evidence,
  }, "Released content revision v2 audit receipt does not match the exact approved operation.");
}

function requiredValue(value: string | undefined, name: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} must be set and non-empty.`);
  }
  return value;
}

function requiredRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function requiredRevisionStatus(value: unknown): "revised" | "already_revised" {
  if (value !== "revised" && value !== "already_revised") {
    throw new Error("Released content revision v2 RPC returned an unsupported status.");
  }
  return value;
}

function requiredPositiveInteger(value: unknown, message: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(message);
  return number;
}

function requiredSha256(value: unknown, message: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(message);
  }
  return value;
}

function assertExactValue(actual: unknown, expected: unknown, message: string) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
