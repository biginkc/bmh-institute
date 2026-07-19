import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { atomicImportOperations, buildRollbackOwnedIds } from "./execute";
import { buildImportPlan } from "./operations";
import { validCourseManifest } from "./test-fixtures";

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(URL && ANON && SERVICE_ROLE);
const service = URL && SERVICE_ROLE
  ? createClient(URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function createOwner(): Promise<{ id: string; client: SupabaseClient }> {
  if (!service || !URL || !ANON) throw new Error("Integration environment unavailable.");
  const email = `artwork-provenance-${randomBytes(8).toString("hex")}@bmh.invalid`;
  const password = `${randomBytes(16).toString("base64url")}!Aa1`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Owner creation failed.");
  const id = created.data.user.id;
  const profile = await service.from("profiles").update({ system_role: "owner", status: "active" }).eq("id", id);
  if (profile.error) throw profile.error;
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id, client };
}

describe.skipIf(!envPresent)("catalog artwork provenance migration", () => {
  it("allows only an exact-import claim and rerun, then blocks direct service mutation", async () => {
    if (!service) throw new Error("Service client unavailable.");
    const suffix = randomBytes(8).toString("hex");
    const manifest = validCourseManifest();
    manifest.import_id = `artwork-provenance-${suffix}`;
    manifest.qa_role_group.name = `Artwork provenance ${suffix}`;
    const plan = buildImportPlan(manifest);
    const course = atomicImportOperations(plan).find((operation) => operation.table === "courses");
    if (!course) throw new Error("Course import fixture is missing its course.");
    let imported = false;
    try {
      const inserted = await service.from("courses").insert({
        id: course.id,
        title: "Pre-import provenance course",
      });
      if (inserted.error) throw inserted.error;

      const forgedClaim = await service
        .from("courses")
        .update({ content_import_id: plan.importId })
        .eq("id", course.id);
      expect(forgedClaim.error?.message).toMatch(/exact course-import apply operation/i);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const applied = await service.rpc("fn_apply_course_import", {
          p_import_id: plan.importId,
          p_operations: atomicImportOperations(plan),
        });
        expect(applied.error).toBeNull();
        expect(applied.data).toMatchObject({
          status: "applied",
          import_id: plan.importId,
        });
        imported = true;
      }

      const directUpsert = await service.from("courses").upsert(course.row);
      expect(directUpsert.error?.message).toMatch(/exact course-import apply operation/i);

      const changedPath = `courses/${plan.importId}/thumbnails/changed-${"a".repeat(64)}.webp`;
      const mutation = await service
        .from("courses")
        .update({ thumbnail_path: changedPath })
        .eq("id", course.id);
      expect(mutation.error).not.toBeNull();
    } finally {
      if (imported) {
        const rollback = await service.rpc("fn_rollback_course_import", {
          p_import_id: plan.importId,
          p_owned: buildRollbackOwnedIds(plan),
        });
        if (rollback.error) throw rollback.error;
      } else {
        await service.from("courses").delete().eq("id", course.id);
      }
    }
  });

  it("rejects authenticated provenance creation and atomically binds assignment updates to lessons", async () => {
    if (!service) throw new Error("Service client unavailable.");
    const owner = await createOwner();
    let courseId: string | null = null;
    let assignmentId: string | null = null;
    try {
      const forged = await owner.client.from("courses").insert({
        title: "Forged imported course",
        content_import_id: "forged-v1",
      });
      expect(forged.error).not.toBeNull();

      const course = await service.from("courses").insert({ title: "Assignment integration" }).select("id").single();
      if (course.error || !course.data) throw course.error ?? new Error("Course insert failed.");
      courseId = course.data.id;
      const moduleResult = await service.from("modules").insert({ course_id: courseId, title: "Module", sort_order: 0 }).select("id").single();
      if (moduleResult.error || !moduleResult.data) throw moduleResult.error ?? new Error("Module insert failed.");
      const assignment = await service.from("assignments").insert({
        title: "Before",
        instructions: "Before instructions",
        submission_type: "text",
        requires_review: true,
        rubric: [{ criterion: "Before", description: "Before guidance" }],
      }).select("id").single();
      if (assignment.error || !assignment.data) throw assignment.error ?? new Error("Assignment insert failed.");
      assignmentId = assignment.data.id;
      const lesson = await service.from("lessons").insert({
        module_id: moduleResult.data.id,
        title: "Assignment lesson",
        lesson_type: "assignment",
        assignment_id: assignmentId,
        sort_order: 0,
      }).select("id").single();
      if (lesson.error || !lesson.data) throw lesson.error ?? new Error("Lesson insert failed.");

      const wrong = await owner.client.rpc("fn_update_assignment_for_lesson", {
        p_lesson_id: "00000000-0000-4000-8000-000000000001",
        p_assignment_id: assignmentId,
        p_title: "After",
        p_instructions: "After instructions",
        p_submission_type: "text",
        p_requires_review: true,
        p_rubric: [{ criterion: "After", description: "After guidance" }],
      });
      expect(wrong.error).toBeNull();
      expect(wrong.data).toBe(false);

      const correct = await owner.client.rpc("fn_update_assignment_for_lesson", {
        p_lesson_id: lesson.data.id,
        p_assignment_id: assignmentId,
        p_title: "After",
        p_instructions: "After instructions",
        p_submission_type: "text",
        p_requires_review: true,
        p_rubric: [{ criterion: "After", description: "After guidance" }],
      });
      expect(correct.error).toBeNull();
      expect(correct.data).toBe(true);
    } finally {
      if (courseId) await service.from("courses").delete().eq("id", courseId);
      if (assignmentId) await service.from("assignments").delete().eq("id", assignmentId);
      await service.auth.admin.deleteUser(owner.id);
    }
  });
});
