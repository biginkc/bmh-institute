import { describe, expect, it } from "vitest";

import { applyImportPlan, reconcileImportPlan, rollbackImportPlan, type CourseImportAdapter } from "./execute";
import { buildImportPlan } from "./operations";
import { validCourseManifest } from "./test-fixtures";

function recordingAdapter(plan = buildImportPlan(validCourseManifest())) {
  const writes: Array<{ table: string; row: Record<string, unknown> }> = [];
  const deletes: Array<{ table: string; ids: string[] }> = [];
  const adapter: CourseImportAdapter = {
    async upsert(table, row) { writes.push({ table, row }); },
    async readRows(table, ids) {
      return new Map(
        plan.operations
          .filter((operation) => operation.table === table && ids.includes(operation.id))
          .map((operation) => [operation.id, operation.row]),
      );
    },
    async deleteByIds(table, ids) { deletes.push({ table, ids }); },
    async assertSafeRollback() {},
  };
  return { adapter, writes, deletes };
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
    const deletedIds = new Set(recorder.deletes.flatMap((entry) => entry.ids));
    const manifestIds = new Set(plan.operations.map((operation) => operation.id));
    expect(deletedIds).toEqual(manifestIds);
    expect(recorder.deletes[0].table).toBe("answer_options");
    expect(recorder.deletes.at(-1)?.table).toBe("role_groups");
  });
});
