import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
  assertCourseImportEnvironment,
} from "./environment";
import {
  releasedContentBlockRevisionV2Confirmation,
  releasedContentBlockRevisionV2DatabasePayloadSha256,
  type ReleasedContentBlockRevisionV2Mutation,
  type ReleasedContentBlockRevisionV2Row,
} from "./released-content-block-revision-v2";
import {
  runReleasedContentBlockRevisionV2Command,
  type ReleasedContentBlockRevisionV2Audit,
  type ReleasedContentBlockRevisionV2CommandInput,
  type ReleasedContentBlockRevisionV2Dependencies,
} from "./released-content-block-revision-v2-controller";

type FakeClient = { name: "fake-client" };

const importId = "test-import-v2";
const expectedPriorManifestSha256 = "1".repeat(64);
const manifestSha256 = "2".repeat(64);
const priorCatalogSha256 = "3".repeat(64);
const replacementCatalogSha256 = "4".repeat(64);
const clientPayloadSha256 = "5".repeat(64);

const mutations: ReleasedContentBlockRevisionV2Mutation[] = [
  {
    action: "update",
    source_key: "block-cards",
    block_id: "00000000-0000-5000-a000-000000000001",
    lesson_id: "00000000-0000-5000-a000-000000000010",
    block_type: "flashcard",
    expected_content: { cards: [{ front: "A", back: "B" }] },
    replacement_content: { cards: [{ front: "A", back: "B revised" }] },
    sort_order: 0,
    is_required_for_completion: false,
    replacement_sha256: null,
    replacement_size_bytes: null,
  },
  {
    action: "insert",
    source_key: "block-oral-check-1",
    block_id: "00000000-0000-5000-a000-000000000002",
    lesson_id: "00000000-0000-5000-a000-000000000010",
    block_type: "role_play",
    expected_content: null,
    replacement_content: { mode: "oral_check", scenario_id: "pending:oral-check-1" },
    sort_order: 1,
    is_required_for_completion: false,
    replacement_sha256: null,
    replacement_size_bytes: null,
  },
];

// The real checksum PostgreSQL would compute from this exact payload -- the
// confirmation binds to THIS, never to the client-side hash (see the
// builder's own doc comment on releasedContentBlockRevisionV2Confirmation).
const databasePayloadSha256 = releasedContentBlockRevisionV2DatabasePayloadSha256(mutations);

const expectedConfirmation = releasedContentBlockRevisionV2Confirmation({
  importId,
  expectedPriorManifestSha256,
  manifestSha256,
  expectedPriorCatalogSha256: priorCatalogSha256,
  databasePayloadSha256,
  mutationCount: mutations.length,
});

function rows(state: "initial" | "revised"): ReleasedContentBlockRevisionV2Row[] {
  return mutations.flatMap((mutation) => {
    if (state === "initial" && mutation.action === "insert") return [];
    return [{
      id: mutation.block_id,
      lesson_id: mutation.lesson_id,
      block_type: mutation.block_type,
      content: state === "initial" ? mutation.expected_content! : mutation.replacement_content,
      sort_order: mutation.sort_order,
      is_required_for_completion: mutation.is_required_for_completion,
    }];
  });
}

function makeInput(
  overrides: Partial<ReleasedContentBlockRevisionV2CommandInput> = {},
): ReleasedContentBlockRevisionV2CommandInput {
  return {
    options: { execute: true, allowProduction: false, confirmation: expectedConfirmation },
    importId,
    expectedPriorManifestSha256,
    manifestSha256,
    mutations,
    clientPayloadSha256,
    environment: { url: COURSE_IMPORT_TEST_URL, serviceRoleKey: "non-empty-test-service-role-key" },
    plan: { phase: "released_content_block_revision_v2_plan", mutation_count: mutations.length },
    ...overrides,
  };
}

