import { describe, expect, it } from "vitest";

import {
  POSTGREST_ID_BATCH_SIZE,
  applyImportPlan,
  reconcileImportPlan,
  rollbackImportPlan,
  type CourseImportAdapter,
  type RollbackOwnedIds,
} from "./execute";
import { buildImportPlan, deterministicImportId } from "./operations";
import { validCourseManifest } from "./test-fixtures";

function recordingAdapter(plan = buildImportPlan(validCourseManifest())) {
  const applies: Array<{
    importId: string;
    operations: Parameters<CourseImportAdapter["applyAtomically"]>[1];
  }> = [];
  const rollbacks: Array<{ importId: string; ownedIds: RollbackOwnedIds }> = [];
  const adapter: CourseImportAdapter = {
    async applyAtomically(importId, operations) {
      applies.push({ importId, operations });
      return { status: "applied", import_id: importId, operation_count: operations.length };
    },
    async readRows(table, ids) {
      return new Map(
        plan.operations
          .filter((operation) => operation.table === table && ids.includes(operation.id))
          .map((operation) => [operation.id, operation.row]),
      );
    },
    async rollbackAtomically(importId, ownedIds) {
      rollbacks.push({ importId, ownedIds });
      return {
        status: "rolled_back",
        import_id: importId,
        owned_id_count: Object.values(ownedIds).flat().length,
      };
    },
  };
  return { adapter, applies, rollbacks };
}

describe("course import execution", () => {
  it("sends the exact plan to one atomic apply call", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const recorder = recordingAdapter();
    await applyImportPlan(plan, recorder.adapter);
    expect(recorder.applies).toHaveLength(1);
    expect(recorder.applies[0].importId).toBe(plan.importId);
    expect(recorder.applies[0].operations).toHaveLength(plan.operations.length);
    expect(recorder.applies[0].operations[0]).toEqual({
      action: "upsert",
      table: "role_groups",
      source_key: plan.operations[0].sourceKey,
      id: plan.operations[0].id,
      row: plan.operations[0].row,
    });
  });

  it("reconciles exact manifest-owned identifiers", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const recorder = recordingAdapter();
    const result = await reconcileImportPlan(plan, recorder.adapter);
    expect(result.missing).toEqual([]);
    expect(result.mismatches).toEqual([]);
    expect(result.checked).toBe(plan.operations.length);
  });

  it("rolls back only deterministic IDs contained in the manifest plan", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const recorder = recordingAdapter();
    await rollbackImportPlan(plan, recorder.adapter);
    const deletedIds = new Set(
      Object.values(recorder.rollbacks[0].ownedIds).flat().map((entry) => entry.id),
    );
    const manifestIds = new Set(plan.operations.map((operation) => operation.id));
    expect(deletedIds).toEqual(manifestIds);
    expect(recorder.rollbacks).toHaveLength(1);
    expect(recorder.rollbacks[0].importId).toBe(plan.importId);
  });

  it("batches reconcile filters and confirms an atomic rollback above 1,292 IDs", async () => {
    const base = buildImportPlan(validCourseManifest());
    const operations = Array.from({ length: 1_293 }, (_, index) => {
      const sourceKey = `bulk-option-${index}`;
      const id = deterministicImportId(base.importId, sourceKey);
      return {
        table: "answer_options" as const,
        action: "upsert" as const,
        sourceKey,
        id,
        row: { id },
      };
    });
    const plan = { ...base, operations };
    const readBatches: number[] = [];
    const rollbackCalls: number[] = [];
    const adapter: CourseImportAdapter = {
      async applyAtomically(importId, atomicOperations) {
        return { status: "applied", import_id: importId, operation_count: atomicOperations.length };
      },
      async readRows(_table, ids) {
        readBatches.push(ids.length);
        return new Map(ids.map((id) => [id, { id }]));
      },
      async rollbackAtomically(_importId, ownedIds) {
        rollbackCalls.push(ownedIds.answer_options.length);
        return {
          status: "rolled_back",
          import_id: plan.importId,
          owned_id_count: 1_293,
        };
      },
    };

    await expect(reconcileImportPlan(plan, adapter)).resolves.toMatchObject({
      checked: 1_293,
      missing: [],
      mismatches: [],
    });
    await rollbackImportPlan(plan, adapter);

    expect(Math.max(...readBatches)).toBeLessThanOrEqual(POSTGREST_ID_BATCH_SIZE);
    expect(readBatches).toHaveLength(13);
    expect(rollbackCalls).toEqual([1_293]);
  });

  it("rejects a rollback RPC response that does not confirm the requested plan", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const adapter = recordingAdapter(plan).adapter;
    adapter.rollbackAtomically = async () => ({
      status: "rolled_back",
      import_id: "another-import",
      owned_id_count: plan.operations.length,
    });

    await expect(rollbackImportPlan(plan, adapter)).rejects.toThrow(
      /invalid confirmation payload/i,
    );
  });

  it("rejects an apply RPC response that does not confirm the exact plan", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const adapter = recordingAdapter(plan).adapter;
    adapter.applyAtomically = async () => ({
      status: "applied",
      import_id: plan.importId,
      operation_count: plan.operations.length - 1,
    });

    await expect(applyImportPlan(plan, adapter)).rejects.toThrow(
      /invalid confirmation payload/i,
    );
  });
});
