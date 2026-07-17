import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  applyImportPlan,
  buildRollbackOwnedIds,
  rollbackImportPlan,
} from "./execute";
import {
  exactReconciliationContractFingerprint,
  reconcileImportPlanExact,
  type ExactCourseImportAdapter,
} from "./exact-reconciliation";
import { buildImportPlan, type ImportPlan } from "./operations";
import { validCourseManifest } from "./test-fixtures";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceKey);
const EXACT_RECONCILIATION_CONTRACT = exactReconciliationContractFingerprint(
  readFileSync(join(process.cwd(), "supabase/migrations/032_exact_import_reconciliation.sql"), "utf8"),
);

const service = envPresent
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

function uniquePlan() {
  const suffix = randomBytes(8).toString("hex");
  const manifest = validCourseManifest();
  manifest.import_id = `exact-reconciliation-${suffix}`;
  manifest.qa_role_group.name = `Exact reconciliation QA ${suffix}`;
  return buildImportPlan(manifest);
}

function exactAdapter(): ExactCourseImportAdapter {
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
    async readManagedIds(importId) {
      const { data, error } = await service.rpc("fn_course_import_managed_ids", {
        p_import_id: importId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    async readCatalogSha256(importId) {
      const { data, error } = await service.rpc("fn_course_import_catalog_sha256", {
        p_import_id: importId,
      });
      if (error) throw new Error(error.message);
      if (typeof data !== "string") throw new Error("Catalog hash RPC returned a non-string value.");
      return data;
    },
  };
}

async function cleanupPlan(plan: ImportPlan) {
  if (!service) return;
  const programId = operationId(plan, "programs");
  const { count } = await service
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("id", programId);
  if (!count) return;
  const { error } = await service.rpc("fn_rollback_course_import", {
    p_import_id: plan.importId,
    p_owned: buildRollbackOwnedIds(plan),
  });
  if (error) throw error;
}

function operationId(plan: ImportPlan, table: ImportPlan["operations"][number]["table"]) {
  const operation = plan.operations.find((item) => item.table === table);
  if (!operation) throw new Error(`Fixture operation is missing for ${table}.`);
  return operation.id;
}

describe.skipIf(!envPresent)("exact reconciliation RPCs on a test project", () => {
  it("matches the exact deployed reconciliation contract fingerprint", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const { data, error } = await service.rpc("fn_course_import_exact_reconciliation_contract");
    expect(error).toBeNull();
    expect(data).toBe(EXACT_RECONCILIATION_CONTRACT);
  });

  it("lets service-role reconciliation inventory the exact graph and hash the catalog", async () => {
    const plan = uniquePlan();
    const adapter = exactAdapter();
    try {
      await applyImportPlan(plan, adapter);
      const report = await reconcileImportPlanExact(plan, adapter);
      expect(report.missing).toEqual([]);
      expect(report.mismatches).toEqual([]);
      expect(report.unexpected).toEqual([]);
      expect(report.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.inventorySha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await cleanupPlan(plan);
    }
  });

  it("detects an extra descendant and access edges that escape through the owned QA group", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const adapter = exactAdapter();
    const rogueLessonId = randomUUID();
    const externalProgramId = randomUUID();
    const externalCourseId = randomUUID();
    const externalProgramAccessId = randomUUID();
    const externalCourseAccessId = randomUUID();
    const externalModuleId = randomUUID();
    const externalQuizLessonId = randomUUID();
    const externalAssignmentLessonId = randomUUID();
    const externalPrerequisiteLessonId = randomUUID();
    const roleGroupId = operationId(plan, "role_groups");

    try {
      await applyImportPlan(plan, adapter);
      const cleanCatalogSha256 = await adapter.readCatalogSha256(plan.importId);
      const { error: programError } = await service.from("programs").insert({
        id: externalProgramId,
        title: "External program root",
      });
      if (programError) throw programError;
      const { error: courseError } = await service.from("courses").insert({
        id: externalCourseId,
        title: "External course root",
      });
      if (courseError) throw courseError;
      const { error: moduleError } = await service.from("modules").insert({
        id: externalModuleId,
        course_id: externalCourseId,
        title: "External module root",
      });
      if (moduleError) throw moduleError;
      const { error: externalLessonsError } = await service.from("lessons").insert([
        {
          id: externalQuizLessonId,
          module_id: externalModuleId,
          title: "External lesson referencing an imported quiz",
          lesson_type: "quiz",
          quiz_id: operationId(plan, "quizzes"),
        },
        {
          id: externalAssignmentLessonId,
          module_id: externalModuleId,
          title: "External lesson referencing an imported assignment",
          lesson_type: "assignment",
          assignment_id: operationId(plan, "assignments"),
        },
        {
          id: externalPrerequisiteLessonId,
          module_id: externalModuleId,
          title: "External lesson referencing an imported prerequisite",
          lesson_type: "content",
          prerequisite_lesson_id: operationId(plan, "lessons"),
        },
      ]);
      if (externalLessonsError) throw externalLessonsError;

      const lessonEdgeReport = await reconcileImportPlanExact(plan, adapter);
      expect(lessonEdgeReport.unexpected).toEqual(expect.arrayContaining([
        { table: "lessons", id: externalQuizLessonId },
        { table: "lessons", id: externalAssignmentLessonId },
        { table: "lessons", id: externalPrerequisiteLessonId },
      ]));
      expect(lessonEdgeReport.catalogSha256).not.toBe(cleanCatalogSha256);

      const { error: lessonError } = await service.from("lessons").insert({
        id: rogueLessonId,
        module_id: operationId(plan, "modules"),
        title: "Unplanned managed descendant",
        lesson_type: "content",
        content_import_id: null,
      });
      if (lessonError) throw lessonError;
      const { error: programAccessError } = await service.from("program_access").insert({
        id: externalProgramAccessId,
        program_id: externalProgramId,
        role_group_id: roleGroupId,
      });
      if (programAccessError) throw programAccessError;
      const { error: courseAccessError } = await service.from("course_access").insert({
        id: externalCourseAccessId,
        course_id: externalCourseId,
        role_group_id: roleGroupId,
      });
      if (courseAccessError) throw courseAccessError;

      const report = await reconcileImportPlanExact(plan, adapter);
      expect(report.unexpected).toEqual(expect.arrayContaining([
        { table: "lessons", id: rogueLessonId },
        { table: "program_access", id: externalProgramAccessId },
        { table: "course_access", id: externalCourseAccessId },
        { table: "lessons", id: externalQuizLessonId },
        { table: "lessons", id: externalAssignmentLessonId },
        { table: "lessons", id: externalPrerequisiteLessonId },
      ]));

      await expect(rollbackImportPlan(plan, adapter)).rejects.toThrow(/external program_access references/i);
      await service.from("program_access").delete().eq("id", externalProgramAccessId);
      await expect(rollbackImportPlan(plan, adapter)).rejects.toThrow(/external course_access references/i);
      await service.from("course_access").delete().eq("id", externalCourseAccessId);
      await expect(rollbackImportPlan(plan, adapter)).rejects.toThrow(/external lessons references/i);
    } finally {
      await service.from("course_access").delete().eq("id", externalCourseAccessId);
      await service.from("program_access").delete().eq("id", externalProgramAccessId);
      await service.from("lessons").delete().eq("id", rogueLessonId);
      await service.from("programs").delete().eq("id", externalProgramId);
      await service.from("courses").delete().eq("id", externalCourseId);
      await cleanupPlan(plan);
    }
  });

  it("denies inventory, hashing, and contract execution to anonymous and authenticated callers", async () => {
    if (!service || !url || !anonKey) throw new Error("Test-project clients are unavailable.");
    const anonymous = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const importId = `exact-denied-${randomBytes(8).toString("hex")}`;
    for (const functionName of [
      "fn_course_import_managed_ids",
      "fn_course_import_catalog_sha256",
      "fn_course_import_exact_reconciliation_contract",
    ] as const) {
      const result = functionName === "fn_course_import_exact_reconciliation_contract"
        ? await anonymous.rpc(functionName)
        : await anonymous.rpc(functionName, { p_import_id: importId });
      expect(result.error).not.toBeNull();
    }

    const email = `exact-reconciliation-${randomBytes(8).toString("hex")}@bmh.invalid`;
    const password = `${randomBytes(16).toString("base64url")}!Aa1`;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Could not create exact-reconciliation privilege-test user.");
    }
    try {
      const authenticated = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signedIn = await authenticated.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw signedIn.error;
      for (const functionName of [
        "fn_course_import_managed_ids",
        "fn_course_import_catalog_sha256",
        "fn_course_import_exact_reconciliation_contract",
      ] as const) {
        const result = functionName === "fn_course_import_exact_reconciliation_contract"
          ? await authenticated.rpc(functionName)
          : await authenticated.rpc(functionName, { p_import_id: importId });
        expect(result.error).not.toBeNull();
      }
    } finally {
      await service.auth.admin.deleteUser(created.data.user.id);
    }
  });
});
