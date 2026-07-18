import type { ExactCourseImportAdapter } from "./exact-reconciliation";
import type { ImportPlan } from "./operations";
import {
  settleDatabaseRollback,
  type DatabaseRollbackContext,
} from "./rollback-settlement";

export async function runRestartableRollback<TStorageInspection>(options: {
  plan: ImportPlan;
  adapter: ExactCourseImportAdapter;
  receiptPath: string;
  context: DatabaseRollbackContext;
  inspectStorage: () => Promise<TStorageInspection>;
  onDatabaseSettled?: (
    result: Awaited<ReturnType<typeof settleDatabaseRollback>>,
  ) => void | Promise<void>;
}) {
  const databaseRollback = await settleDatabaseRollback({
    plan: options.plan,
    adapter: options.adapter,
    receiptPath: options.receiptPath,
    context: options.context,
  });
  await options.onDatabaseSettled?.(databaseRollback);
  const storageRollback = await options.inspectStorage();
  return { databaseRollback, storageRollback };
}
