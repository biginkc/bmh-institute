import { describe, expect, it } from "vitest";

import {
  POSTGREST_ID_BATCH_SIZE,
  applyImportPlan,
  reconcileImportPlan,
  rollbackImportPlan,
  type CourseImportAdapter,
} from "./execute";
import { buildImportPlan } from "./operations";
import { validCourseManifest } from "./test-fixtures";

function recordingAdapter(plan = buildImportPlan(validCourseManifest())) {
  const writes: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rollbacks: Array<{ importId: string; ownedIds: Record<string, string[]> }> = [];
  const adapter: CourseImportAdapter = {
    async upsert(table, row) { writes.push({ table, row }); },
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
  return { adapter, writes, rollbacks };
}

describe("course import execution", () => {
  it("applies every planned row in dependency order", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const recorder = recordingAdapter();
    await applyImportPlan(plan, recorder.adapter);
    expect(recorder.writes).toHaveLength(plan.operations.length);
    expect(recorder.writes[0].table).toBe("role_groups");
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
    const deletedIds = new Set(Object.values(recorder.rollbacks[0].ownedIds).flat());
    const manifestIds = new Set(plan.operations.map((operation) => operation.id));
    expect(deletedIds).toEqual(manifestIds);
    expect(recorder.rollbacks).toHaveLength(1);
    expect(recorder.rollbacks[0].importId).toBe(plan.importId);
  });

  it("batches reconcile filters and confirms an atomic rollback above 1,292 IDs", async () => {
    const base = buildImportPlan(validCourseManifest());
    const operations = Array.from({ length: 1_293 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      return {
        table: "answer_options" as const,
        action: "upsert" as const,
        id,
        row: { id },
      };
    });
    const plan = { ...base, operations };
    const readBatches: number[] = [];
    const rollbackCalls: number[] = [];
    const adapter: CourseImportAdapter = {
      async upsert() {},
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
});
