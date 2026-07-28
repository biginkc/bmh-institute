import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
  assertCourseImportEnvironment,
} from "./environment";
import { validateCourseManifest } from "./manifest";
import {
  RELEASED_CONTENT_BLOCK_REVISION,
  buildReleasedContentBlockRevision,
  releasedContentBlockRevisionConfirmation,
  releasedContentBlockRevisionDatabasePayloadSha256,
  releasedContentBlockRevisionPayloadSha256,
  selectReleasedContentBlockRevisionGuideAssets,
  type ReleasedContentBlockMutation,
  type ReleasedContentBlockRow,
} from "./released-content-block-revision";
import {
  runReleasedContentBlockRevisionCommand,
  type ReleasedContentBlockRevisionAudit,
  type ReleasedContentBlockRevisionCommandInput,
  type ReleasedContentBlockRevisionDependencies,
} from "./released-content-block-revision-controller";
import type {
  CompletedReleasedContentBlockRevisionAssetReceipt,
  ReleasedContentBlockRevisionAssetReceiptExpectation,
} from "./released-content-block-revision-receipt";

type FakeClient = { name: "fake-client" };

const legacyManifest = readFileSync(resolve(
  process.cwd(),
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
));
const targetManifest = readFileSync(resolve(
  process.cwd(),
  "content/course-manifests/archive/bmh-employee-training.released-content-block-revision-target-20260726.v1.json",
));
const revision = buildReleasedContentBlockRevision({
  legacyManifest,
  targetManifest,
});
const validation = validateCourseManifest(
  JSON.parse(targetManifest.toString("utf8")) as unknown,
  { gate: "release" },
);
if (!validation.ok) {
  throw new Error(validation.errors.join("\n"));
}
const guideAssets = selectReleasedContentBlockRevisionGuideAssets(
  validation.value.assets,
  revision.mutations,
);
const clientPayloadSha256 = releasedContentBlockRevisionPayloadSha256(
  revision.mutations,
);
const databasePayloadSha256 =
  releasedContentBlockRevisionDatabasePayloadSha256(revision.mutations);
const confirmation = releasedContentBlockRevisionConfirmation({
  expectedCatalogSha256:
    RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
  payloadSha256: clientPayloadSha256,
});
const replacementCatalogSha256 = "a".repeat(64);
const receiptSha256 = "b".repeat(64);

function rows(
  mutations: ReleasedContentBlockMutation[],
  state: "initial" | "revised",
): ReleasedContentBlockRow[] {
  return mutations.flatMap((mutation) => {
    if (state === "initial" && mutation.action === "insert") return [];
    return [{
      id: mutation.block_id,
      lesson_id: mutation.lesson_id,
      block_type: mutation.block_type,
      content:
        state === "initial"
          ? mutation.expected_content!
          : mutation.replacement_content,
      sort_order: mutation.sort_order,
      is_required_for_completion:
        mutation.is_required_for_completion,
    }];
  });
}

function makeInput(
  overrides: Partial<ReleasedContentBlockRevisionCommandInput> = {},
): ReleasedContentBlockRevisionCommandInput {
  return {
    options: {
      execute: true,
      allowProduction: false,
      confirmation,
      stateRoot: "/tmp/released-content-revision-test-state",
    },
    targetManifest,
    guideAssets,
    mutations: revision.mutations,
    clientPayloadSha256,
    databasePayloadSha256,
    expectedConfirmation: confirmation,
    environment: {
      url: COURSE_IMPORT_TEST_URL,
      serviceRoleKey: "non-empty-test-service-role-key",
    },
    plan: {
      phase: "released_content_block_revision_plan",
      mutation_count: 44,
    },
    ...overrides,
  };
}

function completedReceipt(
  expectation: ReleasedContentBlockRevisionAssetReceiptExpectation,
): CompletedReleasedContentBlockRevisionAssetReceipt {
  return {
    schema_version: 1,
    receipt_type: "released_content_block_revision_assets_v1",
    status: "complete",
    ...expectation,
    verified_at: "2026-07-26T12:00:00.000Z",
    receipt_sha256: receiptSha256,
  };
}

