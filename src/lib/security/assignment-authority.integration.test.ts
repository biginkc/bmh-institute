import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && serviceKey);

function serviceClient() {
  if (!url || !serviceKey) throw new Error("Integration environment unavailable.");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function waitForProfile(userId: string) {
  const admin = serviceClient();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (result.data) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Profile was not created for ${userId}`);
}

describe.skipIf(!envPresent)("assignment database authority", () => {
  it("allows one active submission and exactly one competing review decision", async () => {
    const admin = serviceClient();
    const contenderA = serviceClient();
    const contenderB = serviceClient();
    const suffix = randomBytes(8).toString("hex");
    const created = await admin.auth.admin.createUser({
      email: `assignment-authority-${suffix}@bmh.invalid`,
      password: `${randomBytes(16).toString("base64url")}!Aa1`,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Learner creation failed.");
    }
    const userId = created.data.user.id;
    await waitForProfile(userId);

    let courseId: string | null = null;
    let assignmentId: string | null = null;
    try {
      const course = await admin
        .from("courses")
        .insert({ title: `Assignment authority ${suffix}` })
        .select("id")
        .single();
      if (course.error) throw course.error;
      courseId = course.data.id;
      const moduleRow = await admin
        .from("modules")
        .insert({ course_id: courseId, title: `Module ${suffix}` })
        .select("id")
        .single();
      if (moduleRow.error) throw moduleRow.error;
      const assignment = await admin
        .from("assignments")
        .insert({
          title: `Assignment ${suffix}`,
          instructions: "Submit once.",
          submission_type: "text",
          requires_review: true,
        })
        .select("id")
        .single();
      if (assignment.error) throw assignment.error;
      assignmentId = assignment.data.id;
      const lesson = await admin
        .from("lessons")
        .insert({
          module_id: moduleRow.data.id,
          title: `Lesson ${suffix}`,
          lesson_type: "assignment",
          assignment_id: assignmentId,
        })
        .select("id")
        .single();
      if (lesson.error) throw lesson.error;

      const payload = {
        assignment_id: assignmentId,
        lesson_id: lesson.data.id,
        user_id: userId,
        submission_text: "Race-safe response",
        status: "submitted" as const,
      };
      const inserts = await Promise.all([
        contenderA.from("assignment_submissions").insert(payload).select("id").single(),
        contenderB.from("assignment_submissions").insert(payload).select("id").single(),
      ]);
      const inserted = inserts.filter((result) => !result.error && result.data);
      const rejected = inserts.filter((result) => result.error?.code === "23505");
      expect(inserted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const submissionId = inserted[0].data!.id;

      const decisions = await Promise.all([
        contenderA
          .from("assignment_submissions")
          .update({
            status: "approved",
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", submissionId)
          .eq("status", "submitted")
          .select("id, status"),
        contenderB
          .from("assignment_submissions")
          .update({
            status: "needs_revision",
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", submissionId)
          .eq("status", "submitted")
          .select("id, status"),
      ]);
      expect(decisions.filter((result) => (result.data ?? []).length === 1)).toHaveLength(1);
      expect(decisions.filter((result) => (result.data ?? []).length === 0)).toHaveLength(1);

      const finalRow = await admin
        .from("assignment_submissions")
        .select("status")
        .eq("id", submissionId)
        .single();
      expect(["approved", "needs_revision"]).toContain(finalRow.data?.status);

      const opposite = finalRow.data?.status === "approved"
        ? "needs_revision"
        : "approved";
      const forbiddenRewrite = await admin
        .from("assignment_submissions")
        .update({ status: opposite })
        .eq("id", submissionId);
      expect(forbiddenRewrite.error?.message).toMatch(/decided assignment submission is immutable/i);
    } finally {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      if (courseId) await admin.from("courses").delete().eq("id", courseId);
      if (assignmentId) {
        await admin.from("assignments").delete().eq("id", assignmentId);
      }
    }
  });
});
