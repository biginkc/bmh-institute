import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(SUPABASE_URL && SERVICE_ROLE);

const admin =
  SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

async function waitForProfile(userId: string): Promise<void> {
  if (!admin) return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Profile was not created for ${userId}`);
}

describe.skipIf(!envPresent)("lesson unlock access paths", () => {
  it("ignores inaccessible program ordering and accepts another valid access path", async () => {
    if (!admin) throw new Error("Integration client unavailable.");

    const suffix = randomBytes(8).toString("hex");
    const password = `${randomBytes(16).toString("base64url")}!Aa1`;
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: `unlock-path-${suffix}@bmh.invalid`,
        password,
        email_confirm: true,
      });
    if (createError || !created.user) {
      throw createError ?? new Error("Failed to create learner.");
    }
    const userId = created.user.id;
    await waitForProfile(userId);

    let roleGroupId: string | null = null;
    let priorCourseId: string | null = null;
    let sharedCourseId: string | null = null;
    let inaccessibleProgramId: string | null = null;
    let accessibleProgramId: string | null = null;

    try {
      const { data: roleGroup, error: roleGroupError } = await admin
        .from("role_groups")
        .insert({ name: `Unlock path ${suffix}` })
        .select("id")
        .single();
      if (roleGroupError || !roleGroup) throw roleGroupError;
      roleGroupId = roleGroup.id;

      const { error: membershipError } = await admin
        .from("user_role_groups")
        .insert({ user_id: userId, role_group_id: roleGroupId });
      if (membershipError) throw membershipError;

      const { data: courses, error: coursesError } = await admin
        .from("courses")
        .insert([
          { title: `Prior ${suffix}`, is_published: true },
          { title: `Shared ${suffix}`, is_published: true },
        ])
        .select("id, title");
      if (coursesError || !courses) throw coursesError;
      priorCourseId = courses.find((row) => row.title.startsWith("Prior "))?.id ?? null;
      sharedCourseId = courses.find((row) => row.title.startsWith("Shared "))?.id ?? null;
      if (!priorCourseId || !sharedCourseId) {
        throw new Error("Course fixtures were not created.");
      }

      const { data: modules, error: modulesError } = await admin
        .from("modules")
        .insert([
          { course_id: priorCourseId, title: "Prior module" },
          { course_id: sharedCourseId, title: "Shared module" },
        ])
        .select("id, course_id");
      if (modulesError || !modules) throw modulesError;
      const priorModuleId = modules.find((row) => row.course_id === priorCourseId)?.id;
      const sharedModuleId = modules.find((row) => row.course_id === sharedCourseId)?.id;
      if (!priorModuleId || !sharedModuleId) {
        throw new Error("Module fixtures were not created.");
      }

      const { data: lessons, error: lessonsError } = await admin
        .from("lessons")
        .insert([
          { module_id: priorModuleId, title: "Required prior", lesson_type: "content" },
          { module_id: sharedModuleId, title: "Shared lesson", lesson_type: "content" },
        ])
        .select("id, module_id");
      if (lessonsError || !lessons) throw lessonsError;
      const priorLessonId = lessons.find((row) => row.module_id === priorModuleId)?.id;
      const sharedLessonId = lessons.find((row) => row.module_id === sharedModuleId)?.id;
      if (!priorLessonId || !sharedLessonId) {
        throw new Error("Lesson fixtures were not created.");
      }

      const { error: blockError } = await admin.from("content_blocks").insert({
        lesson_id: priorLessonId,
        block_type: "text",
        content: { markdown: "Required" },
        is_required_for_completion: true,
      });
      if (blockError) throw blockError;

      const { data: programs, error: programsError } = await admin
        .from("programs")
        .insert([
          {
            title: `Inaccessible sequential ${suffix}`,
            course_order_mode: "sequential",
            is_published: true,
          },
          {
            title: `Accessible free ${suffix}`,
            course_order_mode: "free",
            is_published: true,
          },
        ])
        .select("id, course_order_mode");
      if (programsError || !programs) throw programsError;
      inaccessibleProgramId = programs.find(
        (row) => row.course_order_mode === "sequential",
      )?.id ?? null;
      accessibleProgramId = programs.find(
        (row) => row.course_order_mode === "free",
      )?.id ?? null;
      if (!inaccessibleProgramId || !accessibleProgramId) {
        throw new Error("Program fixtures were not created.");
      }

      const { error: linksError } = await admin.from("program_courses").insert([
        {
          program_id: inaccessibleProgramId,
          course_id: priorCourseId,
          sort_order: 0,
        },
        {
          program_id: inaccessibleProgramId,
          course_id: sharedCourseId,
          sort_order: 1,
        },
        {
          program_id: accessibleProgramId,
          course_id: sharedCourseId,
          sort_order: 0,
        },
      ]);
      if (linksError) throw linksError;

      const { error: freeAccessError } = await admin.from("program_access").insert({
        program_id: accessibleProgramId,
        role_group_id: roleGroupId,
      });
      if (freeAccessError) throw freeAccessError;

      const accessible = await admin.rpc("fn_lesson_is_unlocked", {
        p_user_id: userId,
        p_lesson_id: sharedLessonId,
      });
      expect(accessible.error).toBeNull();
      expect(accessible.data).toBe(true);

      const { error: removeFreeError } = await admin
        .from("program_access")
        .delete()
        .eq("program_id", accessibleProgramId)
        .eq("role_group_id", roleGroupId);
      if (removeFreeError) throw removeFreeError;
      const { error: sequentialAccessError } = await admin
        .from("program_access")
        .insert({
          program_id: inaccessibleProgramId,
          role_group_id: roleGroupId,
        });
      if (sequentialAccessError) throw sequentialAccessError;

      const sequentiallyLocked = await admin.rpc("fn_lesson_is_unlocked", {
        p_user_id: userId,
        p_lesson_id: sharedLessonId,
      });
      expect(sequentiallyLocked.error).toBeNull();
      expect(sequentiallyLocked.data).toBe(false);

      const { error: directAccessError } = await admin.from("course_access").insert({
        course_id: sharedCourseId,
        role_group_id: roleGroupId,
      });
      if (directAccessError) throw directAccessError;

      const directlyAccessible = await admin.rpc("fn_lesson_is_unlocked", {
        p_user_id: userId,
        p_lesson_id: sharedLessonId,
      });
      expect(directlyAccessible.error).toBeNull();
      expect(directlyAccessible.data).toBe(true);
    } finally {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      if (inaccessibleProgramId || accessibleProgramId) {
        await admin
          .from("programs")
          .delete()
          .in(
            "id",
            [inaccessibleProgramId, accessibleProgramId].filter(
              (id): id is string => Boolean(id),
            ),
          );
      }
      if (priorCourseId || sharedCourseId) {
        await admin
          .from("courses")
          .delete()
          .in(
            "id",
            [priorCourseId, sharedCourseId].filter(
              (id): id is string => Boolean(id),
            ),
          );
      }
      if (roleGroupId) {
        await admin.from("role_groups").delete().eq("id", roleGroupId);
      }
    }
  });
});
