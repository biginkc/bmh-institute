import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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
  releasedContentBlockRevisionPayloadSha256,
  selectReleasedContentBlockRevisionGuideAssets,
} from "./released-content-block-revision";
import {
  parseReleasedContentBlockRevisionCliOptions,
  runReleasedContentBlockRevisionAssetPreparation,
  type ReleasedContentBlockRevisionAssetPreparationDependencies,
  type ReleasedContentBlockRevisionAssetPreparationInput,
} from "./released-content-block-revision-controller";
import {
  assertCompletedReleasedContentBlockRevisionAssetReceipt,
  buildReleasedContentBlockRevisionAssetReceiptExpectation,
  invalidateReleasedContentBlockRevisionAssetReceipt,
  releasedContentBlockRevisionAssetReceiptPath,
  writeCompletedReleasedContentBlockRevisionAssetReceipt,
  type ReleasedContentBlockRevisionAssetReceiptExpectation,
} from "./released-content-block-revision-receipt";
import {
  buildUploadReceiptExpectation,
  uploadReceiptPath,
  writeCompletedUploadReceipt,
} from "./upload-receipt";

type FakeClient = { name: "revision-asset-client" };

const legacyManifest = Buffer.from(await readFile(resolve(
  process.cwd(),
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
)));
const targetManifest = Buffer.from(await readFile(resolve(
  process.cwd(),
  "content/course-manifests/bmh-employee-training.v1.json",
)));
const revision = buildReleasedContentBlockRevision({
  legacyManifest,
  targetManifest,
});
const validation = validateCourseManifest(
  JSON.parse(targetManifest.toString("utf8")) as unknown,
  { gate: "release" },
);
if (!validation.ok) throw new Error(validation.errors.join("\n"));
const guideAssets = selectReleasedContentBlockRevisionGuideAssets(
  validation.value.assets,
  revision.mutations,
);
const payloadSha256 = releasedContentBlockRevisionPayloadSha256(
  revision.mutations,
);
const confirmation = releasedContentBlockRevisionConfirmation({
  expectedCatalogSha256:
    RELEASED_CONTENT_BLOCK_REVISION.expectedPriorCatalogSha256,
  payloadSha256,
});
const temporaryDirectories: string[] = [];

function expectation(
  environment: "test" | "production" = "test",
): ReleasedContentBlockRevisionAssetReceiptExpectation {
  return buildReleasedContentBlockRevisionAssetReceiptExpectation({
    targetManifest,
    importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
    clientPayloadSha256: payloadSha256,
    environment,
    environmentUrl:
      environment === "test"
        ? COURSE_IMPORT_TEST_URL
        : COURSE_IMPORT_PRODUCTION_URL,
    guideAssets,
    mutations: revision.mutations,
  });
}

function preparationInput(
  overrides: Partial<ReleasedContentBlockRevisionAssetPreparationInput> = {},
): ReleasedContentBlockRevisionAssetPreparationInput {
  return {
    options: {
      execute: true,
      allowProduction: false,
      confirmation,
      stateRoot: "/tmp/released-content-revision-asset-test-state",
    },
    targetManifest,
    guideAssets,
    mutations: revision.mutations,
    clientPayloadSha256: payloadSha256,
    expectedConfirmation: confirmation,
    sourceRoot: process.cwd(),
    environment: {
      url: COURSE_IMPORT_TEST_URL,
      serviceRoleKey: "non-empty-test-service-role-key",
    },
    plan: {
      phase: "released_content_block_revision_asset_plan",
      approved_asset_count: 19,
    },
    ...overrides,
  };
}

function preparationHarness() {
  const events: string[] = [];
  const dependencies:
    ReleasedContentBlockRevisionAssetPreparationDependencies<FakeClient> = {
      classifyEnvironment: vi.fn(assertCourseImportEnvironment),
      createClient: vi.fn(() => ({
        name: "revision-asset-client" as const,
      })),
      invalidateReceipt: vi.fn(async () => {
        events.push("invalidate");
      }),
      uploadGuideAssets: vi.fn(async (_client, input) => {
        events.push("upload");
        expect(input.assets).toEqual(guideAssets);
      }),
      verifyGuideAssets: vi.fn(async (_client, assets) => {
        events.push("verify");
        expect(assets).toEqual(guideAssets);
        return [];
      }),
      writeReceipt: vi.fn(async (_path, expected) => {
        events.push("receipt");
        return {
          schema_version: 1 as const,
          receipt_type:
            "released_content_block_revision_assets_v1" as const,
          status: "complete" as const,
          ...expected,
          verified_at: "2026-07-26T12:00:00.000Z",
          receipt_sha256: "b".repeat(64),
        };
      }),
      log: vi.fn(),
    };
  return { dependencies, events };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true })
    ),
  );
  vi.restoreAllMocks();
});

