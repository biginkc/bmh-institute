import type { CourseImportAdapter } from "./execute";
import type { ImportPlan } from "./operations";
import { settleDatabaseRollback } from "./rollback-settlement";

export async function runRestartableRollback<TStorageInspection>(options: {
  plan: ImportPlan;
  adapter: CourseImportAdapter;
  receiptPath: string;
  inspectStorage: () => Promise<TStorageInspection>;
  onDatabaseSettled?: (
    result: Awaited<ReturnType<typeof settleDatabaseRollback>>,
  ) => void | Promise<void>;
}) {
  const databaseRollback = await settleDatabaseRollback({
    plan: options.plan,
    adapter: options.adapter,
    receiptPath: options.receiptPath,
  });
  await options.onDatabaseSettled?.(databaseRollback);
  const storageRollback = await options.inspectStorage();
  return { databaseRollback, storageRollback };
}
