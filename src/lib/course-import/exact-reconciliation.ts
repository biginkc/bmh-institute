import { createHash } from "node:crypto";

import { reconcileImportPlan, type CourseImportAdapter } from "./execute";
import type { ImportPlan, ImportTable } from "./operations";

export type ManagedReconciliationTable = ImportTable | "course_access";
export type ManagedIdInventory = Record<ManagedReconciliationTable, string[]>;

export const MANAGED_IMPORT_TABLES = [
  "role_groups", "programs", "courses", "program_courses", "modules",
  "quizzes", "assignments", "lessons", "content_blocks", "questions",
  "answer_options", "program_access", "course_access",
] as const satisfies readonly ManagedReconciliationTable[];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTRACT_LITERAL_PATTERN = /(create or replace function public\.fn_course_import_exact_reconciliation_contract\(\)[\s\S]*?select ')([a-f0-9]{64})('::text;)/i;

export function exactReconciliationContractFingerprint(migrationSql: string) {
  const match = CONTRACT_LITERAL_PATTERN.exec(migrationSql);
  if (!match) throw new Error("Exact reconciliation migration has no contract fingerprint.");
  const normalized = migrationSql.slice(0, match.index) +
    match[1] + "0".repeat(64) + match[3] +
    migrationSql.slice(match.index + match[0].length);
  const computed = createHash("sha256").update(normalized).digest("hex");
  if (match[2] !== computed) {
    throw new Error(`Exact reconciliation migration fingerprint is stale (declared ${match[2]}, computed ${computed}).`);
  }
  return computed;
}

export interface ExactCourseImportAdapter extends CourseImportAdapter {
  readManagedIds(importId: string): Promise<unknown>;
  readCatalogSha256(importId: string): Promise<string>;
}

export function expectedManagedIds(plan: ImportPlan): ManagedIdInventory {
  const inventory = Object.fromEntries(
    MANAGED_IMPORT_TABLES.map((table) => [table, []]),
  ) as unknown as ManagedIdInventory;
  for (const operation of plan.operations) inventory[operation.table].push(operation.id);
  for (const ids of Object.values(inventory)) ids.sort();
  return inventory;
}

export function normalizeManagedIdInventory(value: unknown): ManagedIdInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Managed inventory must be an object with the exact managed table keys.");
  }
  const input = value as Record<string, unknown>;
  const expectedKeys = new Set<string>(MANAGED_IMPORT_TABLES);
  const unknownKeys = Object.keys(input).filter((key) => !expectedKeys.has(key)).sort();
  const missingKeys = MANAGED_IMPORT_TABLES.filter((key) => !(key in input));
  if (unknownKeys.length || missingKeys.length) {
    throw new Error(`Managed inventory table keys differ from the closed graph (missing: ${missingKeys.join(", ") || "none"}; unknown: ${unknownKeys.join(", ") || "none"}).`);
  }
  return Object.fromEntries(MANAGED_IMPORT_TABLES.map((table) => {
    const ids = input[table];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
      throw new Error(`Managed inventory ${table} must contain only canonical UUID strings.`);
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Managed inventory ${table} contains duplicate IDs.`);
    }
    return [table, [...ids].sort()];
  })) as ManagedIdInventory;
}

export function unexpectedManagedRows(plan: ImportPlan, actual: ManagedIdInventory) {
  const expected = expectedManagedIds(plan);
  const normalized = normalizeManagedIdInventory(actual);
  const unexpected: Array<{ table: ManagedReconciliationTable; id: string }> = [];
  for (const [table, expectedIds] of Object.entries(expected) as Array<[ManagedReconciliationTable, string[]]>) {
    const allowed = new Set(expectedIds);
    for (const id of normalized[table]) {
      if (!allowed.has(id)) unexpected.push({ table, id });
    }
  }
  return unexpected.sort((left, right) => `${left.table}:${left.id}`.localeCompare(`${right.table}:${right.id}`));
}

export async function reconcileImportPlanExact(plan: ImportPlan, adapter: ExactCourseImportAdapter) {
  const [known, rawInventory, catalogSha256] = await Promise.all([
    reconcileImportPlan(plan, adapter),
    adapter.readManagedIds(plan.importId),
    adapter.readCatalogSha256(plan.importId),
  ]);
  if (!/^[a-f0-9]{64}$/.test(catalogSha256)) throw new Error("Managed catalog reconciliation returned an invalid SHA-256.");
  const inventory = normalizeManagedIdInventory(rawInventory);
  return {
    ...known,
    unexpected: unexpectedManagedRows(plan, inventory),
    catalogSha256,
    inventorySha256: createHash("sha256").update(JSON.stringify(inventory)).digest("hex"),
  };
}

export function assertExactReconciliationClean(input: {
  database: { missing: unknown[]; mismatches: unknown[]; unexpected: unknown[] };
  assetProblems: unknown[];
  unexpectedStorage: unknown[];
}) {
  if (input.database.missing.length || input.database.mismatches.length || input.database.unexpected.length || input.assetProblems.length || input.unexpectedStorage.length) {
    throw new Error("Exact reconciliation failed because database or storage drift exists.");
  }
}
