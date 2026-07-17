import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  applyImportPlan,
  atomicImportOperations,
  buildRollbackOwnedIds,
  type CourseImportAdapter,
} from "@/lib/course-import/execute";
import { buildImportPlan, type ImportPlan } from "@/lib/course-import/operations";
import { validCourseManifest } from "@/lib/course-import/test-fixtures";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceKey);
const service = envPresent
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

function uniquePlan(): ImportPlan {
  const suffix = randomBytes(8).toString("hex");
  const manifest = validCourseManifest();
  manifest.import_id = `release-control-${suffix}`;
  manifest.qa_role_group.name = `Release QA ${suffix}`;
  return buildImportPlan(manifest);
}

function adapter(): CourseImportAdapter {
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
      return new Map(
        (data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
      );
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

describe.skipIf(!envPresent)("imported catalog release control on a test project", () => {
  it("denies generic publication and a second role group while preserving rollback", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const program = atomicImportOperations(plan).find(
      (operation) => operation.table === "programs",
    );
    const course = atomicImportOperations(plan).find(
      (operation) => operation.table === "courses",
    );
    if (!program) throw new Error("Test import program is missing.");
    if (!course) throw new Error("Test import course is missing.");
    let employeeRoleGroupId: string | null = null;

    try {
      await applyImportPlan(plan, adapter());

      const { data: digest, error: digestError } = await service.rpc(
        "fn_course_import_catalog_sha256",
        { p_import_id: plan.importId },
      );
      expect(digestError).toBeNull();
      expect(digest).toMatch(/^[a-f0-9]{64}$/);

      const publish = await service
        .from("programs")
        .update({ is_published: true })
        .eq("id", program.id);
      expect(publish.error?.message).toMatch(/evidence-bound release/i);

      const employee = await service
        .from("role_groups")
        .insert({ name: `Employee release ${randomBytes(8).toString("hex")}` })
        .select("id")
        .single();
      if (employee.error || !employee.data) throw employee.error;
      employeeRoleGroupId = employee.data.id;

      const access = await service.from("program_access").insert({
        program_id: program.id,
        role_group_id: employeeRoleGroupId,
      });
      expect(access.error?.message).toMatch(/limited to its QA role group/i);

      const directCourseAccess = await service.from("course_access").insert({
        course_id: course.id,
        role_group_id: employeeRoleGroupId,
      });
      expect(directCourseAccess.error?.message).toMatch(
        /zero direct access grants/i,
      );

      const malformedRelease = await service.rpc("fn_release_course_import_v1", {
        p_import_id: plan.importId,
        p_program_id: program.id,
        p_employee_role_group_id: employeeRoleGroupId,
        p_evidence: {},
        p_confirmation: "not-a-release",
      });
      expect(malformedRelease.error?.message).toMatch(/confirmation|evidence/i);

      const anonymous = createClient(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const anonymousRelease = await anonymous.rpc("fn_release_course_import_v1", {
        p_import_id: plan.importId,
        p_program_id: program.id,
        p_employee_role_group_id: employeeRoleGroupId,
        p_evidence: {},
        p_confirmation: "not-a-release",
      });
      expect(anonymousRelease.error).not.toBeNull();
    } finally {
      await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      if (employeeRoleGroupId) {
        await service.from("role_groups").delete().eq("id", employeeRoleGroupId);
      }
    }
  });
});
