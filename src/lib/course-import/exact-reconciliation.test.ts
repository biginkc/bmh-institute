import { describe, expect, it } from "vitest";

import { buildImportPlan } from "./operations";
import { MANAGED_IMPORT_TABLES, reconcileImportPlanExact, type ExactCourseImportAdapter, type ManagedIdInventory } from "./exact-reconciliation";
import { validCourseManifest } from "./test-fixtures";

function adapter(extra = false, mutate?: (inventory: ManagedIdInventory) => void): ExactCourseImportAdapter {
  const plan = buildImportPlan(validCourseManifest());
  const rows = new Map(plan.operations.map((operation) => [operation.id, operation.row]));
  const inventory = Object.fromEntries([...Map.groupBy(plan.operations, (operation) => operation.table).entries()].map(
    ([table, operations]) => [table, operations.map((operation) => operation.id)],
  )) as ManagedIdInventory;
  for (const table of MANAGED_IMPORT_TABLES) {
    inventory[table] ??= [];
  }
  if (extra) inventory.content_blocks.push("00000000-0000-4000-8000-000000000999");
  mutate?.(inventory);
  return {
    async applyAtomically() { return null; },
    async rollbackAtomically() { return null; },
    async readRows(_table, ids) { return new Map(ids.map((id) => [id, rows.get(id)!])); },
    async readManagedIds() { return inventory; },
    async readCatalogSha256() { return "a".repeat(64); },
  };
}

describe("exact managed graph reconciliation", () => {
  it("reports a managed row that the manifest did not plan", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const report = await reconcileImportPlanExact(plan, adapter(true));
    expect(report.missing).toEqual([]);
    expect(report.mismatches).toEqual([]);
    expect(report.unexpected).toEqual([{ table: "content_blocks", id: "00000000-0000-4000-8000-000000000999" }]);
  });

  it("detects unexpected direct course access even though the import plans none", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const id = "00000000-0000-4000-8000-000000000998";
    const report = await reconcileImportPlanExact(plan, adapter(false, (inventory) => inventory.course_access.push(id)));
    expect(report.unexpected).toContainEqual({ table: "course_access", id });
  });

  it("normalizes adapter ordering before hashing", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const forward = await reconcileImportPlanExact(plan, adapter());
    const reversed = await reconcileImportPlanExact(plan, adapter(false, (inventory) => {
      for (const ids of Object.values(inventory)) ids.reverse();
    }));
    expect(reversed.inventorySha256).toBe(forward.inventorySha256);
  });

  it("rejects duplicate, missing, and unknown managed inventory keys", async () => {
    const plan = buildImportPlan(validCourseManifest());
    await expect(reconcileImportPlanExact(plan, adapter(false, (inventory) => inventory.lessons.push(inventory.lessons[0])))).rejects.toThrow(/duplicate IDs/);
    const missing = adapter();
    const originalMissing = missing.readManagedIds;
    missing.readManagedIds = async (importId) => {
      const inventory = await originalMissing(importId) as ManagedIdInventory;
      delete (inventory as Partial<ManagedIdInventory>).course_access;
      return inventory;
    };
    await expect(reconcileImportPlanExact(plan, missing)).rejects.toThrow(/missing: course_access/);
    const unknown = adapter();
    const originalUnknown = unknown.readManagedIds;
    unknown.readManagedIds = async (importId) => ({ ...(await originalUnknown(importId) as ManagedIdInventory), rogue_table: [] });
    await expect(reconcileImportPlanExact(plan, unknown)).rejects.toThrow(/unknown: rogue_table/);
  });
});
