import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const envPresent = Boolean(url && anonKey && serviceRoleKey);

const admin =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

function completeRolePlay(
  client: SupabaseClient,
  args: {
    userId: string;
    blockId: string;
    scenarioId: string;
    attemptId: string;
    score?: number;
  },
): Promise<RpcResult> {
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<RpcResult>;
  return rpc("fn_complete_role_play_block", {
    p_user_id: args.userId,
    p_block_id: args.blockId,
    p_scenario_id: args.scenarioId,
    p_attempt_id: args.attemptId,
    p_score: args.score ?? 91,
    p_goals_met: { discovery: true },
    p_summary: { share_url: "https://closer.invalid/share/test-capability" },
  });
}

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
  throw new Error("Test learner profile was not created.");
}

describe.skipIf(!envPresent)("atomic role-play completion", () => {
  it("denies learner writes and atomically enforces binding, access, suspension, and concurrent replay", async () => {
    if (!admin || !url || !anonKey)
      throw new Error("Integration clients unavailable.");
    const suffix = randomBytes(8).toString("hex");
    const password = `${randomBytes(24).toString("base64url")}!Aa1`;
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: `role-play-${suffix}@bmh.invalid`,
        password,
        email_confirm: true,
      });
    if (createError || !created.user) {
      throw createError ?? new Error("Failed to create test learner.");
    }
    const userId = created.user.id;
    await waitForProfile(userId);
    const learner = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await learner.auth.signInWithPassword({
      email: `role-play-${suffix}@bmh.invalid`,
      password,
    });
    if (signIn.error) throw signIn.error;

    let roleGroupId: string | null = null;
    let courseId: string | null = null;
    try {
      const roleGroup = await admin
        .from("role_groups")
        .insert({ name: `Role-play integration ${suffix}` })
        .select("id")
        .single();
      if (roleGroup.error || !roleGroup.data) throw roleGroup.error;
      roleGroupId = roleGroup.data.id;
      const membership = await admin.from("user_role_groups").insert({
        user_id: userId,
        role_group_id: roleGroupId,
      });
      if (membership.error) throw membership.error;

      const course = await admin
        .from("courses")
        .insert({ title: `Role-play course ${suffix}`, is_published: true })
        .select("id")
        .single();
      if (course.error || !course.data) throw course.error;
      courseId = course.data.id;
      const access = await admin.from("course_access").insert({
        course_id: courseId,
        role_group_id: roleGroupId,
      });
      if (access.error) throw access.error;
      const courseModule = await admin
        .from("modules")
        .insert({ course_id: courseId, title: "Role-play module" })
        .select("id")
        .single();
      if (courseModule.error || !courseModule.data) throw courseModule.error;

      const lessons = await admin
        .from("lessons")
        .insert([
          {
            module_id: courseModule.data.id,
            title: "Accessible role play",
            lesson_type: "content",
            sort_order: 0,
          },
          {
            module_id: courseModule.data.id,
            title: "Unfinished prerequisite",
            lesson_type: "content",
            sort_order: 1,
          },
        ])
        .select("id, title");
      if (lessons.error || !lessons.data) throw lessons.error;
      const accessibleLessonId = lessons.data.find(
        (row) => row.title === "Accessible role play",
      )?.id;
      const prerequisiteId = lessons.data.find(
        (row) => row.title === "Unfinished prerequisite",
      )?.id;
      if (!accessibleLessonId || !prerequisiteId) {
        throw new Error("Role-play lessons were not created.");
      }
      const lockedLesson = await admin
        .from("lessons")
        .insert({
          module_id: courseModule.data.id,
          title: "Locked role play",
          lesson_type: "content",
          sort_order: 2,
          prerequisite_lesson_id: prerequisiteId,
        })
        .select("id")
        .single();
      if (lockedLesson.error || !lockedLesson.data) throw lockedLesson.error;

      const blocks = await admin
        .from("content_blocks")
        .insert([
          {
            lesson_id: accessibleLessonId,
            block_type: "role_play",
            content: { scenario_id: `scenario-${suffix}` },
            is_required_for_completion: true,
          },
          {
            lesson_id: lockedLesson.data.id,
            block_type: "role_play",
            content: { scenario_id: `locked-${suffix}` },
            is_required_for_completion: true,
          },
        ])
        .select("id, lesson_id");
      if (blocks.error || !blocks.data) throw blocks.error;
      const blockId = blocks.data.find(
        (row) => row.lesson_id === accessibleLessonId,
      )?.id;
      const lockedBlockId = blocks.data.find(
        (row) => row.lesson_id === lockedLesson.data.id,
      )?.id;
      if (!blockId || !lockedBlockId) {
        throw new Error("Role-play blocks were not created.");
      }

      const directWrite = await learner.from("role_play_results").insert({
        user_id: userId,
        block_id: blockId,
        scenario_id: `scenario-${suffix}`,
        attempt_id: `direct-${suffix}`,
        score: 100,
      });
      expect(directWrite.error).not.toBeNull();
      const learnerRpc = await completeRolePlay(learner, {
        userId,
        blockId,
        scenarioId: `scenario-${suffix}`,
        attemptId: `learner-rpc-${suffix}`,
      });
      expect(learnerRpc.error?.message).toMatch(/permission|service role/i);

      const wrongScenario = await completeRolePlay(admin, {
        userId,
        blockId,
        scenarioId: `wrong-${suffix}`,
        attemptId: `wrong-${suffix}`,
      });
      expect(wrongScenario.error?.message).toMatch(/do not match/i);
      const locked = await completeRolePlay(admin, {
        userId,
        blockId: lockedBlockId,
        scenarioId: `locked-${suffix}`,
        attemptId: `locked-${suffix}`,
      });
      expect(locked.error?.message).toMatch(/not accessible and unlocked/i);

      const first = await completeRolePlay(admin, {
        userId,
        blockId,
        scenarioId: `scenario-${suffix}`,
        attemptId: `attempt-${suffix}`,
      });
      expect(first.error).toBeNull();
      expect(first.data).toMatchObject({
        lessonId: accessibleLessonId,
        alreadyMarked: false,
        resultCreated: true,
      });
      const replay = await completeRolePlay(admin, {
        userId,
        blockId,
        scenarioId: `scenario-${suffix}`,
        attemptId: `attempt-${suffix}`,
      });
      expect(replay.error).toBeNull();
      expect(replay.data).toMatchObject({
        lessonId: accessibleLessonId,
        alreadyMarked: true,
        resultCreated: false,
      });
      const conflict = await completeRolePlay(admin, {
        userId,
        blockId,
        scenarioId: `scenario-${suffix}`,
        attemptId: `attempt-${suffix}`,
        score: 12,
      });
      expect(conflict.error?.message).toMatch(/already bound/i);

      const raceArgs = {
        userId,
        blockId,
        scenarioId: `scenario-${suffix}`,
        attemptId: `race-${suffix}`,
      };
      const race = await Promise.all([
        completeRolePlay(admin, raceArgs),
        completeRolePlay(admin, raceArgs),
      ]);
      expect(race.every((result) => result.error === null)).toBe(true);
      expect(
        race.filter(
          (result) =>
            (result.data as { resultCreated?: boolean }).resultCreated === true,
        ),
      ).toHaveLength(1);

      const rows = await admin
        .from("role_play_results")
        .select("attempt_id")
        .eq("user_id", userId);
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(2);
      const progress = await admin
        .from("user_block_progress")
        .select("id")
        .eq("user_id", userId)
        .eq("block_id", blockId);
      expect(progress.error).toBeNull();
      expect(progress.data).toHaveLength(1);

      const suspend = await admin
        .from("profiles")
        .update({ status: "suspended" })
        .eq("id", userId);
      if (suspend.error) throw suspend.error;
      const suspended = await completeRolePlay(admin, {
        userId,
        blockId,
        scenarioId: `scenario-${suffix}`,
        attemptId: `suspended-${suffix}`,
      });
      expect(suspended.error?.message).toMatch(/active learner is required/i);
    } finally {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      if (courseId) await admin.from("courses").delete().eq("id", courseId);
      if (roleGroupId) {
        await admin.from("role_groups").delete().eq("id", roleGroupId);
      }
    }
  });
});
