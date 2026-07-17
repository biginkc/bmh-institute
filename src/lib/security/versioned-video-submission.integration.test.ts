import { randomBytes, randomUUID } from "node:crypto";

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

describe.skipIf(!envPresent)("versioned video and submission evidence", () => {
  it("enforces append-only history, bounded batch state, and learner submission retention", async () => {
    if (!service || !url || !anonKey) {
      throw new Error("Test-project clients are unavailable.");
    }

    const email = `versioned-evidence-${randomBytes(8).toString("hex")}@bmh.invalid`;
    const password = `${randomBytes(18).toString("base64url")}!Aa1`;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Versioned evidence learner" },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Learner creation failed.");
    }

    const userId = created.data.user.id;
    const learner = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signedIn = await learner.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;

    const submissionPath = `${userId}/migration-031/${randomUUID()}.txt`;
    try {
      const historyRead = await service
        .from("user_video_completion_history")
        .select("user_id")
        .limit(1);
      expect(historyRead.error).toBeNull();

      const historyUpdate = await service
        .from("user_video_completion_history")
        .update({ completed_at: new Date().toISOString() })
        .eq("user_id", randomUUID());
      expect(historyUpdate.error?.message).toMatch(/permission denied/i);

      const historyDelete = await service
        .from("user_video_completion_history")
        .delete()
        .eq("user_id", randomUUID());
      expect(historyDelete.error?.message).toMatch(/permission denied/i);

      const lessonIds = [randomUUID(), randomUUID()];
      const learnerStates = await learner.rpc("fn_lesson_states", {
        p_user_id: userId,
        p_lesson_ids: [...lessonIds, lessonIds[0]],
      });
      expect(learnerStates.error).toBeNull();
      expect(learnerStates.data).toHaveLength(2);
      expect(learnerStates.data).toEqual(
        expect.arrayContaining(
          lessonIds.map((lessonId) => ({
            lesson_id: lessonId,
            is_complete: false,
            is_unlocked: false,
          })),
        ),
      );

      const oversized = await learner.rpc("fn_lesson_states", {
        p_user_id: userId,
        p_lesson_ids: Array.from({ length: 501 }, () => randomUUID()),
      });
      expect(oversized.error?.message).toMatch(/1 to 500 non-null lesson ids/i);

      const learnerAdminBatch = await learner.rpc(
        "fn_admin_lesson_completion_states",
        {
          p_user_ids: [userId],
          p_lesson_ids: [lessonIds[0]],
        },
      );
      expect(learnerAdminBatch.error?.message).toMatch(/admin access/i);

      const { error: promoteError } = await service
        .from("profiles")
        .update({ system_role: "admin" })
        .eq("id", userId);
      if (promoteError) throw promoteError;

      const adminBatch = await learner.rpc(
        "fn_admin_lesson_completion_states",
        {
          p_user_ids: [userId],
          p_lesson_ids: [lessonIds[0]],
        },
      );
      expect(adminBatch.error).toBeNull();
      expect(adminBatch.data).toEqual([
        {
          user_id: userId,
          lesson_id: lessonIds[0],
          is_complete: false,
          completed_at: null,
        },
      ]);

      const serviceBatch = await service.rpc(
        "fn_admin_lesson_completion_states",
        {
          p_user_ids: [userId],
          p_lesson_ids: [lessonIds[1]],
        },
      );
      expect(serviceBatch.error).toBeNull();
      expect(serviceBatch.data?.[0]).toMatchObject({
        user_id: userId,
        lesson_id: lessonIds[1],
        is_complete: false,
        completed_at: null,
      });

      const upload = await learner.storage
        .from("submissions")
        .upload(
          submissionPath,
          new TextEncoder().encode("immutable evidence"),
          {
            contentType: "text/plain",
            upsert: false,
          },
        );
      expect(upload.error).toBeNull();

      const learnerDelete = await learner.storage
        .from("submissions")
        .remove([submissionPath]);
      expect(learnerDelete.error).not.toBeNull();

      const stillPresent = await learner.storage
        .from("submissions")
        .download(submissionPath);
      expect(stillPresent.error).toBeNull();
      expect(stillPresent.data).not.toBeNull();
    } finally {
      await service.storage.from("submissions").remove([submissionPath]);
      await service.auth.admin.deleteUser(userId);
    }
  });
});