function expectedAudit(
  revision: number,
  priorCatalog: string = priorCatalogSha256,
): ReleasedContentBlockRevisionV2Audit {
  return {
    import_id: importId,
    revision,
    manifest_sha256: manifestSha256,
    prior_catalog_sha256: priorCatalog,
    catalog_sha256: replacementCatalogSha256,
    database_payload_sha256: databasePayloadSha256,
    client_payload_sha256: clientPayloadSha256,
    mutation_count: mutations.length,
    update_count: 1,
    insert_count: 1,
    evidence: {
      operation: "released_content_blocks_v2",
      manifest_sha256: manifestSha256,
      expected_prior_catalog_sha256: priorCatalog,
    },
  };
}

function makeHarness(options?: {
  replay?: boolean;
  activeManifestSha256?: string;
}) {
  const replay = options?.replay ?? false;
  let rowLoadCount = 0;
  let catalogLoadCount = 0;
  let activeLoadCount = 0;
  const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
    classifyEnvironment: vi.fn(assertCourseImportEnvironment),
    createClient: vi.fn(() => ({ name: "fake-client" as const })),
    loadActiveRevision: vi.fn(async () => {
      activeLoadCount += 1;
      // First read: the pre-RPC preflight state. Later reads: the post-RPC
      // head, which after this command's own successful commit is its own
      // revision (2) with the target manifest active.
      if (replay || activeLoadCount > 1) {
        return {
          import_id: importId,
          active_revision: 2,
          active_manifest_sha256: replay
            ? options?.activeManifestSha256 ?? expectedPriorManifestSha256
            : manifestSha256,
          active_catalog_sha256: replacementCatalogSha256,
        };
      }
      return {
        import_id: importId,
        active_revision: 1,
        active_manifest_sha256: options?.activeManifestSha256 ?? expectedPriorManifestSha256,
        active_catalog_sha256: priorCatalogSha256,
      };
    }),
    loadCatalogSha256: vi.fn(async () => {
      catalogLoadCount += 1;
      if (replay) return replacementCatalogSha256;
      return catalogLoadCount === 1 ? priorCatalogSha256 : replacementCatalogSha256;
    }),
    loadAudit: vi.fn(async () => expectedAudit(2, replay ? replacementCatalogSha256 : priorCatalogSha256)),
    classifyRevisionLineage: vi.fn(async () => "active_head" as const),
    loadMutationRows: vi.fn(async () => {
      rowLoadCount += 1;
      return rows(replay || rowLoadCount > 1 ? "revised" : "initial");
    }),
    callRevision: vi.fn(async () => ({
      error: null,
      data: replay
        ? {
            status: "already_revised",
            import_id: importId,
            revision: 2,
            mutation_count: mutations.length,
            catalog_sha256: replacementCatalogSha256,
          }
        : {
            status: "revised",
            import_id: importId,
            revision: 2,
            mutation_count: mutations.length,
            update_count: 1,
            insert_count: 1,
            catalog_sha256: replacementCatalogSha256,
          },
    })),
    log: vi.fn(),
  };
  return dependencies;
}

