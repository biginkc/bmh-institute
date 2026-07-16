import { describe, expect, it } from "vitest";

import { POSTGREST_ID_BATCH_SIZE } from "./execute";
import { buildImportPlan, type ImportPlan } from "./operations";
import { assertNoExternalRollbackReferences } from "./rollback-safety";
import { validCourseManifest } from "./test-fixtures";

describe("course import rollback reference safety", () => {
  it.each([
    ["program_courses", "program_id"],
    ["program_access", "role_group_id"],
    ["course_access", "course_id"],
  ] as const)("blocks an unexplained %s row", async (table, matchingColumn) => {
    const plan = buildImportPlan(validCourseManifest());

    await expect(
      assertNoExternalRollbackReferences(plan, async ({ table: requested, column }) =>
        requested === table && column === matchingColumn ? [{ id: "external-row" }] : [],
      ),
    ).rejects.toThrow(new RegExp(`external ${table} reference`));
  });

  it("allows manifest-owned program joins", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const owned = new Map(
      plan.operations
        .filter(
          (operation) =>
            operation.table === "program_courses" || operation.table === "program_access",
        )
        .map((operation) => [operation.table, operation.id]),
    );

    await expect(
      assertNoExternalRollbackReferences(plan, async ({ table }) => {
        const id = owned.get(table as "program_courses" | "program_access");
        return id ? [{ id }] : [];
      }),
    ).resolves.toBeUndefined();
  });

  it("batches rollback reference filters larger than 1,292 IDs", async () => {
    const base = buildImportPlan(validCourseManifest());
    const plan: ImportPlan = {
      ...base,
      operations: Array.from({ length: 1_293 }, (_, index) => {
        const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
        return { table: "courses", action: "upsert", id, row: { id } };
      }),
    };
    const batchSizes: number[] = [];

    await assertNoExternalRollbackReferences(plan, async ({ ids }) => {
      batchSizes.push(ids.length);
      return [];
    });

    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(POSTGREST_ID_BATCH_SIZE);
    expect(batchSizes).toHaveLength(26);
  });
});