describe("released content block revision guide assets", () => {
  it("selects only the exact 19 checksum-bound PDFs used by guide mutations", () => {
    expect(guideAssets).toHaveLength(19);
    expect(guideAssets.map((asset) => asset.source_key)).toEqual(
      Array.from(
        { length: 19 },
        (_, index) =>
          `guide-slot-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(guideAssets.every((asset) =>
      asset.approval_status === "approved" &&
      asset.mime_type === "application/pdf" &&
      asset.storage_path.includes(asset.checksum_sha256!)
    )).toBe(true);
    expect(guideAssets.reduce(
      (total, asset) => total + asset.size_bytes!,
      0,
    )).toBe(965_833);
  });

  it("refuses a missing, duplicated, or mutation-mismatched guide asset", () => {
    expect(() => selectReleasedContentBlockRevisionGuideAssets(
      guideAssets.slice(1),
      revision.mutations,
    )).toThrow(/exact 19 guide assets/i);
    expect(() => selectReleasedContentBlockRevisionGuideAssets(
      [...guideAssets, guideAssets[0]],
      revision.mutations,
    )).toThrow(/exact 19 guide assets/i);
    expect(() => selectReleasedContentBlockRevisionGuideAssets(
      guideAssets.map((asset, index) =>
        index === 0
          ? { ...asset, checksum_sha256: "f".repeat(64) }
          : asset
      ),
      revision.mutations,
    )).toThrow(/does not match its exact guide mutation/i);

    const withoutOneGuideMutation = revision.mutations.filter(
      (mutation) => mutation.source_key !== "block-guide-pdf-slot-01",
    );
    expect(() => selectReleasedContentBlockRevisionGuideAssets(
      guideAssets,
      withoutOneGuideMutation,
    )).toThrow(/exactly 19 guide mutations/i);

    const duplicatedPathMutations = revision.mutations.map(
      (mutation, index) =>
        index === 1
          ? {
              ...mutation,
              replacement_content: {
                ...mutation.replacement_content,
                file_path:
                  revision.mutations[0].replacement_content.file_path,
              },
            }
          : mutation,
    );
    expect(() => selectReleasedContentBlockRevisionGuideAssets(
      guideAssets,
      duplicatedPathMutations,
    )).toThrow(/19 unique storage paths/i);
  });
});

describe("released content block revision asset receipt", () => {
  it("cannot collide with a generic full course-import receipt", () => {
    const stateRoot = "/tmp/revision-receipt-collision-proof";
    const revisionExpectation = expectation("production");
    const revisionPath = releasedContentBlockRevisionAssetReceiptPath(
      stateRoot,
      revisionExpectation,
    );
    const genericExpectation = buildUploadReceiptExpectation({
      manifestBytes: targetManifest,
      importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
      scope: "full",
      environment: "production",
      environmentUrl: COURSE_IMPORT_PRODUCTION_URL,
      assets: validation.value.assets,
    });
    const genericPath = uploadReceiptPath(stateRoot, genericExpectation);

    expect(revisionPath).not.toBe(genericPath);
    expect(revisionPath).toMatch(
      /released-content-block-revision-receipts\/bmh-employee-training-v1\.[0-9a-f]{64}\.[0-9a-f]{64}\.guides-v1\.production\.json$/,
    );
    expect(genericPath).toMatch(
      /upload-receipts\/bmh-employee-training-v1\.full\.production\.json$/,
    );
  });

  it("partitions receipt history by target manifest, payload, and environment", () => {
    const current = expectation("test");
    const root = "/tmp/revision-receipt-history";
    const currentPath = releasedContentBlockRevisionAssetReceiptPath(
      root,
      current,
    );

    expect(releasedContentBlockRevisionAssetReceiptPath(root, {
      ...current,
      target_manifest_sha256: "c".repeat(64),
    })).not.toBe(currentPath);
    expect(releasedContentBlockRevisionAssetReceiptPath(root, {
      ...current,
      client_payload_sha256: "d".repeat(64),
    })).not.toBe(currentPath);
    expect(releasedContentBlockRevisionAssetReceiptPath(root, {
      ...current,
      environment: "production",
    })).not.toBe(currentPath);
  });

  it("leaves the generic full receipt byte-for-byte unchanged", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "revision-receipt-preservation-"),
    );
    temporaryDirectories.push(directory);
    const genericExpectation = buildUploadReceiptExpectation({
      manifestBytes: targetManifest,
      importId: RELEASED_CONTENT_BLOCK_REVISION.importId,
      scope: "full",
      environment: "production",
      environmentUrl: COURSE_IMPORT_PRODUCTION_URL,
      assets: validation.value.assets,
    });
    const genericPath = uploadReceiptPath(directory, genericExpectation);
    await writeCompletedUploadReceipt(
      genericPath,
      genericExpectation,
      "2026-07-26T12:00:00.000Z",
    );
    const before = await readFile(genericPath);
    const revisionExpectation = expectation("production");
    await invalidateReleasedContentBlockRevisionAssetReceipt(
      releasedContentBlockRevisionAssetReceiptPath(
        directory,
        revisionExpectation,
      ),
    );

    expect(await readFile(genericPath)).toEqual(before);
  });

  it("round-trips only the exact manifest, payload, environment, and 19-guide set", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "revision-asset-receipt-"),
    );
    temporaryDirectories.push(directory);
    const expected = expectation();
    const path = releasedContentBlockRevisionAssetReceiptPath(
      directory,
      expected,
    );
    const written =
      await writeCompletedReleasedContentBlockRevisionAssetReceipt(
        path,
        expected,
        "2026-07-26T12:00:00.000Z",
      );

    await expect(
      assertCompletedReleasedContentBlockRevisionAssetReceipt(
        path,
        expected,
      ),
    ).resolves.toEqual(written);
    expect(written.approved_asset_count).toBe(19);
    expect(written.receipt_type).toBe(
      "released_content_block_revision_assets_v1",
    );

    await expect(
      assertCompletedReleasedContentBlockRevisionAssetReceipt(path, {
        ...expected,
        client_payload_sha256: "f".repeat(64),
      }),
    ).rejects.toThrow(/client_payload_sha256 does not match/i);
  });

  it("rejects a generic receipt even if copied onto the revision path", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "revision-asset-generic-receipt-"),
    );
    temporaryDirectories.push(directory);
    const expected = expectation();
    const path = releasedContentBlockRevisionAssetReceiptPath(
      directory,
      expected,
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({
      schema_version: 1,
      status: "complete",
      import_id: expected.import_id,
      scope: "full",
      environment: expected.environment,
    }));

    await expect(
      assertCompletedReleasedContentBlockRevisionAssetReceipt(
        path,
        expected,
      ),
    ).rejects.toThrow(/fields are not exact|receipt_type/i);
  });

  it.each([
    ["import_id", "different-import"],
    ["operation", "different-operation"],
    ["environment", "production"],
    ["environment_url", COURSE_IMPORT_PRODUCTION_URL],
    ["target_manifest_sha256", "c".repeat(64)],
    ["client_payload_sha256", "d".repeat(64)],
    ["approved_assets_sha256", "e".repeat(64)],
    ["approved_asset_count", 18],
  ])("rejects receipt expectation mismatch: %s", async (key, value) => {
    const directory = await mkdtemp(
      join(tmpdir(), "revision-asset-mismatch-"),
    );
    temporaryDirectories.push(directory);
    const expected = expectation();
    const path = releasedContentBlockRevisionAssetReceiptPath(
      directory,
      expected,
    );
    await writeCompletedReleasedContentBlockRevisionAssetReceipt(
      path,
      expected,
      "2026-07-26T12:00:00.000Z",
    );

    await expect(
      assertCompletedReleasedContentBlockRevisionAssetReceipt(
        path,
        {
          ...expected,
          [key]: value,
        } as ReleasedContentBlockRevisionAssetReceiptExpectation,
      ),
    ).rejects.toThrow(new RegExp(`${key} does not match`, "i"));
  });
});

describe("released content block revision asset preparation", () => {
  it("keeps preparation dry runs offline", async () => {
    const harness = preparationHarness();
    const input = preparationInput({
      options: {
        ...preparationInput().options,
        execute: false,
      },
      environment: {
        url: undefined,
        serviceRoleKey: undefined,
      },
    });

    await expect(
      runReleasedContentBlockRevisionAssetPreparation(
        input,
        harness.dependencies,
      ),
    ).resolves.toEqual({ status: "dry_run" });
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
    expect(harness.dependencies.invalidateReceipt).not.toHaveBeenCalled();
    expect(harness.dependencies.uploadGuideAssets).not.toHaveBeenCalled();
  });

  it("requires exact confirmation, non-empty service role, and production opt-in", async () => {
    const missingConfirmation = preparationHarness();
    await expect(
      runReleasedContentBlockRevisionAssetPreparation(
        preparationInput({
          options: {
            ...preparationInput().options,
            confirmation: undefined,
          },
        }),
        missingConfirmation.dependencies,
      ),
    ).rejects.toThrow(/confirmation must equal/i);
    expect(
      missingConfirmation.dependencies.createClient,
    ).not.toHaveBeenCalled();

    const emptyKey = preparationHarness();
    await expect(
      runReleasedContentBlockRevisionAssetPreparation(
        preparationInput({
          environment: {
            url: COURSE_IMPORT_TEST_URL,
            serviceRoleKey: " ",
          },
        }),
        emptyKey.dependencies,
      ),
    ).rejects.toThrow(/service_role_key must be set and non-empty/i);

    const production = preparationHarness();
    await expect(
      runReleasedContentBlockRevisionAssetPreparation(
        preparationInput({
          environment: {
            url: COURSE_IMPORT_PRODUCTION_URL,
            serviceRoleKey: "non-empty-production-placeholder",
          },
        }),
        production.dependencies,
      ),
    ).rejects.toThrow(/production writes are blocked/i);
  });

  it("invalidates only its own receipt, uploads and byte-verifies exactly 19 guides, then writes receipt", async () => {
    const harness = preparationHarness();

    await expect(
      runReleasedContentBlockRevisionAssetPreparation(
        preparationInput(),
        harness.dependencies,
      ),
    ).resolves.toMatchObject({
      status: "prepared",
      environment: "test",
      approvedAssetCount: 19,
    });
    expect(harness.events).toEqual([
      "invalidate",
      "upload",
      "verify",
      "receipt",
    ]);
    const receiptPath = vi.mocked(
      harness.dependencies.invalidateReceipt,
    ).mock.calls[0]?.[0];
    expect(receiptPath).toMatch(
      /released-content-block-revision-receipts\/.*\.guides-v1\.test\.json$/,
    );
    expect(receiptPath).not.toContain("/upload-receipts/");
  });

  it("does not write a receipt if byte verification fails", async () => {
    const harness = preparationHarness();
    vi.mocked(harness.dependencies.verifyGuideAssets).mockResolvedValue([{
      path: guideAssets[0].storage_path,
      problem: "remote bytes SHA-256 does not match",
    }]);

    await expect(
      runReleasedContentBlockRevisionAssetPreparation(
        preparationInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow(/remote bytes sha-256 does not match/i);
    expect(harness.dependencies.writeReceipt).not.toHaveBeenCalled();
  });

  it("does not write a receipt if upload fails", async () => {
    const harness = preparationHarness();
    vi.mocked(harness.dependencies.uploadGuideAssets).mockRejectedValue(
      new Error("guide upload failed"),
    );

    await expect(
      runReleasedContentBlockRevisionAssetPreparation(
        preparationInput(),
        harness.dependencies,
      ),
    ).rejects.toThrow("guide upload failed");
    expect(harness.dependencies.verifyGuideAssets).not.toHaveBeenCalled();
    expect(harness.dependencies.writeReceipt).not.toHaveBeenCalled();
  });

  it("rejects caller-substituted PDFs before creating a client", async () => {
    const harness = preparationHarness();
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
      runReleasedContentBlockRevisionAssetPreparation(
        preparationInput({ guideAssets: substituted }),
        harness.dependencies,
      ),
    ).rejects.toThrow(/exact 19 guide assets/i);
    expect(harness.dependencies.createClient).not.toHaveBeenCalled();
    expect(harness.dependencies.invalidateReceipt).not.toHaveBeenCalled();
  });
});

describe("released content block revision CLI options", () => {
  it("separates prepare-assets from apply and preserves all execution gates", () => {
    const prepare = parseReleasedContentBlockRevisionCliOptions([
      "prepare-assets",
      "custom.json",
      "--execute",
      "--allow-production",
      "--confirm=exact-confirmation",
      "--state-root=state",
      "--source-root=source",
    ], {
      cwd: "/tmp/revision-cli",
      defaultManifest: "default.json",
    });
    expect(prepare).toEqual({
      mode: "prepare-assets",
      manifestPath: "custom.json",
      execute: true,
      allowProduction: true,
      confirmation: "exact-confirmation",
      stateRoot: "/tmp/revision-cli/state",
      sourceRoot: "/tmp/revision-cli/source",
    });

    expect(parseReleasedContentBlockRevisionCliOptions([], {
      cwd: "/tmp/revision-cli",
      defaultManifest: "default.json",
    })).toMatchObject({
      mode: "apply",
      manifestPath: "default.json",
      execute: false,
      allowProduction: false,
      confirmation: undefined,
    });
  });

  it("refuses ambiguous extra positional arguments", () => {
    expect(() => parseReleasedContentBlockRevisionCliOptions([
      "prepare-assets",
      "manifest.json",
      "unexpected.json",
    ], {
      cwd: "/tmp/revision-cli",
      defaultManifest: "default.json",
    })).toThrow(/one mode and one manifest path/i);
  });
});
