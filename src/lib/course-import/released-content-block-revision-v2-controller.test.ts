import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
  assertCourseImportEnvironment,
} from "./environment";
import {
  releasedContentBlockRevisionV2Confirmation,
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
const uploadReceiptSha256 = "6".repeat(64);

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

const expectedConfirmation = releasedContentBlockRevisionV2Confirmation({
  importId,
  expectedPriorManifestSha256,
  manifestSha256,
  expectedPriorCatalogSha256: priorCatalogSha256,
  clientPayloadSha256,
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
    uploadReceiptSha256,
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
    database_payload_sha256: "irrelevant-not-checked-by-name",
    client_payload_sha256: clientPayloadSha256,
    mutation_count: mutations.length,
    update_count: 1,
    insert_count: 1,
    evidence: {
      operation: "released_content_blocks_v2",
      manifest_sha256: manifestSha256,
      expected_prior_catalog_sha256: priorCatalog,
      client_payload_sha256: clientPayloadSha256,
      upload_receipt_sha256: uploadReceiptSha256,
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
  const dependencies: ReleasedContentBlockRevisionV2Dependencies<FakeClient> = {
    classifyEnvironment: vi.fn(assertCourseImportEnvironment),
    createClient: vi.fn(() => ({ name: "fake-client" as const })),
    loadActiveRevision: vi.fn(async () => ({
      import_id: importId,
      active_revision: replay ? 2 : 1,
      active_manifest_sha256: options?.activeManifestSha256 ?? expectedPriorManifestSha256,
      active_catalog_sha256: replay ? replacementCatalogSha256 : priorCatalogSha256,
    })),
    loadCatalogSha256: vi.fn(async () => {
      catalogLoadCount += 1;
      if (replay) return replacementCatalogSha256;
      return catalogLoadCount === 1 ? priorCatalogSha256 : replacementCatalogSha256;
    }),
    loadAudit: vi.fn(async () => expectedAudit(2, replay ? replacementCatalogSha256 : priorCatalogSha256)),
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

  it("derives the confirmation string from the live preflight catalog checksum, not a caller-supplied one", async () => {
    const dependencies = makeHarness();
    const input = makeInput({ options: { ...makeInput().options, confirmation: "stale-confirmation" } });

    await expect(runReleasedContentBlockRevisionV2Command(input, dependencies))
      .rejects.toThrow(/Execution confirmation must equal/);
    expect(dependencies.callRevision).not.toHaveBeenCalled();
  });

  it("refuses before calling the RPC when the live active manifest has moved since preflight", async () => {
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

  it("returns already_revised on an idempotent replay without re-mutating", async () => {
    const dependencies = makeHarness({ replay: true });
    const input = makeInput({
      options: {
        ...makeInput().options,
        confirmation: releasedContentBlockRevisionV2Confirmation({
          importId,
          expectedPriorManifestSha256,
          manifestSha256,
          expectedPriorCatalogSha256: replacementCatalogSha256,
          clientPayloadSha256,
          mutationCount: mutations.length,
        }),
      },
    });

    await expect(runReleasedContentBlockRevisionV2Command(input, dependencies))
      .resolves.toMatchObject({ status: "already_revised", priorState: "already_revised" });
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
