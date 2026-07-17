import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  applyImportPlan,
  atomicImportOperations,
  buildRollbackOwnedIds,
  reconcileImportPlan,
  rollbackImportPlan,
  type CourseImportAdapter,
} from "./execute";
import {
  buildImportPlan,
  deterministicImportId,
  type ImportPlan,
  type ImportTable,
} from "./operations";
import { validCourseManifest } from "./test-fixtures";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceKey);
const service = envPresent
  ? createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

function uniquePlan() {
  const suffix = randomBytes(8).toString("hex");
  const manifest = validCourseManifest();
  manifest.import_id = `atomic-apply-${suffix}`;
  manifest.qa_role_group.name = `Atomic import QA ${suffix}`;
  return buildImportPlan(manifest);
}

function serviceAdapter(): CourseImportAdapter {
  if (!service) throw new Error("Test-project service client is unavailable.");
  return {
    async applyAtomically(importId, operations) {
      const { data, error } = await service.rpc("fn_apply_course_import", {
        p_import_id: importId,
        p_operations: operations,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    async readRows(table, ids) {
      const { data, error } = await service.from(table).select("*").in("id", ids);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]));
    },
    async rollbackAtomically(importId, ownedIds) {
      const { data, error } = await service.rpc("fn_rollback_course_import", {
        p_import_id: importId,
        p_owned: ownedIds,
      });
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

async function expectPlanAbsent(plan: ImportPlan) {
  if (!service) throw new Error("Test-project service client is unavailable.");
  const idsByTable = new Map<ImportTable, string[]>();
  for (const operation of plan.operations) {
    idsByTable.set(operation.table, [...(idsByTable.get(operation.table) ?? []), operation.id]);
  }
  for (const [table, ids] of idsByTable) {
    const { count, error } = await service
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("id", ids);
    if (error) throw error;
    expect(count, `${table} must contain no rows from the rejected transaction`).toBe(0);
  }
}

async function cleanup(plan: ImportPlan) {
  if (!service) return;
  const { error } = await service.rpc("fn_rollback_course_import", {
    p_import_id: plan.importId,
    p_owned: buildRollbackOwnedIds(plan),
  });
  if (error && !/unknown .* id/i.test(error.message)) throw error;
}

describe.skipIf(!envPresent)("atomic course import apply on a test project", () => {
  it("rolls back every earlier upsert when a late table constraint fails", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const operations = atomicImportOperations(plan);
    const lateBlock = operations.find((operation) => operation.table === "content_blocks");
    if (!lateBlock) throw new Error("Fixture content block is missing.");
    lateBlock.row = { ...lateBlock.row, block_type: "not-a-block" };

    try {
      const { error } = await service.rpc("fn_apply_course_import", {
        p_import_id: plan.importId,
        p_operations: operations,
      });
      expect(error?.message).toMatch(/content_blocks_block_type_check|check constraint/i);
      await expectPlanAbsent(plan);
    } finally {
      await cleanup(plan);
    }
  });

  it("applies idempotently, reconciles exactly, and rolls back once", async () => {
    const plan = uniquePlan();
    const adapter = serviceAdapter();
    try {
      await expect(applyImportPlan(plan, adapter)).resolves.toBeUndefined();
      await expect(applyImportPlan(plan, adapter)).resolves.toBeUndefined();
      await expect(reconcileImportPlan(plan, adapter)).resolves.toEqual({
        checked: plan.operations.length,
        missing: [],
        mismatches: [],
      });
      await expect(rollbackImportPlan(plan, adapter)).resolves.toBeUndefined();
      await expectPlanAbsent(plan);
    } finally {
      await cleanup(plan);
    }
  });

  it("refuses a same-import manifest shrink and preserves exact rollback ownership", async () => {
    const plan = uniquePlan();
    const adapter = serviceAdapter();
    const droppedBlock = plan.operations.find((operation) => operation.table === "content_blocks");
    if (!droppedBlock) throw new Error("Fixture content block is missing.");
    const reducedPlan: ImportPlan = {
      ...plan,
      operations: plan.operations.filter((operation) => operation.id !== droppedBlock.id),
    };

    try {
      await applyImportPlan(plan, adapter);
      await expect(applyImportPlan(reducedPlan, adapter)).rejects.toThrow(/would strand rows/i);
      await expect(reconcileImportPlan(plan, adapter)).resolves.toEqual({
        checked: plan.operations.length,
        missing: [],
        mismatches: [],
      });
      await expect(rollbackImportPlan(reducedPlan, adapter)).rejects.toThrow(/external content blocks/i);
      await expect(rollbackImportPlan(plan, adapter)).resolves.toBeUndefined();
      await expectPlanAbsent(plan);
    } finally {
      await cleanup(plan);
    }
  });

  it("rejects foreign provenance, publication, and external graph parents before writing", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const cases: Array<{
      mutate: (operations: ReturnType<typeof atomicImportOperations>) => void;
      message: RegExp;
    }> = [
      {
        mutate(operations) {
          const program = operations.find((operation) => operation.table === "programs")!;
          program.row = { ...program.row, content_import_id: "another-import" };
        },
        message: /provenance must match import_id/i,
      },
      {
        mutate(operations) {
          const course = operations.find((operation) => operation.table === "courses")!;
          course.row = { ...course.row, is_published: true };
        },
        message: /must remain unpublished/i,
      },
      {
        mutate(operations) {
          const courseModule = operations.find((operation) => operation.table === "modules")!;
          courseModule.row = {
            ...courseModule.row,
            course_id: "00000000-0000-5000-a000-000000000001",
          };
        },
        message: /closed import graph/i,
      },
    ];

    for (const item of cases) {
      const plan = uniquePlan();
      const operations = atomicImportOperations(plan);
      item.mutate(operations);
      const { error } = await service.rpc("fn_apply_course_import", {
        p_import_id: plan.importId,
        p_operations: operations,
      });
      expect(error?.message).toMatch(item.message);
      await expectPlanAbsent(plan);
    }
  });

  it("rejects a validly shaped row that is disconnected from the import graph", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const operations = atomicImportOperations(plan);
    const quiz = operations.find((operation) => operation.table === "quizzes");
    if (!quiz) throw new Error("Fixture quiz is missing.");
    const sourceKey = "orphan-quiz";
    const id = deterministicImportId(plan.importId, sourceKey);
    operations.push({
      ...quiz,
      id,
      source_key: sourceKey,
      row: { ...quiz.row, id },
    });

    const { error } = await service.rpc("fn_apply_course_import", {
      p_import_id: plan.importId,
      p_operations: operations,
    });
    expect(error?.message).toMatch(/disconnected import row/i);
    await expectPlanAbsent(plan);
  });

  it("does not expose atomic apply to anonymous callers", async () => {
    if (!url || !anonKey) throw new Error("Test-project anonymous client is unavailable.");
    const plan = uniquePlan();
    const anonymous = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anonymous.rpc("fn_apply_course_import", {
      p_import_id: plan.importId,
      p_operations: atomicImportOperations(plan),
    });
    expect(error).not.toBeNull();
    await expectPlanAbsent(plan);
  });
});
