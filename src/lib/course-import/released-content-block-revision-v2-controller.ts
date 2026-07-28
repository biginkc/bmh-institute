import {
  assertReleasedContentBlockRevisionV2InitialOrRevisedState,
  assertReleasedContentBlockRevisionV2RevisedState,
  releasedContentBlockRevisionV2Confirmation,
  releasedContentBlockRevisionV2DatabasePayloadSha256,
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
  /** Client-side (JS canonicalization) audit-trail hash only -- NOT used to
   * derive the confirmation string and never compared against the
   * database's own computed digest (they use different canonicalization
   * rules and are expected to differ). Stored purely so the audit trail
   * can trace back to whatever artifact an operator reviewed client-side. */
  clientPayloadSha256: string;
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
  prior_manifest_sha256: string;
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
  /** Loads the content_blocks-kind ledger row by its unique (import_id,
   * revision) primary key. Never keyed by manifest hash: after a
   * rollback + reapply of the same target manifest, multiple ledger rows
   * legitimately share one manifest_sha256, and a hash-keyed single-row
   * lookup errors on the multiple matches -- post-commit, which would
   * report failure for a write that succeeded and leave every retry
   * unreconcilable. */
  loadAudit: (
    client: Client,
    importId: string,
    revision: number,
  ) => Promise<ReleasedContentBlockRevisionV2Audit | null>;
  loadMutationRows: (
    client: Client,
    mutations: ReleasedContentBlockRevisionV2Mutation[],
  ) => Promise<ReleasedContentBlockRevisionV2Row[]>;
  callRevision: (client: Client, args: Record<string, unknown>) => Promise<ReleasedContentBlockRevisionV2RpcResult>;
  /** Classifies a SPECIFIC forward revision's standing relative to the
   * current lineage (fn_classify_revision_lineage): "active_head" (it still
   * is the resolved state), "superseded" (later activity built on top of
   * it -- success), "reverted" (a rollback undid it specifically), or
   * "diverged"/"unknown" (broken lineage). A bare
   * `active_revision > our_revision` comparison cannot tell "superseded"
   * apart from "reverted" -- a rollback receipt is also a greater revision
   * number. */
  classifyRevisionLineage: (
    client: Client,
    importId: string,
    revision: number,
  ) => Promise<RevisionLineageClassification>;
  log: (value: string) => void;
};

export type RevisionLineageClassification =
  | "active_head"
  | "superseded"
  | "reverted"
  | "diverged"
  | "unknown";

export type ReleasedContentBlockRevisionV2CommandStatus =
  | "dry_run"
  | "revised"
  | "already_revised"
  | "superseded"
  | "rolled_back";

/**
 * Process exit code for a completed command, for the CLI. `rolled_back` is
 * NOT success: the write committed but a rollback undid it before postflight
 * -- automation that treats every non-throwing completion as exit 0 would
 * report an undone revision as delivered. Distinct from exit 1 (thrown
 * errors) so callers can tell "the operation failed" from "the operation
 * succeeded and was then reverted; the catalog is NOT in the target state".
 */
