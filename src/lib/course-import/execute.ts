import type { ImportPlan, ImportTable } from "./operations";

export const POSTGREST_ID_BATCH_SIZE = 100;

export type RollbackOwnedEntry = { id: string; source_key: string };
export type RollbackOwnedIds = Record<ImportTable, RollbackOwnedEntry[]>;

export interface CourseImportAdapter {
  applyAtomically(importId: string, operations: AtomicImportOperation[]): Promise<unknown>;
  readRows(table: ImportTable, ids: string[]): Promise<Map<string, Record<string, unknown>>>;
  rollbackAtomically(importId: string, ownedIds: RollbackOwnedIds): Promise<unknown>;
}

export type AtomicImportOperation = {
  action: "upsert";
  table: ImportTable;
  source_key: string;
  id: string;
  row: Record<string, unknown>;
};

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
  const response = await adapter.applyAtomically(
    plan.importId,
    atomicImportOperations(plan),
  );
  if (
    !response ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    (response as Record<string, unknown>).status !== "applied" ||
    (response as Record<string, unknown>).import_id !== plan.importId ||
    (response as Record<string, unknown>).operation_count !== plan.operations.length
  ) {
    throw new Error("Atomic course import apply returned an invalid confirmation payload.");
  }
}

export function atomicImportOperations(plan: ImportPlan): AtomicImportOperation[] {
  return plan.operations.map((operation) => ({
    action: operation.action,
    table: operation.table,
    source_key: operation.sourceKey,
    id: operation.id,
    row: operation.row,
  }));
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
  const ownedIds = buildRollbackOwnedIds(plan);
  const response = await adapter.rollbackAtomically(plan.importId, ownedIds);
  const expectedCount = Object.values(ownedIds).reduce((total, entries) => total + entries.length, 0);
  if (
    !response ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    (response as Record<string, unknown>).status !== "rolled_back" ||
    (response as Record<string, unknown>).import_id !== plan.importId ||
    (response as Record<string, unknown>).owned_id_count !== expectedCount
  ) {
    throw new Error("Atomic course import rollback returned an invalid confirmation payload.");
  }
}

export function buildRollbackOwnedIds(plan: ImportPlan): RollbackOwnedIds {
  const grouped = new Map<ImportTable, RollbackOwnedEntry[]>();
  for (const operation of plan.operations) {
    const entries = grouped.get(operation.table) ?? [];
    entries.push({ id: operation.id, source_key: operation.sourceKey });
    grouped.set(operation.table, entries);
  }
  return Object.fromEntries(
    ROLLBACK_ORDER.map((table) => [table, grouped.get(table) ?? []]),
  ) as RollbackOwnedIds;
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
