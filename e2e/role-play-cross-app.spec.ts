import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  adminClient,
  ensureTestUser,
} from "./fixtures";

const closerUrl = process.env.CLOSER_TEST_SUPABASE_URL ?? "";
const closerAnonKey = process.env.CLOSER_TEST_SUPABASE_ANON_KEY ?? "";
const closerServiceRoleKey = process.env.CLOSER_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const rolePlayBaseUrl = process.env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL ?? "";
const rolePlayEmbedSigningSecret =
  process.env.ROLE_PLAY_EMBED_SIGNING_SECRET ?? "";
const rolePlayCompletionVerifySecret =
  process.env.ROLE_PLAY_COMPLETION_VERIFY_SECRET ?? "";

const hasCrossAppEnv =
  Boolean(closerUrl) &&
  Boolean(closerAnonKey) &&
  Boolean(closerServiceRoleKey) &&
  Boolean(rolePlayBaseUrl) &&
  rolePlayEmbedSigningSecret.length >= 32 &&
  rolePlayCompletionVerifySecret.length >= 32 &&
  rolePlayEmbedSigningSecret !== rolePlayCompletionVerifySecret;

function closerAdmin(): SupabaseClient {
  if (!closerUrl || !closerServiceRoleKey) {
    throw new Error(
      "Cross-app E2E needs CLOSER_TEST_SUPABASE_URL and CLOSER_TEST_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(closerUrl, closerServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function seedCloserRolePlay(client: SupabaseClient) {
  const stamp = Date.now();
  const { data: persona, error: personaError } = await client
    .from("personas")
    .insert({
      name: `E2E Cross-App Persona ${stamp}`,
      role: "Skeptical homeowner",
      demeanor: "SKEPTICAL",
      system_prompt:
        "You are a skeptical homeowner. Keep answers concise and realistic.",
      opener: "I am not sure I want to sell right now.",
    })
    .select("id")
    .single();
  if (personaError || !persona) throw personaError ?? new Error("No persona");

  const { data: rolePlay, error: rolePlayError } = await client
    .from("role_plays")
    .insert({
      title: `E2E Cross-App Role Play ${stamp}`,
      persona_id: persona.id,
      org_scope: "org",
      allow_anonymous: true,
      pre_read: "Handle the skeptical owner with calm discovery questions.",
      talking_points: ["Ask motivation", "Set a clear next step"],
    })
    .select("id")
    .single();
  if (rolePlayError || !rolePlay) throw rolePlayError ?? new Error("No role play");

  const { data: goal, error: goalError } = await client
    .from("rubric_goals")
    .insert({
      name: `E2E Cross-App Discovery ${stamp}`,
      goal_type: "rated",
      ai_explanation: "Rates whether the learner asked discovery questions.",
      score_min: 1,
      score_max: 5,
      anchor_min: "No discovery",
      anchor_max: "Strong discovery",
    })
    .select("id")
    .single();
  if (goalError || !goal) throw goalError ?? new Error("No rubric goal");

  const { error: linkError } = await client.from("role_play_goals").insert({
    role_play_id: rolePlay.id,
    rubric_goal_id: goal.id,
    weight: 100,
    sort_order: 0,
  });
  if (linkError) throw linkError;

  return {
    personaId: persona.id as string,
    rolePlayId: rolePlay.id as string,
    goalId: goal.id as string,
  };
}

async function cleanupCloserRolePlay(
  client: SupabaseClient,
  seeded: { personaId: string; rolePlayId: string; goalId: string },
) {
  await client.from("attempts").delete().eq("role_play_id", seeded.rolePlayId);
  await client.from("role_plays").delete().eq("id", seeded.rolePlayId);
  await client.from("rubric_goals").delete().eq("id", seeded.goalId);
  await client.from("personas").delete().eq("id", seeded.personaId);
}

async function seedBmhLesson(client: SupabaseClient, userId: string, scenarioId: string) {
  const stamp = Date.now();
  const { data: roleGroup, error: roleGroupError } = await client
    .from("role_groups")
    .insert({ name: `E2E Cross-App Group ${stamp}` })
    .select("id")
    .single();
  if (roleGroupError || !roleGroup) throw roleGroupError ?? new Error("No role group");

  const { data: program, error: programError } = await client
    .from("programs")
    .insert({
      title: `E2E Cross-App Program ${stamp}`,
      is_published: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (programError || !program) throw programError ?? new Error("No program");

  const { data: course, error: courseError } = await client
    .from("courses")
    .insert({
      title: `E2E Cross-App Course ${stamp}`,
      is_published: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (courseError || !course) throw courseError ?? new Error("No course");

  const { data: module, error: moduleError } = await client
    .from("modules")
    .insert({
      course_id: course.id,
      title: `E2E Cross-App Module ${stamp}`,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (moduleError || !module) throw moduleError ?? new Error("No module");

  const { data: lesson, error: lessonError } = await client
    .from("lessons")
    .insert({
      module_id: module.id,
      title: `E2E Cross-App Role Play Lesson ${stamp}`,
      lesson_type: "content",
      sort_order: 0,
      is_required_for_completion: true,
    })
    .select("id")
    .single();
  if (lessonError || !lesson) throw lessonError ?? new Error("No lesson");

  const { data: quiz, error: quizError } = await client
    .from("quizzes")
    .insert({
      title: `E2E Cross-App Quiz ${stamp}`,
      passing_score: 80,
      randomize_questions: false,
      randomize_answers: false,
      show_correct_answers_after: "after_pass",
    })
    .select("id")
    .single();
  if (quizError || !quiz) throw quizError ?? new Error("No quiz");
  const { data: quizLesson, error: quizLessonError } = await client
    .from("lessons")
    .insert({
      module_id: module.id,
      title: `E2E Cross-App Quiz Lesson ${stamp}`,
      lesson_type: "quiz",
      quiz_id: quiz.id,
      prerequisite_lesson_id: lesson.id,
      sort_order: 1,
      is_required_for_completion: true,
    })
    .select("id")
    .single();
  if (quizLessonError || !quizLesson) {
    throw quizLessonError ?? new Error("No quiz lesson");
  }

  const { data: block, error: blockError } = await client
    .from("content_blocks")
    .insert({
      lesson_id: lesson.id,
      block_type: "role_play",
      sort_order: 0,
      is_required_for_completion: true,
      content: {
        scenario_id: scenarioId,
        title: "Cross-app role play",
        height_px: 720,
      },
    })
    .select("id")
    .single();
  if (blockError || !block) throw blockError ?? new Error("No role-play block");

  for (const [table, row] of [
    ["program_courses", { program_id: program.id, course_id: course.id, sort_order: 0 }],
    ["program_access", { program_id: program.id, role_group_id: roleGroup.id }],
    ["course_access", { course_id: course.id, role_group_id: roleGroup.id }],
    ["user_role_groups", { user_id: userId, role_group_id: roleGroup.id }],
  ] as const) {
    const { error } = await client.from(table).insert(row);
    if (error) throw error;
  }

  return {
    roleGroupId: roleGroup.id as string,
    programId: program.id as string,
    courseId: course.id as string,
    moduleId: module.id as string,
    lessonId: lesson.id as string,
    blockId: block.id as string,
    quizId: quiz.id as string,
    quizLessonId: quizLesson.id as string,
  };
}

async function cleanupBmhLesson(
  client: SupabaseClient,
  seeded: {
    roleGroupId: string;
    programId: string;
    courseId: string;
    moduleId: string;
    lessonId: string;
    blockId: string;
    quizId: string;
    quizLessonId: string;
  },
) {
  await client.from("role_play_results").delete().eq("block_id", seeded.blockId);
  await client.from("user_block_progress").delete().eq("block_id", seeded.blockId);
  await client.from("content_blocks").delete().eq("id", seeded.blockId);
  await client.from("lessons").delete().eq("id", seeded.quizLessonId);
  await client.from("lessons").delete().eq("id", seeded.lessonId);
  await client.from("quizzes").delete().eq("id", seeded.quizId);
  await client.from("modules").delete().eq("id", seeded.moduleId);
  await client.from("program_courses").delete().eq("program_id", seeded.programId);
  await client.from("program_access").delete().eq("program_id", seeded.programId);
  await client.from("course_access").delete().eq("course_id", seeded.courseId);
  await client.from("courses").delete().eq("id", seeded.courseId);
  await client.from("programs").delete().eq("id", seeded.programId);
  await client.from("user_role_groups").delete().eq("role_group_id", seeded.roleGroupId);
  await client.from("role_groups").delete().eq("id", seeded.roleGroupId);
}

test.describe("Phase 5 cross-app role play", () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(
    !hasCrossAppEnv,
    "Cross-app role-play E2E needs Closer Lab env and a running embed app.",
  );

  let closerSeed:
    | { personaId: string; rolePlayId: string; goalId: string }
    | null = null;
  let bmhSeed:
    | {
        roleGroupId: string;
        programId: string;
        courseId: string;
        moduleId: string;
        lessonId: string;
        blockId: string;
        quizId: string;
        quizLessonId: string;
      }
    | null = null;

  test.beforeAll(async () => {
    const bmh = adminClient();
    const closer = closerAdmin();
    const userId = await ensureTestUser(bmh);
    closerSeed = await seedCloserRolePlay(closer);
    bmhSeed = await seedBmhLesson(bmh, userId, closerSeed.rolePlayId);
  });

  test.afterAll(async () => {
    const bmh = adminClient();
    const closer = closerAdmin();
    if (bmhSeed) await cleanupBmhLesson(bmh, bmhSeed);
    if (closerSeed) await cleanupCloserRolePlay(closer, closerSeed);
  });

  test("Closer Lab iframe completion marks the BMH lesson block complete", async ({
    page,
  }) => {
    if (!bmhSeed || !closerSeed) throw new Error("Missing cross-app seed data");

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`/lessons/${bmhSeed.lessonId}`);
    await expect(
      page.getByRole("heading", { name: /E2E Cross-App Role Play Lesson/i }),
    ).toBeVisible();

    const iframe = page.frameLocator(`iframe[title="Cross-app role play"]`);
    await expect(
      iframe.getByRole("button", { name: /start when ready/i }),
    ).toBeVisible({ timeout: 20_000 });
    await iframe.getByRole("button", { name: /start when ready/i }).click();
    await expect(
      iframe.locator("[data-testid='runtime-stage-active']"),
    ).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(4_000);
    await iframe.getByRole("button", { name: /stop/i }).click();
    await expect(
      page.getByText("Complete", { exact: true }),
    ).toBeVisible({ timeout: 60_000 });

    const bmh = adminClient();
    await expect
      .poll(async () => {
        const { data } = await bmh
          .from("user_block_progress")
          .select("id")
          .eq("block_id", bmhSeed!.blockId)
          .maybeSingle();
        return data?.id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();

    await expect
      .poll(async () => {
        const { data } = await bmh
          .from("role_play_results")
          .select("attempt_id")
          .eq("block_id", bmhSeed!.blockId)
          .maybeSingle();
        return data?.attempt_id ?? null;
      }, { timeout: 20_000 })
      .not.toBeNull();

    expect(consoleErrors).toEqual([]);
  });
});
