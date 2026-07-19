import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceKey);

const service = envPresent
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

async function waitForProfile(userId: string) {
  if (!service) return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (result.data) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Profile was not created for ${userId}`);
}

describe.skipIf(!envPresent)("account authorization", () => {
  it("prevents self-promotion and disables catalog access after suspension", async () => {
    if (!service || !url || !anonKey) {
      throw new Error("Integration environment unavailable.");
    }
    const suffix = randomBytes(8).toString("hex");
    const email = `account-auth-${suffix}@bmh.invalid`;
    const password = `${randomBytes(16).toString("base64url")}!Aa1`;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Learner creation failed.");
    }
    const userId = created.data.user.id;
    await waitForProfile(userId);

    let roleGroupId: string | null = null;
    let courseId: string | null = null;
    let moduleId: string | null = null;
    let lessonId: string | null = null;
    try {
      const profileUpdate = await service
        .from("profiles")
        .update({ status: "active", system_role: "learner" })
        .eq("id", userId);
      if (profileUpdate.error) throw profileUpdate.error;

      const roleGroup = await service
        .from("role_groups")
        .insert({ name: `Account auth ${suffix}` })
        .select("id")
        .single();
      if (roleGroup.error) throw roleGroup.error;
      roleGroupId = roleGroup.data.id;
      const course = await service
        .from("courses")
        .insert({ title: `Account auth ${suffix}`, is_published: true })
        .select("id")
        .single();
      if (course.error) throw course.error;
      courseId = course.data.id;
      const membership = await service.from("user_role_groups").insert({
        user_id: userId,
        role_group_id: roleGroupId,
      });
      if (membership.error) throw membership.error;
      const access = await service.from("course_access").insert({
        course_id: courseId,
        role_group_id: roleGroupId,
      });
      if (access.error) throw access.error;
      const moduleRow = await service
        .from("modules")
        .insert({ course_id: courseId, title: `Account auth module ${suffix}` })
        .select("id")
        .single();
      if (moduleRow.error) throw moduleRow.error;
      moduleId = moduleRow.data.id;
      const lesson = await service
        .from("lessons")
        .insert({
          module_id: moduleId,
          title: `Account auth lesson ${suffix}`,
          lesson_type: "content",
        })
        .select("id")
        .single();
      if (lesson.error) throw lesson.error;
      lessonId = lesson.data.id;

      const learner = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signedIn = await learner.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw signedIn.error;

      const allowedName = await learner
        .from("profiles")
        .update({ full_name: "Learner Safe Name" })
        .eq("id", userId);
      expect(allowedName.error).toBeNull();

      for (const patch of [
        { system_role: "admin" },
        { status: "active" },
        { email: `forged-${email}` },
      ]) {
        const forbidden = await learner
          .from("profiles")
          .update(patch)
          .eq("id", userId);
        expect(forbidden.error).not.toBeNull();
      }

      const profile = await service
        .from("profiles")
        .select("email, full_name, status, system_role")
        .eq("id", userId)
        .single();
      expect(profile.data).toMatchObject({
        email,
        full_name: "Learner Safe Name",
        status: "active",
        system_role: "learner",
      });

      const visibleBeforeSuspension = await learner
        .from("courses")
        .select("id")
        .eq("id", courseId)
        .maybeSingle();
      expect(visibleBeforeSuspension.data?.id).toBe(courseId);

      const unpublished = await service
        .from("courses")
        .update({ is_published: false })
        .eq("id", courseId);
      if (unpublished.error) throw unpublished.error;
      const [hiddenCourse, hiddenLesson, unpublishedUnlock] = await Promise.all([
        learner.from("courses").select("id").eq("id", courseId).maybeSingle(),
        learner.from("lessons").select("id").eq("id", lessonId).maybeSingle(),
        learner.rpc("fn_lesson_is_unlocked", {
          p_user_id: userId,
          p_lesson_id: lessonId,
        }),
      ]);
      expect(hiddenCourse.data).toBeNull();
      expect(hiddenLesson.data).toBeNull();
      expect(unpublishedUnlock.data).toBe(false);

      const republished = await service
        .from("courses")
        .update({ is_published: true })
        .eq("id", courseId);
      if (republished.error) throw republished.error;

      const suspended = await service
        .from("profiles")
        .update({ status: "suspended" })
        .eq("id", userId);
      if (suspended.error) throw suspended.error;

      const visibleAfterSuspension = await learner
        .from("courses")
        .select("id")
        .eq("id", courseId)
        .maybeSingle();
      expect(visibleAfterSuspension.data).toBeNull();
      const functionAccess = await learner.rpc("fn_user_has_course_access", {
        p_user_id: userId,
        p_course_id: courseId,
      });
      expect(functionAccess.data).toBe(false);
    } finally {
      await service.auth.admin.deleteUser(userId).catch(() => undefined);
      if (lessonId) await service.from("lessons").delete().eq("id", lessonId);
      if (moduleId) await service.from("modules").delete().eq("id", moduleId);
      if (courseId) await service.from("courses").delete().eq("id", courseId);
      if (roleGroupId) {
        await service.from("role_groups").delete().eq("id", roleGroupId);
      }
    }
  });
});
