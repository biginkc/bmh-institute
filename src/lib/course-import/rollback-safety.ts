import { batchIds } from "./execute";
import type { ImportPlan, ImportTable } from "./operations";

export type RollbackReferenceTable =
  | "program_courses"
  | "program_access"
  | "course_access";

export type RollbackReferenceReader = (options: {
  table: RollbackReferenceTable;
  column: string;
  ids: string[];
}) => Promise<Array<{ id: string }>>;

export async function assertNoExternalRollbackReferences(
  plan: ImportPlan,
  readRows: RollbackReferenceReader,
) {
  const ids = (table: ImportTable) =>
    plan.operations
      .filter((operation) => operation.table === table)
      .map((operation) => operation.id);
  const checks: Array<{
    table: RollbackReferenceTable;
    columns: Array<{ name: string; ids: string[] }>;
    ownedIds: Set<string>;
  }> = [
    {
      table: "program_courses",
      columns: [
        { name: "program_id", ids: ids("programs") },
        { name: "course_id", ids: ids("courses") },
      ],
      ownedIds: new Set(ids("program_courses")),
    },
    {
      table: "program_access",
      columns: [
        { name: "program_id", ids: ids("programs") },
        { name: "role_group_id", ids: ids("role_groups") },
      ],
      ownedIds: new Set(ids("program_access")),
    },
    {
      table: "course_access",
      columns: [
        { name: "course_id", ids: ids("courses") },
        { name: "role_group_id", ids: ids("role_groups") },
      ],
      ownedIds: new Set(),
    },
  ];

  for (const check of checks) {
    const externalIds = new Set<string>();
    for (const column of check.columns) {
      for (const batch of batchIds(column.ids)) {
        const rows = await readRows({
          table: check.table,
          column: column.name,
          ids: batch,
        });
        rows.forEach((row) => {
          if (!check.ownedIds.has(row.id)) externalIds.add(row.id);
        });
      }
    }
    if (externalIds.size > 0) {
      throw new Error(
        `Rollback blocked: found ${externalIds.size} external ${check.table} reference${externalIds.size === 1 ? "" : "s"} that would be cascade-deleted.`,
      );
    }
  }
}
