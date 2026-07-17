import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CourseImportAdapter } from "./execute";
import { buildImportPlan } from "./operations";
import {
  readDatabaseRollbackReceipt,
  settleDatabaseRollback,
} from "./rollback-settlement";
import { validCourseManifest } from "./test-fixtures";

describe("database rollback settlement", () => {
  it("persists a successful receipt and reuses it without a second mutation", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const receiptPath = await temporaryReceiptPath();
    let rollbackCalls = 0;
    const adapter = adapterFor({
      rollback: async () => {
        rollbackCalls += 1;
        return {
          status: "rolled_back",
          import_id: plan.importId,
          owned_id_count: plan.operations.length,
        };
      },
    });

    const first = await settleDatabaseRollback({
      plan,
      adapter,
      receiptPath,
      now: () => new Date("2026-07-16T00:00:00.000Z"),
    });
    const second = await settleDatabaseRollback({ plan, adapter, receiptPath });

    expect(first).toMatchObject({ reused: false, receipt: { database_state: "rolled_back" } });
    expect(second).toEqual({ reused: true, receipt: first.receipt });
    expect(rollbackCalls).toBe(1);
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual(first.receipt);
  });

  it("settles a retry as already absent when every planned row is gone", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const result = await settleDatabaseRollback({
      plan,
      adapter: adapterFor({
        rollback: async () => {
          throw new Error("Rollback refused: unknown programs ID.");
        },
      }),
      receiptPath: await temporaryReceiptPath(),
    });

    expect(result.receipt.database_state).toBe("already_absent");
    expect(result.receipt.owned_id_count).toBe(plan.operations.length);
  });

  it("does not hide a failed rollback when any planned row remains", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const remaining = plan.operations[0];
    const adapter = adapterFor({
      rollback: async () => {
        throw new Error("blocked by learner activity");
      },
      readRows: async (table, ids) =>
        table === remaining.table && ids.includes(remaining.id)
          ? new Map([[remaining.id, remaining.row]])
          : new Map(),
    });

    await expect(
      settleDatabaseRollback({ plan, adapter, receiptPath: await temporaryReceiptPath() }),
    ).rejects.toThrow("blocked by learner activity");
  });

  it("fails closed on a receipt for a different plan", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const receiptPath = await temporaryReceiptPath();
    await settleDatabaseRollback({ plan, adapter: adapterFor(), receiptPath });
    const changed = buildImportPlan({ ...validCourseManifest(), import_id: "different-v1" });

    await expect(readDatabaseRollbackReceipt(receiptPath, changed)).rejects.toThrow(
      /does not match/,
    );
  });

  it("fails closed when a row reappears after a receipt was recorded", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const receiptPath = await temporaryReceiptPath();
    await settleDatabaseRollback({ plan, adapter: adapterFor(), receiptPath });
    const remaining = plan.operations[0];

    await expect(settleDatabaseRollback({
      plan,
      receiptPath,
      adapter: adapterFor({
        readRows: async (table, ids) =>
          table === remaining.table && ids.includes(remaining.id)
            ? new Map([[remaining.id, remaining.row]])
            : new Map(),
      }),
    })).rejects.toThrow(/receipt exists.*rows are present/i);
  });
});

function adapterFor(overrides: {
  rollback?: CourseImportAdapter["rollbackAtomically"];
  readRows?: CourseImportAdapter["readRows"];
} = {}): CourseImportAdapter {
  return {
    async applyAtomically() {
      throw new Error("not used");
    },
    readRows: overrides.readRows ?? (async () => new Map()),
    rollbackAtomically: overrides.rollback ?? (async (importId, ownedIds) => ({
      status: "rolled_back",
      import_id: importId,
      owned_id_count: Object.values(ownedIds).reduce((sum, entries) => sum + entries.length, 0),
    })),
  };
}

async function temporaryReceiptPath() {
  return join(await mkdtemp(join(tmpdir(), "bmh-rollback-receipt-")), "receipt.json");
}