describe("released content block revision v2 controller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps dry runs offline even when credentials are absent", async () => {
    const dependencies = makeHarness();
    const input = makeInput({
      options: { ...makeInput().options, execute: false },
      environment: { url: undefined, serviceRoleKey: undefined },
    });

    await expect(runReleasedContentBlockRevisionV2Command(input, dependencies))
      .resolves.toEqual({ status: "dry_run" });
    expect(dependencies.createClient).not.toHaveBeenCalled();
  });

  it("derives the confirmation string from PostgreSQL's own computed payload digest, not a caller-supplied client hash", async () => {
    const dependencies = makeHarness();
    // A confirmation built from the CLIENT hash (what an earlier, flawed
    // version of this mechanism bound to) must be refused: it is not what
    // the server will require.
    const clientBoundConfirmation = releasedContentBlockRevisionV2Confirmation({
      importId,
      expectedPriorManifestSha256,
      manifestSha256,
      expectedPriorCatalogSha256: priorCatalogSha256,
      databasePayloadSha256: clientPayloadSha256,
      mutationCount: mutations.length,
    });
    const input = makeInput({ options: { ...makeInput().options, confirmation: clientBoundConfirmation } });

    await expect(runReleasedContentBlockRevisionV2Command(input, dependencies))
      .rejects.toThrow(/Execution confirmation must equal/);
    expect(dependencies.callRevision).not.toHaveBeenCalled();
  });

  it("refuses before calling the RPC when the live active manifest has moved to something other than prior or target", async () => {
    const dependencies = makeHarness({ activeManifestSha256: "9".repeat(64) });
    const input = makeInput();

    await expect(runReleasedContentBlockRevisionV2Command(input, dependencies))
      .rejects.toThrow(/live active manifest checksum no longer matches/);
    expect(dependencies.callRevision).not.toHaveBeenCalled();
  });

  it("applies a real forward revision end to end with a fully generic (non-44) mutation count", async () => {
    const dependencies = makeHarness();

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .resolves.toMatchObject({
        status: "revised",
        priorState: "initial",
        revision: 2,
        catalogSha256: replacementCatalogSha256,
      });
    expect(dependencies.callRevision).toHaveBeenCalledWith(
      { name: "fake-client" },
      expect.objectContaining({
        p_import_id: importId,
        p_mutations: mutations,
        p_confirmation: expectedConfirmation,
      }),
    );
  });

  it("returns already_revised when the RPC's own idempotent-replay branch fires (active still reads as prior)", async () => {
    const dependencies = makeHarness({ replay: true });
    const input = makeInput({
      options: {
        ...makeInput().options,
        confirmation: releasedContentBlockRevisionV2Confirmation({
          importId,
          expectedPriorManifestSha256,
          manifestSha256,
          expectedPriorCatalogSha256: replacementCatalogSha256,
          databasePayloadSha256,
          mutationCount: mutations.length,
        }),
      },
    });

    await expect(runReleasedContentBlockRevisionV2Command(input, dependencies))
      .resolves.toMatchObject({ status: "already_revised", priorState: "already_revised" });
  });

  it("reconciles via the audit trail instead of refusing as stale when a prior call's response was lost (active already equals the target manifest)", async () => {
    // This is the realistic shape of a lost response: a previous run of this
    // exact command already succeeded, so the live active manifest is the
    // TARGET, not the prior, manifest. A controller that only ever compares
    // against the prior manifest would misreport this as "stale" and refuse
    // outright; the correct behavior is to look up the durable audit record
    // for the target manifest and, if it checks out, report already_revised
    // WITHOUT calling the mutation RPC again.
    const loadAudit = vi.fn(async () => expectedAudit(2, expectedPriorManifestSha256));
    const loadMutationRows = vi.fn(async () => rows("revised"));
    const callRevision = vi.fn();
    const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
      classifyEnvironment: vi.fn(assertCourseImportEnvironment),
      createClient: vi.fn(() => ({ name: "fake-client" as const })),
      loadActiveRevision: vi.fn(async () => ({
        import_id: importId,
        active_revision: 2,
        active_manifest_sha256: manifestSha256,
        active_catalog_sha256: replacementCatalogSha256,
      })),
      loadCatalogSha256: vi.fn(async () => replacementCatalogSha256),
      loadAudit,
      loadMutationRows,
      callRevision,
      log: vi.fn(),
      classifyRevisionLineage: vi.fn(),
    };

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .resolves.toMatchObject({
        status: "already_revised",
        priorState: "already_revised",
        revision: 2,
        catalogSha256: replacementCatalogSha256,
      });
    expect(callRevision).not.toHaveBeenCalled();
    // Keyed by the ACTIVE revision number (the ledger PK), never the
    // manifest hash -- after rollback + reapply the same hash appears on
    // multiple ledger rows and a hash-keyed lookup errors on the ambiguity.
    expect(loadAudit).toHaveBeenCalledWith({ name: "fake-client" }, importId, 2);
  });

  it("refuses the response-loss reconciliation if the active ledger row was produced by a different payload", async () => {
    const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
      classifyEnvironment: vi.fn(assertCourseImportEnvironment),
      createClient: vi.fn(() => ({ name: "fake-client" as const })),
      loadActiveRevision: vi.fn(async () => ({
        import_id: importId,
        active_revision: 2,
        active_manifest_sha256: manifestSha256,
        active_catalog_sha256: replacementCatalogSha256,
      })),
      loadCatalogSha256: vi.fn(async () => replacementCatalogSha256),
      loadAudit: vi.fn(async () => ({
        ...expectedAudit(2, expectedPriorManifestSha256),
        database_payload_sha256: "e".repeat(64),
      })),
      loadMutationRows: vi.fn(async () => rows("revised")),
      callRevision: vi.fn(),
      log: vi.fn(),
      classifyRevisionLineage: vi.fn(),
    };

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .rejects.toThrow(/different mutation payload/);
  });

  it("refuses the response-loss reconciliation if no audit record exists for the active target manifest", async () => {
    const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
      classifyEnvironment: vi.fn(assertCourseImportEnvironment),
      createClient: vi.fn(() => ({ name: "fake-client" as const })),
      loadActiveRevision: vi.fn(async () => ({
        import_id: importId,
        active_revision: 2,
        active_manifest_sha256: manifestSha256,
        active_catalog_sha256: replacementCatalogSha256,
      })),
      loadCatalogSha256: vi.fn(async () => replacementCatalogSha256),
      loadAudit: vi.fn(async () => null),
      loadMutationRows: vi.fn(async () => rows("revised")),
      callRevision: vi.fn(),
      log: vi.fn(),
      classifyRevisionLineage: vi.fn(),
    };

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .rejects.toThrow(/no content-block audit record exists at the active revision/);
  });

  it("refuses the response-loss reconciliation if live catalog has drifted from the audited target state", async () => {
    const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
      classifyEnvironment: vi.fn(assertCourseImportEnvironment),
      createClient: vi.fn(() => ({ name: "fake-client" as const })),
      loadActiveRevision: vi.fn(async () => ({
        import_id: importId,
        active_revision: 2,
        active_manifest_sha256: manifestSha256,
        active_catalog_sha256: replacementCatalogSha256,
      })),
      loadCatalogSha256: vi.fn(async () => "f".repeat(64)),
      loadAudit: vi.fn(async () => expectedAudit(2, expectedPriorManifestSha256)),
      loadMutationRows: vi.fn(async () => rows("revised")),
      callRevision: vi.fn(),
      log: vi.fn(),
      classifyRevisionLineage: vi.fn(),
    };

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .rejects.toThrow(/catalog checksum has drifted/);
  });

  it("classifies a newer active head after its own commit as superseded success, not failure", async () => {
    // Two-controller post-commit advancement: this command's RPC commits
    // revision 2, but before its unlocked postflight reads run, a SECOND
    // controller advances the shared ledger to revision 3, BUILT ON TOP of
    // ours -- live rows and catalog now reflect the newer revision, not
    // ours. The immutable receipt at OUR revision is the commit proof, and
    // the lineage classifier (not a bare revision-number comparison) says
    // our revision is still a genuine ancestor: "superseded" success, never
    // an error (a retry would be wrong).
    const loadMutationRows = vi.fn(async () => rows("initial"));
    const loadCatalogSha256 = vi.fn(async () => priorCatalogSha256);
    const classifyRevisionLineage = vi.fn(async () => "superseded" as const);
    const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
      classifyEnvironment: vi.fn(assertCourseImportEnvironment),
      createClient: vi.fn(() => ({ name: "fake-client" as const })),
      loadActiveRevision: vi.fn(async () => ({
        import_id: importId,
        active_revision: 1,
        active_manifest_sha256: expectedPriorManifestSha256,
        active_catalog_sha256: priorCatalogSha256,
      })),
      loadCatalogSha256,
      loadAudit: vi.fn(async () => expectedAudit(2)),
      classifyRevisionLineage,
      loadMutationRows,
      callRevision: vi.fn(async () => ({
        error: null,
        data: {
          status: "revised",
          import_id: importId,
          revision: 2,
          mutation_count: mutations.length,
          update_count: 1,
          insert_count: 1,
          catalog_sha256: replacementCatalogSha256,
        },
      })),
      log: vi.fn(),
    };

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .resolves.toMatchObject({
        status: "superseded",
        revision: 2,
        catalogSha256: replacementCatalogSha256,
      });
    expect(classifyRevisionLineage).toHaveBeenCalledWith({ name: "fake-client" }, importId, 2);
    // The superseded path must NOT compare live rows or catalog against its
    // own receipt -- they legitimately reflect the newer revision. One row
    // load (the preflight) and one catalog load (the preflight) only.
    expect(loadMutationRows).toHaveBeenCalledTimes(1);
    expect(loadCatalogSha256).toHaveBeenCalledTimes(1);
  });

  it("reports rolled_back, not superseded success, when a rollback undid this exact revision before postflight", async () => {
    // Post-commit rollback race: this command's RPC commits revision 2, but
    // before its unlocked postflight reads run, a rollback receipt reverts
    // EXACTLY revision 2 (a greater active revision number too -- the same
    // shape as the forward-supersede case above). A bare
    // `active_revision > our_revision` comparison cannot tell these apart;
    // the lineage classifier can, and must report "rolled_back" rather than
    // claiming success for a revision that is no longer part of the active
    // state.
    const loadMutationRows = vi.fn(async () => rows("initial"));
    const loadCatalogSha256 = vi.fn(async () => priorCatalogSha256);
    const classifyRevisionLineage = vi.fn(async () => "reverted" as const);
    const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
      classifyEnvironment: vi.fn(assertCourseImportEnvironment),
      createClient: vi.fn(() => ({ name: "fake-client" as const })),
      loadActiveRevision: vi.fn(async () => ({
        import_id: importId,
        active_revision: 1,
        active_manifest_sha256: expectedPriorManifestSha256,
        active_catalog_sha256: priorCatalogSha256,
      })),
      loadCatalogSha256,
      loadAudit: vi.fn(async () => expectedAudit(2)),
      classifyRevisionLineage,
      loadMutationRows,
      callRevision: vi.fn(async () => ({
        error: null,
        data: {
          status: "revised",
          import_id: importId,
          revision: 2,
          mutation_count: mutations.length,
          update_count: 1,
          insert_count: 1,
          catalog_sha256: replacementCatalogSha256,
        },
      })),
      log: vi.fn(),
    };

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .resolves.toMatchObject({
        status: "rolled_back",
        revision: 2,
        catalogSha256: replacementCatalogSha256,
      });
    expect(classifyRevisionLineage).toHaveBeenCalledWith({ name: "fake-client" }, importId, 2);
    expect(loadMutationRows).toHaveBeenCalledTimes(1);
    expect(loadCatalogSha256).toHaveBeenCalledTimes(1);
  });

  it("refuses when the lineage classifier reports a diverged or unknown state for its own just-committed revision", async () => {
    const dependencies = makeHarness();
    (dependencies.classifyRevisionLineage as ReturnType<typeof vi.fn>).mockResolvedValueOnce("diverged");

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .rejects.toThrow(/lineage state "diverged"/);
  });

  it("surfaces the RPC's own error instead of swallowing it", async () => {
    const dependencies = makeHarness();
    (dependencies.callRevision as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: "stale catalog checksum" },
    });

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .rejects.toThrow(/stale catalog checksum/);
  });

  it("refuses a postflight catalog checksum that does not match the RPC's own receipt", async () => {
    const dependencies = makeHarness();
    (dependencies.loadCatalogSha256 as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(priorCatalogSha256)
      .mockResolvedValueOnce("f".repeat(64));

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .rejects.toThrow(/postflight catalog does not match/);
  });

  it("refuses when the audit receipt does not match the exact approved operation", async () => {
    const dependencies = makeHarness();
    (dependencies.loadAudit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...expectedAudit(2),
      mutation_count: 999,
    });

    await expect(runReleasedContentBlockRevisionV2Command(makeInput(), dependencies))
      .rejects.toThrow(/audit receipt does not match/);
  });

  it("blocks the canonical production project without --allow-production", async () => {
    const dependencies = makeHarness();
    const input = makeInput({
      environment: { url: COURSE_IMPORT_PRODUCTION_URL, serviceRoleKey: "non-empty-production-placeholder" },
    });

    await expect(runReleasedContentBlockRevisionV2Command(input, dependencies))
      .rejects.toThrow("Production writes are blocked");
    expect(dependencies.createClient).not.toHaveBeenCalled();
  });
});