function expectedAudit(): ReleasedContentBlockRevisionAudit {
  return {
    import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
    manifest_sha256: RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
    prior_catalog_sha256:
      RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
    replacement_catalog_sha256: replacementCatalogSha256,
    database_payload_sha256: databasePayloadSha256,
    client_payload_sha256: clientPayloadSha256,
    guide_update_count: 19,
    flashcard_update_count: 19,
    role_play_insert_count: 6,
    evidence: {
      operation: "released_content_blocks_v1",
      original_release_manifest_sha256:
        RELEASED_CONTENT_BLOCK_REVISION.originalReleaseManifestSha256,
      expected_active_manifest_sha256:
        RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256,
      manifest_sha256: RELEASED_CONTENT_BLOCK_REVISION.targetManifestSha256,
      expected_prior_catalog_sha256:
        RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
      client_payload_sha256: clientPayloadSha256,
      upload_receipt_sha256: receiptSha256,
    },
  };
}

function makeHarness(options?: {
  replay?: boolean;
  active?: Partial<{
    import_id: string;
    active_revision: number;
    active_manifest_sha256: string;
    active_catalog_sha256: string;
  }>;
}) {
  const replay = options?.replay ?? false;
  let rowLoadCount = 0;
  let catalogLoadCount = 0;
  const receiptExpectations:
    ReleasedContentBlockRevisionAssetReceiptExpectation[] = [];
  const receiptPaths: string[] = [];
  const dependencies: ReleasedContentBlockRevisionDependencies<FakeClient> = {
    classifyEnvironment: vi.fn(assertCourseImportEnvironment),
    loadUploadReceipt: vi.fn(async (path, expectation) => {
      receiptPaths.push(path);
      receiptExpectations.push(expectation);
      return completedReceipt(expectation);
    }),
    createClient: vi.fn(() => ({ name: "fake-client" as const })),
    verifyGuideAssets: vi.fn(async () => []),
    loadActiveRelease: vi.fn(async () => ({
      import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
      active_revision: 2,
      active_manifest_sha256:
        RELEASED_CONTENT_BLOCK_REVISION.expectedActiveManifestSha256,
      active_catalog_sha256:
        RELEASED_CONTENT_BLOCK_REVISION.expectedActiveCatalogSha256,
      ...options?.active,
    })),
    loadCatalogSha256: vi.fn(async () => {
      catalogLoadCount += 1;
      if (replay) return replacementCatalogSha256;
      return catalogLoadCount === 1
        ? RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256
        : replacementCatalogSha256;
    }),
    loadAudit: vi.fn(async () => expectedAudit()),
    loadMutationRows: vi.fn(async () => {
      rowLoadCount += 1;
      return rows(
        revision.mutations,
        replay || rowLoadCount > 1 ? "revised" : "initial",
      );
    }),
    callRevision: vi.fn(async () => ({
      error: null,
      data: replay
        ? {
            status: "already_revised",
            import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
            mutation_count: 44,
            catalog_sha256: replacementCatalogSha256,
          }
        : {
            status: "revised",
            import_id: RELEASED_CONTENT_BLOCK_REVISION.importId,
            mutation_count: 44,
            guide_update_count: 19,
            flashcard_update_count: 19,
            role_play_insert_count: 6,
            catalog_sha256: replacementCatalogSha256,
          },
    })),
    log: vi.fn(),
  };
  return {
    dependencies,
    receiptExpectations,
    receiptPaths,
  };
}

