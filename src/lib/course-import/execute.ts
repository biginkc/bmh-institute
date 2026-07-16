import type { ImportPlan, ImportTable } from "./operations";

export const POSTGREST_ID_BATCH_SIZE = 100;

export interface CourseImportAdapter {
  upsert(table: ImportTable, row: Record<string, unknown>): Promise<void>;
  readRows(table: ImportTable, ids: string[]): Promise<Map<string, Record<string, unknown>>>;
  deleteByIds(table: ImportTable, ids: string[]): Promise<void>;
  assertSafeRollback(plan: ImportPlan): Promise<void>;
}

const ROLLBACK_ORDER: ImportTable[] = [
  "answer_options",
  "questions",
  "content_blocks",
  "lessons",
  "assignments",
  "quizzes",
  "modules",
  "program_access",
  "program_courses",
  "courses",
  "programs",
  "role_groups",
];

export async function applyImportPlan(plan: ImportPlan, adapter: CourseImportAdapter) {
  for (const operation of plan.operations) {
    await adapter.upsert(operation.table, operation.row);
  }
}

export async function reconcileImportPlan(plan: ImportPlan, adapter: CourseImportAdapter) {
  const missing: Array<{ table: ImportTable; id: string }> = [];
  const mismatches: Array<{ table: ImportTable; id: string; fields: string[] }> = [];
  let checked = 0;
  for (const [table, ids] of groupPlanIds(plan).entries()) {
    const existing = new Map<string, Record<string, unknown>>();
    for (const batch of batchIds(ids)) {
      const rows = await adapter.readRows(table, batch);
      rows.forEach((row, id) => existing.set(id, row));
    }
    checked += ids.length;
    for (const id of ids) {
      const actual = existing.get(id);
      if (!actual) {
        missing.push({ table, id });
        continue;
      }
      const expected = plan.operations.find((operation) => operation.table === table && operation.id === id)?.row ?? {};
      const fields = Object.keys(expected).filter(
        (field) => stableJson(actual[field]) !== stableJson(expected[field]),
      );
      if (fields.length > 0) mismatches.push({ table, id, fields });
    }
  }
  return { checked, missing, mismatches };
}

export async function rollbackImportPlan(plan: ImportPlan, adapter: CourseImportAdapter) {
  await adapter.assertSafeRollback(plan);
  const grouped = groupPlanIds(plan);
  for (const table of ROLLBACK_ORDER) {
    const ids = grouped.get(table) ?? [];
    for (const batch of batchIds(ids)) {
      await adapter.deleteByIds(table, batch);
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function groupPlanIds(plan: ImportPlan) {
  const grouped = new Map<ImportTable, string[]>();
  for (const operation of plan.operations) {
    const ids = grouped.get(operation.table) ?? [];
    ids.push(operation.id);
    grouped.set(operation.table, ids);
  }
  return grouped;
}

export function batchIds(ids: string[]) {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += POSTGREST_ID_BATCH_SIZE) {
    batches.push(ids.slice(index, index + POSTGREST_ID_BATCH_SIZE));
  }
  return batches;
}
