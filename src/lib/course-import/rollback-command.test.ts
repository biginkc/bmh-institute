import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CourseImportAdapter } from "./execute";
import { buildImportPlan } from "./operations";
import { runRestartableRollback } from "./rollback-command";
import { validCourseManifest } from "./test-fixtures";

describe("restartable rollback command sequencing", () => {
  it("persists database settlement before storage inspection starts", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const receiptPath = await temporaryReceiptPath();
    const events: string[] = [];

    const result = await runRestartableRollback({
      plan,
      adapter: adapterFor(events),
      receiptPath,
      async onDatabaseSettled() {
        events.push("database-settled");
      },
      async inspectStorage() {
        const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
          database_state: string;
        };
        expect(receipt.database_state).toBe("rolled_back");
        events.push("storage-inspected");
        return { candidates: 0 };
      },
    });

    expect(events).toEqual(["database-rollback", "database-settled", "storage-inspected"]);
    expect(result.storageRollback).toEqual({ candidates: 0 });
  });

  it("keeps the database receipt when later storage inspection fails", async () => {
    const plan = buildImportPlan(validCourseManifest());
    const receiptPath = await temporaryReceiptPath();

    await expect(runRestartableRollback({
      plan,
      adapter: adapterFor(),
      receiptPath,
      async inspectStorage() {
        throw new Error("storage unavailable");
      },
    })).rejects.toThrow("storage unavailable");

    await expect(readFile(receiptPath, "utf8")).resolves.toContain('"database_state": "rolled_back"');
  });
});

function adapterFor(events: string[] = []): CourseImportAdapter {
  return {
    async applyAtomically() {
      throw new Error("not used");
    },
    async readRows() {
      return new Map();
    },
    async rollbackAtomically(importId, ownedIds) {
      events.push("database-rollback");
      return {
        status: "rolled_back",
        import_id: importId,
        owned_id_count: Object.values(ownedIds).reduce(
          (sum, entries) => sum + entries.length,
          0,
        ),
      };
    },
  };
}

async function temporaryReceiptPath() {
  return join(await mkdtemp(join(tmpdir(), "bmh-rollback-command-")), "receipt.json");
}