export function releasedContentBlockRevisionV2ExitCode(
  status: ReleasedContentBlockRevisionV2CommandStatus,
): number {
  return status === "rolled_back" ? 2 : 0;
}

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
  const databasePayloadSha256 = releasedContentBlockRevisionV2DatabasePayloadSha256(input.mutations);
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

  if (active.active_manifest_sha256 === input.manifestSha256) {
    // The live active manifest is already the TARGET, not the prior, state.
    // This is the shape of a successful revision whose response (or a
    // caller's own read of it) was lost -- retrying the mutation call itself
    // would be refused by the RPC's own idempotent-replay branch, but a
    // naive controller that only ever compares against the prior manifest
    // would instead misreport this as "stale" and refuse outright. Reconcile
    // against the durable audit trail instead: verify the ledger row at the
    // ACTIVE revision number still matches this call's target manifest,
    // payload, and live state, then report already_revised without touching
    // the mutation path at all.
    return reconcileAlreadyActiveTarget(
      client,
      input,
      Number(active.active_revision),
      databasePayloadSha256,
      environment,
      dependencies,
    );
  }

  if (active.active_manifest_sha256 !== input.expectedPriorManifestSha256) {
    throw new Error(
      "Released content revision v2 refused: the live active manifest checksum no longer matches this preflight.",
    );
  }
  const expectedPriorCatalogSha256 = await dependencies.loadCatalogSha256(client, input.importId);
  const expectedConfirmation = releasedContentBlockRevisionV2Confirmation({
    importId: input.importId,
    expectedPriorManifestSha256: input.expectedPriorManifestSha256,
    manifestSha256: input.manifestSha256,
    expectedPriorCatalogSha256,
    databasePayloadSha256,
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
  };
  const result = await dependencies.callRevision(client, {
    p_import_id: input.importId,
    p_expected_prior_manifest_sha256: input.expectedPriorManifestSha256,
    p_manifest_sha256: input.manifestSha256,
    p_expected_prior_catalog_sha256: expectedPriorCatalogSha256,
    p_mutations: input.mutations,
    p_client_payload_sha256: input.clientPayloadSha256,
    p_evidence: evidence,
    p_confirmation: expectedConfirmation,
  });
  if (result.error) {
    throw new Error(`Released content block revision v2 failed: ${result.error.message}`);
  }
  const rpc = assertRevisionRpcResult(result.data, mutationCount);

  // COMMIT PROOF is the immutable receipt at the RPC-returned revision --
  // never the mutable rows or the live catalog, which a SUBSEQUENT revision
  // may legitimately have advanced between our commit and these unlocked
  // postflight reads. Verify the receipt first; then classify this
  // revision's LINEAGE (not just compare revision numbers -- a rollback of
  // exactly this revision is ALSO a greater active-revision number, and a
  // bare `active_revision > our_revision` check cannot tell the two apart):
  // if it is still the active head, verify live rows and catalog against
  // the receipt; if later activity was built on top of it, that is SUCCESS
  // ("superseded"); if a rollback undid it specifically, report that
  // distinctly ("rolled_back") rather than claiming success.
  const audit = await dependencies.loadAudit(client, input.importId, rpc.revision);
  assertRevisionAudit(
    audit,
    input,
    evidence,
    databasePayloadSha256,
    expectedPriorCatalogSha256,
    rpc.catalog_sha256,
    rpc.revision,
  );

  const lineage = await dependencies.classifyRevisionLineage(client, input.importId, rpc.revision);
  if (lineage === "reverted") {
    dependencies.log(JSON.stringify({
      phase: "released_content_blocks_v2_rolled_back",
      environment,
      prior_state: priorState,
      mutation_count: mutationCount,
      revision: rpc.revision,
      catalog_sha256: rpc.catalog_sha256,
    }, null, 2));
    return {
      status: "rolled_back" as const,
      environment,
      priorState,
      revision: rpc.revision,
      catalogSha256: rpc.catalog_sha256,
    };
  }
  if (lineage === "superseded") {
    dependencies.log(JSON.stringify({
      phase: "released_content_blocks_v2_superseded",
      environment,
      prior_state: priorState,
      mutation_count: mutationCount,
      revision: rpc.revision,
      catalog_sha256: rpc.catalog_sha256,
    }, null, 2));
    return {
      status: "superseded" as const,
      environment,
      priorState,
      revision: rpc.revision,
      catalogSha256: rpc.catalog_sha256,
    };
  }
  if (lineage !== "active_head") {
    throw new Error(
      `Released content revision v2 postflight found revision ${rpc.revision} in lineage state "${lineage}"; the shared ledger is inconsistent.`,
    );
  }

  const afterRows = await dependencies.loadMutationRows(client, input.mutations);
  assertReleasedContentBlockRevisionV2RevisedState(afterRows, input.mutations);
  const catalogSha256 = await dependencies.loadCatalogSha256(client, input.importId);
  if (catalogSha256 !== rpc.catalog_sha256) {
    throw new Error(
      "Released content revision v2 postflight catalog does not match the atomic RPC receipt.",
    );
  }

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

async function reconcileAlreadyActiveTarget<Client>(
  client: Client,
  input: ReleasedContentBlockRevisionV2CommandInput,
  activeRevision: number,
  databasePayloadSha256: string,
  environment: CourseImportEnvironment,
  dependencies: ReleasedContentBlockRevisionV2Dependencies<Client>,
) {
  const catalogSha256 = await dependencies.loadCatalogSha256(client, input.importId);
  // Keyed by the ACTIVE revision number (the ledger's unique PK), never by
  // manifest hash -- after a rollback + reapply the same manifest hash
  // legitimately appears on multiple ledger rows and a hash-keyed lookup
  // would error on the ambiguity.
  const audit = await dependencies.loadAudit(client, input.importId, activeRevision);
  if (!audit) {
    throw new Error(
      "Released content revision v2 refused: the live manifest already matches the target, but no content-block audit record exists at the active revision -- refusing to report success for an unverifiable state.",
    );
  }
  if (audit.revision !== activeRevision || audit.manifest_sha256 !== input.manifestSha256) {
    throw new Error(
      "Released content revision v2 refused: the ledger row at the active revision does not match this call's target manifest.",
    );
  }
  // Bind to the FULL receipt identity, exactly as the SQL replay guard does
  // -- an earlier version of this reconciliation checked only the target
  // manifest, payload digest, live catalog, and count, which let a stale
  // caller be told "already_revised" for a reapplication of the same
  // payload from a DIFFERENT predecessor state (rolled back, then reapplied
  // by someone else) without ever presenting the confirmation for it.
  if (audit.prior_manifest_sha256 !== input.expectedPriorManifestSha256) {
    throw new Error(
      "Released content revision v2 refused: the active receipt was applied from a different prior manifest than this call's preflight -- the state you prepared against is not the one that was revised.",
    );
  }
  if (audit.database_payload_sha256 !== databasePayloadSha256) {
    throw new Error(
      "Released content revision v2 refused: the ledger row at the active revision was produced by a different mutation payload than this call's.",
    );
  }
  const auditEvidence = audit.evidence;
  const evidenceOperation = isRecord(auditEvidence) ? auditEvidence.operation : undefined;
  if (evidenceOperation !== "released_content_blocks_v2") {
    throw new Error(
      "Released content revision v2 refused: the active receipt was not produced by the v2 revision operation.",
    );
  }
  if (audit.client_payload_sha256 !== input.clientPayloadSha256) {
    throw new Error(
      "Released content revision v2 refused: the active receipt's client payload digest does not match this call's.",
    );
  }
  // The confirmation ceremony still applies on the reconciliation path: the
  // required string is reconstructed from the IMMUTABLE RECEIPT's own prior
  // catalog (the state the commit actually consumed), so a caller whose
  // preflight saw a different predecessor -- or who presents no
  // confirmation at all -- is refused instead of being handed a success.
  const receiptBoundConfirmation = releasedContentBlockRevisionV2Confirmation({
    importId: input.importId,
    expectedPriorManifestSha256: input.expectedPriorManifestSha256,
    manifestSha256: input.manifestSha256,
    expectedPriorCatalogSha256: audit.prior_catalog_sha256,
    databasePayloadSha256,
    mutationCount: input.mutations.length,
  });
  if (input.options.confirmation !== receiptBoundConfirmation) {
    throw new Error(
      "Released content revision v2 refused: this call's confirmation does not match the active receipt's own recorded operation (its prior catalog was "
        + `${audit.prior_catalog_sha256}). If a rollback and reapplication happened since your preflight, re-run the preflight against live state instead of retrying.`,
    );
  }
  if (audit.catalog_sha256 !== catalogSha256) {
    throw new Error(
      "Released content revision v2 refused: the active manifest matches the target, but the live catalog checksum has drifted from the audit record for it.",
    );
  }
  if (audit.mutation_count !== input.mutations.length) {
    throw new Error(
      "Released content revision v2 refused: the recorded mutation count for the active target manifest does not match this call's own mutation set.",
    );
  }
  const afterRows = await dependencies.loadMutationRows(client, input.mutations);
  assertReleasedContentBlockRevisionV2RevisedState(afterRows, input.mutations);

  dependencies.log(JSON.stringify({
    phase: "released_content_blocks_v2_already_revised_reconciled",
    environment,
    reason: "active_manifest_already_equals_target",
    revision: audit.revision,
    catalog_sha256: catalogSha256,
  }, null, 2));
  return {
    status: "already_revised" as const,
    environment,
    priorState: "already_revised" as const,
    revision: audit.revision,
    catalogSha256,
  };
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
  databasePayloadSha256: string,
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
    database_payload_sha256: audit.database_payload_sha256,
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
    database_payload_sha256: databasePayloadSha256,
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