describe("released content block revision controller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps dry runs offline even when credentials are absent", async () => {
    const harness = makeHarness();
    const input = makeInput({
      options: {
        ...makeInput().options,
        execute: false,
      },
      environment: {
        url: undefined,
        serviceRoleKey: undefined,
      },
    });

    await expect(
      runReleasedContentBlockRevisionCommand(input, harness.dependencies),
    ).resolves.toEqual({ status: "dry_run" });
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
    expect(harness.dependencies.loadUploadReceipt).not.toHaveBeenCalled();
  });

  it("refuses missing confirmation before reading credentials or receipts", async () => {
    const harness = makeHarness();
    const input = makeInput({
      options: {
        ...makeInput().options,
        confirmation: undefined,
      },
    });

    await expect(
      runReleasedContentBlockRevisionCommand(input, harness.dependencies),
    ).rejects.toThrow("confirmation must equal");
    expect(harness.dependencies.classifyEnvironment).not.toHaveBeenCalled();
    expect(harness.dependencies.loadUploadReceipt).not.toHaveBeenCalled();
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
  });

  it("rejects caller-substituted PDFs before reading a receipt or creating a client", async () => {
    const harness = makeHarness();
    const substituted = guideAssets.map((asset, index) =>
      index === 0
        ? {
            ...asset,
            source_key: "unrelated-approved-pdf",
            storage_path:
              `courses/bmh-employee-training/v1/guides/unrelated.${"f".repeat(64)}.pdf`,
            checksum_sha256: "f".repeat(64),
          }
        : asset
    );

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput({ guideAssets: substituted }),
        harness.dependencies,
      ),
    ).rejects.toThrow(/exact 19 guide assets/i);
    expect(harness.dependencies.loadUploadReceipt).not.toHaveBeenCalled();
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
  });

  it("refuses an empty service-role value before reading a receipt or creating a client", async () => {
    const harness = makeHarness();
    const input = makeInput({
      environment: {
        url: COURSE_IMPORT_TEST_URL,
        serviceRoleKey: "   ",
      },
    });

    await expect(
      runReleasedContentBlockRevisionCommand(input, harness.dependencies),
    ).rejects.toThrow("SUPABASE_SERVICE_ROLE_KEY must be set and non-empty");
    expect(harness.dependencies.loadUploadReceipt).not.toHaveBeenCalled();
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
  });

  it("uses the canonical test receipt without the production flag", async () => {
    const harness = makeHarness();

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).resolves.toMatchObject({
      status: "revised",
      environment: "test",
      priorState: "initial",
      catalogSha256: replacementCatalogSha256,
    });
    expect(harness.receiptExpectations[0]?.environment).toBe("test");
    expect(harness.receiptExpectations[0]?.approved_asset_count).toBe(19);
    expect(harness.receiptPaths[0]).toMatch(
      /released-content-block-revision-receipts\/.*\.guides-v1\.test\.json$/,
    );
    expect(harness.receiptPaths[0]).not.toContain("/upload-receipts/");
    expect(harness.dependencies.verifyGuideAssets).toHaveBeenCalledWith(
      { name: "fake-client" },
      guideAssets,
    );
  });

  it("blocks the canonical production project without --allow-production", async () => {
    const harness = makeHarness();
    const input = makeInput({
      environment: {
        url: COURSE_IMPORT_PRODUCTION_URL,
        serviceRoleKey: "non-empty-production-placeholder",
      },
    });

    await expect(
      runReleasedContentBlockRevisionCommand(input, harness.dependencies),
    ).rejects.toThrow("Production writes are blocked");
    expect(harness.dependencies.loadUploadReceipt).not.toHaveBeenCalled();
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
  });

  it("uses a production receipt only after the explicit production gate", async () => {
    const harness = makeHarness();
    const input = makeInput({
      options: {
        ...makeInput().options,
        allowProduction: true,
      },
      environment: {
        url: COURSE_IMPORT_PRODUCTION_URL,
        serviceRoleKey: "non-empty-production-placeholder",
      },
    });

    await expect(
      runReleasedContentBlockRevisionCommand(input, harness.dependencies),
    ).resolves.toMatchObject({ environment: "production" });
    expect(harness.receiptExpectations[0]?.environment).toBe("production");
    expect(harness.receiptPaths[0]).toMatch(
      /released-content-block-revision-receipts\/.*\.guides-v1\.production\.json$/,
    );
  });

  it("stops when the exact upload receipt is missing or invalid", async () => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.loadUploadReceipt).mockRejectedValue(
      new Error("Apply refused: upload receipt checksum verification failed."),
    );

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow("upload receipt checksum verification failed");
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
  });

  it("re-byte-verifies all 19 guide assets and refuses problems before the RPC", async () => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.verifyGuideAssets).mockResolvedValue([{
      path: guideAssets[0].storage_path,
      problem: "remote bytes SHA-256 does not match",
    }]);

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow(/remote bytes sha-256 does not match/i);
    expect(harness.dependencies.loadActiveRelease).not.toHaveBeenCalled();
    expect(harness.dependencies.callRevision).not.toHaveBeenCalled();
  });

  it.each([
    ["import identity", { import_id: "different-import" }, "identity drifted"],
    ["revision", { active_revision: 3 }, "revision drifted"],
    [
      "manifest",
      { active_manifest_sha256: "c".repeat(64) },
      "manifest checksum drifted",
    ],
    [
      "catalog",
      { active_catalog_sha256: "d".repeat(64) },
      "catalog checksum drifted",
    ],
  ])("rejects active-release %s drift", async (_label, active, message) => {
    const harness = makeHarness({ active });

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow(message);
    expect(harness.dependencies.callRevision).not.toHaveBeenCalled();
  });

  it("rejects current catalog drift without an exact prior audit", async () => {
    const harness = makeHarness({ replay: true });
    vi.mocked(harness.dependencies.loadAudit).mockResolvedValue(null);

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow("audit receipt is missing");
    expect(harness.dependencies.callRevision).not.toHaveBeenCalled();
  });

  it("surfaces RPC errors before postflight", async () => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.callRevision).mockResolvedValue({
      data: null,
      error: { message: "database refusal" },
    });

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow("database refusal");
    expect(harness.dependencies.loadMutationRows).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing object", null],
    ["bad status", { status: "ok", mutation_count: 44, catalog_sha256: replacementCatalogSha256 }],
    ["bad count", { status: "revised", mutation_count: 43, catalog_sha256: replacementCatalogSha256 }],
    ["bad checksum", { status: "revised", mutation_count: 44, catalog_sha256: "bad" }],
    [
      "bad breakdown",
      {
        status: "revised",
        mutation_count: 44,
        guide_update_count: 18,
        flashcard_update_count: 19,
        role_play_insert_count: 6,
        catalog_sha256: replacementCatalogSha256,
      },
    ],
  ])("rejects malformed RPC success: %s", async (_label, data) => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.callRevision).mockResolvedValue({
      data,
      error: null,
    });

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow(/RPC returned/);
  });

  it("rejects a postflight catalog that differs from the RPC receipt", async () => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.loadCatalogSha256)
      .mockResolvedValueOnce(
        RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
      )
      .mockResolvedValueOnce("e".repeat(64));

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow("does not match the atomic RPC receipt");
  });

  it("rejects a missing or mismatched immutable audit receipt", async () => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.loadAudit).mockResolvedValue({
      ...expectedAudit(),
      evidence: {
        ...(expectedAudit().evidence as Record<string, unknown>),
        upload_receipt_sha256: "f".repeat(64),
      },
    });

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow("audit receipt does not match");
  });

  it("accepts only an exact idempotent replay receipt and target state", async () => {
    const harness = makeHarness({ replay: true });

    await expect(
      runReleasedContentBlockRevisionCommand(
        makeInput(),
        harness.dependencies,
      ),
    ).resolves.toMatchObject({
      status: "already_revised",
      priorState: "already_revised",
      catalogSha256: replacementCatalogSha256,
    });
    expect(harness.dependencies.loadAudit).toHaveBeenCalledTimes(2);
    expect(harness.dependencies.loadMutationRows).toHaveBeenCalledTimes(2);
  });
});
