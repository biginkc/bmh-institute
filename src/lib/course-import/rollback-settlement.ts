import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

import {
  buildRollbackOwnedIds,
  rollbackImportPlan,
} from "./execute";
import {
  reconcileImportPlanExact,
  type ExactCourseImportAdapter,
} from "./exact-reconciliation";
import type { ImportPlan } from "./operations";

export type DatabaseRollbackReceipt = {
  schema_version: 2;
  import_id: string;
  plan_fingerprint: string;
  owned_id_count: number;
  database_state: "rolled_back" | "already_absent";
  absence_inventory_sha256: string;
  absence_catalog_sha256: string;
  recorded_at: string;
};

export function rollbackPlanFingerprint(plan: ImportPlan) {
  return createHash("sha256")
    .update(JSON.stringify(buildRollbackOwnedIds(plan)))
    .digest("hex");
}

export async function settleDatabaseRollback(options: {
  plan: ImportPlan;
  adapter: ExactCourseImportAdapter;
  receiptPath: string;
  now?: () => Date;
}): Promise<{ receipt: DatabaseRollbackReceipt; reused: boolean }> {
  const existing = await readDatabaseRollbackReceipt(options.receiptPath, options.plan);
  if (existing) {
    const reconciliation = await reconcileImportPlanExact(options.plan, options.adapter);
    assertManagedGraphAbsent(options.plan, reconciliation, "Rollback receipt exists");
    if (
      reconciliation.inventorySha256 !== existing.absence_inventory_sha256 ||
      reconciliation.catalogSha256 !== existing.absence_catalog_sha256
    ) {
      throw new Error("Rollback receipt exists but its exact absence snapshot no longer matches.");
    }
    return { receipt: existing, reused: true };
  }

  let databaseState: DatabaseRollbackReceipt["database_state"] = "rolled_back";
  let rollbackError: unknown = null;
  try {
    await rollbackImportPlan(options.plan, options.adapter);
  } catch (error) {
    rollbackError = error;
  }
  const reconciliation = await reconcileImportPlanExact(options.plan, options.adapter);
  if (rollbackError) {
    try {
      assertManagedGraphAbsent(options.plan, reconciliation, "Rollback failed");
    } catch {
      throw rollbackError;
    }
    databaseState = "already_absent";
  } else {
    assertManagedGraphAbsent(options.plan, reconciliation, "Rollback returned success");
  }

  const receipt: DatabaseRollbackReceipt = {
    schema_version: 2,
    import_id: options.plan.importId,
    plan_fingerprint: rollbackPlanFingerprint(options.plan),
    owned_id_count: options.plan.operations.length,
    database_state: databaseState,
    absence_inventory_sha256: reconciliation.inventorySha256,
    absence_catalog_sha256: reconciliation.catalogSha256,
    recorded_at: (options.now ?? (() => new Date()))().toISOString(),
  };
  await writeJsonAtomically(options.receiptPath, receipt);
  return { receipt, reused: false };
}

function assertManagedGraphAbsent(
  plan: ImportPlan,
  reconciliation: Awaited<ReturnType<typeof reconcileImportPlanExact>>,
  context: string,
) {
  if (
    reconciliation.missing.length !== plan.operations.length ||
    reconciliation.mismatches.length > 0 ||
    reconciliation.unexpected.length > 0
  ) {
    throw new Error(`${context} but planned or unexpected managed database rows are present.`);
  }
}

export async function readDatabaseRollbackReceipt(
  receiptPath: string,
  plan: ImportPlan,
): Promise<DatabaseRollbackReceipt | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(receiptPath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw new Error(`Rollback receipt is unreadable or malformed: ${receiptPath}`, { cause: error });
  }
  const expectedFingerprint = rollbackPlanFingerprint(plan);
  const expectedCount = plan.operations.length;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as DatabaseRollbackReceipt).schema_version !== 2 ||
    (parsed as DatabaseRollbackReceipt).import_id !== plan.importId ||
    (parsed as DatabaseRollbackReceipt).plan_fingerprint !== expectedFingerprint ||
    (parsed as DatabaseRollbackReceipt).owned_id_count !== expectedCount ||
    !["rolled_back", "already_absent"].includes(
      (parsed as DatabaseRollbackReceipt).database_state,
    ) ||
    !/^[a-f0-9]{64}$/.test((parsed as DatabaseRollbackReceipt).absence_inventory_sha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test((parsed as DatabaseRollbackReceipt).absence_catalog_sha256 ?? "") ||
    typeof (parsed as DatabaseRollbackReceipt).recorded_at !== "string"
  ) {
    throw new Error(`Rollback receipt does not match the current import plan: ${receiptPath}`);
  }
  return parsed as DatabaseRollbackReceipt;
}

async function writeJsonAtomically(path: string, value: unknown) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
