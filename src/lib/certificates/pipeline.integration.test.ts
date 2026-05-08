// TEST-02: trigger-driven completion should issue course and program
// certificates through the same pipeline used in production.
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
  for (let i = 0; i < 20; i += 1) {
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

describe.skipIf(!envPresent)(
  "certificate trigger pipeline integration (TEST-02)",
  () => {
    it(
      "issues course and program certificates when required content is completed",
      { timeout: 30_000 },
      async () => {
        if (!admin) throw new Error("Admin client unavailable.");

        const suffix = randomBytes(8).toString("hex");
        let userId: string | null = null;
        let programId: string | null = null;
        let courseId: string | null = null;

        try {
          const { data: created, error: createUserError } =
            await admin.auth.admin.createUser({
              email: `test-02-${suffix}@bmh.invalid`,
              password: `${randomBytes(16).toString("base64url")}!Aa1`,
              email_confirm: true,
            });
          if (createUserError || !created.user) {
            throw createUserError ?? new Error("Failed to create test user.");
          }
          userId = created.user.id;
          await waitForProfile(userId);

          const { data: program, error: programError } = await admin
            .from("programs")
            .insert({
              title: `TEST-02 Program ${suffix}`,
              certificate_enabled: true,
            })
            .select("id")
            .single();
          if (programError || !program) {
            throw programError ?? new Error("Failed to create program.");
          }
          programId = program.id;

          const { data: course, error: courseError } = await admin
            .from("courses")
            .insert({
              title: `TEST-02 Course ${suffix}`,
              certificate_enabled: true,
            })
            .select("id")
            .single();
          if (courseError || !course) {
            throw courseError ?? new Error("Failed to create course.");
          }
          courseId = course.id;

          const { error: attachError } = await admin
            .from("program_courses")
            .insert({ program_id: programId, course_id: courseId });
          if (attachError) throw attachError;

          const { data: moduleRow, error: moduleError } = await admin
            .from("modules")
            .insert({
              course_id: courseId,
              title: `TEST-02 Module ${suffix}`,
            })
            .select("id")
            .single();
          if (moduleError || !moduleRow) {
            throw moduleError ?? new Error("Failed to create module.");
          }

          const { data: lesson, error: lessonError } = await admin
            .from("lessons")
            .insert({
              module_id: moduleRow.id,
              title: `TEST-02 Lesson ${suffix}`,
              lesson_type: "content",
              is_required_for_completion: true,
            })
            .select("id")
            .single();
          if (lessonError || !lesson) {
            throw lessonError ?? new Error("Failed to create lesson.");
          }

          const { data: block, error: blockError } = await admin
            .from("content_blocks")
            .insert({
              lesson_id: lesson.id,
              block_type: "text",
              content: { html: "<p>Done</p>" },
              is_required_for_completion: true,
            })
            .select("id")
            .single();
          if (blockError || !block) {
            throw blockError ?? new Error("Failed to create content block.");
          }

          const { error: progressError } = await admin
            .from("user_block_progress")
            .insert({ user_id: userId, block_id: block.id });
          if (progressError) throw progressError;

          const { data: lessonCompletion } = await admin
            .from("user_lesson_completions")
            .select("id")
            .eq("user_id", userId)
            .eq("lesson_id", lesson.id)
            .maybeSingle();
          expect(lessonCompletion).not.toBeNull();

          const { data: courseCert } = await admin
            .from("certificates")
            .select("certificate_number")
            .eq("user_id", userId)
            .eq("course_id", courseId)
            .maybeSingle();
          expect(courseCert?.certificate_number).toMatch(/^BMH-C-/);

          const { data: programCert } = await admin
            .from("program_certificates")
            .select("certificate_number")
            .eq("user_id", userId)
            .eq("program_id", programId)
            .maybeSingle();
          expect(programCert?.certificate_number).toMatch(/^BMH-P-/);
        } finally {
          if (userId) {
            await admin.auth.admin.deleteUser(userId).catch(() => {});
          }
          if (programId) {
            await admin.from("programs").delete().eq("id", programId);
          }
          if (courseId) {
            await admin.from("courses").delete().eq("id", courseId);
          }
        }
      },
    );
  },
);

