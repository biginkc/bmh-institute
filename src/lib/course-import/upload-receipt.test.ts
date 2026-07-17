import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COURSE_IMPORT_PRODUCTION_URL,
  COURSE_IMPORT_TEST_URL,
} from "./environment";
import { buildImportPlan } from "./operations";
import { validCourseManifest } from "./test-fixtures";
import {
  applyImportPlanWithUploadReceipt,
  type CourseImportAdapter,
} from "./execute";
import {
  assertCompletedUploadReceipt,
  buildUploadReceiptExpectation,
  invalidateUploadReceipt,
  uploadReceiptPath,
  writeCompletedUploadReceipt,
  type CourseImportEnvironment,
  type CourseImportScope,
} from "./upload-receipt";

describe("course import upload receipts", () => {
  it("accepts a checksum-verified completion receipt for the exact manifest, scope, and environment", async () => {
    const { path, expectation } = await fixture();
    const written = await writeCompletedUploadReceipt(
      path,
      expectation,
      "2026-07-17T12:00:00.000Z",
    );

    await expect(
      assertCompletedUploadReceipt(path, expectation),
    ).resolves.toEqual(written);
  });

  it("fails closed when an upload was interrupted before a completion receipt was written", async () => {
    const { path, expectation } = await fixture();

    await expect(
      assertCompletedUploadReceipt(path, expectation),
    ).rejects.toThrow(/no readable completed upload receipt/i);
  });

  it("invalidates an older completion receipt before a retry so an interrupted retry fails closed", async () => {
    const { path, expectation } = await fixture();
    await writeCompletedUploadReceipt(path, expectation);

    await invalidateUploadReceipt(path);

    await expect(
      assertCompletedUploadReceipt(path, expectation),
    ).rejects.toThrow(/no readable completed upload receipt/i);
  });

  it("fails closed on an explicitly incomplete upload state", async () => {
    const { path, expectation } = await fixture();
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ schema_version: 1, status: "incomplete" }),
      "utf8",
    );

    await expect(
      assertCompletedUploadReceipt(path, expectation),
    ).rejects.toThrow(/receipt is incomplete/i);
  });

  it("fails closed when the manifest bytes changed after upload", async () => {
    const original = await fixture();
    await writeCompletedUploadReceipt(original.path, original.expectation);
    const staleExpectation = expectationFor({
      manifestBytes: `${JSON.stringify(validCourseManifest())}\n`,
    });

    await expect(
      assertCompletedUploadReceipt(original.path, staleExpectation),
    ).rejects.toThrow(/manifest_sha256 does not match/i);
  });

  it("fails closed when a canary receipt is presented for a full apply", async () => {
    const canary = await fixture({ scope: "canary" });
    await writeCompletedUploadReceipt(canary.path, canary.expectation);
    const fullExpectation = expectationFor({ scope: "full" });

    await expect(
      assertCompletedUploadReceipt(canary.path, fullExpectation),
    ).rejects.toThrow(/receipt scope does not match/i);
  });

  it("fails closed when a test receipt is presented for a production apply", async () => {
    const test = await fixture({ environment: "test" });
    await writeCompletedUploadReceipt(test.path, test.expectation);
    const productionExpectation = expectationFor({ environment: "production" });

    await expect(
      assertCompletedUploadReceipt(test.path, productionExpectation),
    ).rejects.toThrow(/receipt environment does not match/i);
  });

  it("fails closed when a receipt was changed after completion", async () => {
    const { path, expectation } = await fixture();
    await writeCompletedUploadReceipt(path, expectation);
    const parsed = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      unknown
    >;
    parsed.approved_asset_count = Number(parsed.approved_asset_count) + 1;
    await writeFile(path, JSON.stringify(parsed), "utf8");

    await expect(
      assertCompletedUploadReceipt(path, expectation),
    ).rejects.toThrow(/receipt checksum verification failed/i);
  });

  it("does not call the atomic database adapter when receipt verification fails", async () => {
    const { path, expectation } = await fixture();
    const plan = buildImportPlan(validCourseManifest());
    let applyCalls = 0;
    const adapter: CourseImportAdapter = {
      async applyAtomically() {
        applyCalls += 1;
        return {
          status: "applied",
          import_id: plan.importId,
          operation_count: plan.operations.length,
        };
      },
      async readRows() {
        throw new Error("readRows must not be called");
      },
      async rollbackAtomically() {
        throw new Error("rollbackAtomically must not be called");
      },
    };

    await expect(
      applyImportPlanWithUploadReceipt({
        plan,
        adapter,
        receiptPath: path,
        uploadExpectation: expectation,
      }),
    ).rejects.toThrow(/no readable completed upload receipt/i);
    expect(applyCalls).toBe(0);
  });

  it("calls the atomic database adapter once after the exact receipt passes", async () => {
    const { path, expectation } = await fixture();
    await writeCompletedUploadReceipt(path, expectation);
    const plan = buildImportPlan(validCourseManifest());
    let applyCalls = 0;
    const adapter: CourseImportAdapter = {
      async applyAtomically() {
        applyCalls += 1;
        return {
          status: "applied",
          import_id: plan.importId,
          operation_count: plan.operations.length,
        };
      },
      async readRows() {
        throw new Error("readRows must not be called");
      },
      async rollbackAtomically() {
        throw new Error("rollbackAtomically must not be called");
      },
    };

    await expect(
      applyImportPlanWithUploadReceipt({
        plan,
        adapter,
        receiptPath: path,
        uploadExpectation: expectation,
      }),
    ).resolves.toBeUndefined();
    expect(applyCalls).toBe(1);
  });
});

async function fixture(
  overrides: {
    scope?: CourseImportScope;
    environment?: CourseImportEnvironment;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "bmh-upload-receipt-"));
  const expectation = expectationFor(overrides);
  return {
    expectation,
    path: uploadReceiptPath(root, expectation),
  };
}

function expectationFor(
  options: {
    manifestBytes?: string;
    scope?: CourseImportScope;
    environment?: CourseImportEnvironment;
  } = {},
) {
  const manifest = validCourseManifest();
  const plan = buildImportPlan(manifest);
  const environment = options.environment ?? "test";
  return buildUploadReceiptExpectation({
    manifestBytes: options.manifestBytes ?? JSON.stringify(manifest),
    importId: plan.importId,
    scope: options.scope ?? "canary",
    environment,
    environmentUrl:
      environment === "test"
        ? COURSE_IMPORT_TEST_URL
        : COURSE_IMPORT_PRODUCTION_URL,
    assets: plan.assets,
  });
}
