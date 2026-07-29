import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertCanonicalSupabaseProjectUrl } from "../src/lib/supabase/canonical-project-url";

import {
  adminClient,
  ensureTestUser,
} from "./fixtures";
import {
  createHugoAcceptanceRun,
  createHugoCleanupManifest,
  createHugoEvidenceRecord,
  createHugoSeedRecorder,
  runHugoCleanupSteps,
  syntheticFixtureLabel,
  writeHugoCleanupManifest,
  writeHugoEvidence,
  type HugoCleanupManifest,
  type HugoCleanupResource,
} from "./hugo-acceptance";

const closerUrl = process.env.CLOSER_TEST_SUPABASE_URL ?? "";
const closerAnonKey = process.env.CLOSER_TEST_SUPABASE_ANON_KEY ?? "";
const closerServiceRoleKey = process.env.CLOSER_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const rolePlayBaseUrl = process.env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL ?? "";
const rolePlayEmbedSigningSecret =
  process.env.ROLE_PLAY_EMBED_SIGNING_SECRET ?? "";
const rolePlayCompletionVerifySecret =
  process.env.ROLE_PLAY_COMPLETION_VERIFY_SECRET ?? "";
const CLOSER_TEST_PROJECT_REF = "moocmsisaopnznppqvsq";
const acceptanceRun = createHugoAcceptanceRun();

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
  try {
    assertCanonicalSupabaseProjectUrl(closerUrl, [CLOSER_TEST_PROJECT_REF]);
  } catch {
    throw new Error(
      `Cross-app E2E requires exact Closer test origin https://${CLOSER_TEST_PROJECT_REF}.supabase.co.`,
    );
  }
  return createClient(closerUrl, closerServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function seedCloserRolePlay(
  client: SupabaseClient,
  record: (resource: HugoCleanupResource) => void,
) {
  const stamp = syntheticFixtureLabel(acceptanceRun, "closer-role-play");
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
  record({ project: "closer", kind: "persona", id: persona.id as string });

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
  record({ project: "closer", kind: "role_play", id: rolePlay.id as string });

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
  record({ project: "closer", kind: "rubric_goal", id: goal.id as string });

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
  manifest: HugoCleanupManifest,
) {
  await runHugoCleanupSteps([
    {
      label: "Closer attempts",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "closer",
          "role_play",
          "attempts",
          "role_play_id",
        ),
    },
    {
      label: "Closer role play",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "closer",
          "role_play",
          "role_plays",
          "id",
        ),
    },
    {
      label: "Closer rubric goal",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "closer",
          "rubric_goal",
          "rubric_goals",
          "id",
        ),
    },
    {
      label: "Closer persona",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "closer",
          "persona",
          "personas",
          "id",
        ),
    },
  ]);
}

async function deleteTrackedCleanupRows(
  client: SupabaseClient,
  manifest: HugoCleanupManifest,
  project: HugoCleanupResource["project"],
  kind: string,
  table: string,
  column: string,
): Promise<void> {
  const ids = manifest.resources
    .filter((resource) => resource.project === project && resource.kind === kind)
    .map((resource) => resource.id);
  if (ids.length === 0) return;

  const { error } = await client.from(table).delete().in(column, ids);
  if (error) throw error;
}

async function seedBmhLesson(
  client: SupabaseClient,
  userId: string,
  scenarioId: string,
  record: (resource: HugoCleanupResource) => void,
) {
  const stamp = syntheticFixtureLabel(acceptanceRun, "institute-role-play");
  const { data: roleGroup, error: roleGroupError } = await client
    .from("role_groups")
    .insert({ name: `E2E Cross-App Group ${stamp}` })
    .select("id")
    .single();
  if (roleGroupError || !roleGroup) throw roleGroupError ?? new Error("No role group");
  record({ project: "institute", kind: "role_group", id: roleGroup.id as string });

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
  record({ project: "institute", kind: "program", id: program.id as string });

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
  record({ project: "institute", kind: "course", id: course.id as string });

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
  record({ project: "institute", kind: "module", id: module.id as string });

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
  record({ project: "institute", kind: "lesson", id: lesson.id as string });

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
  record({ project: "institute", kind: "quiz", id: quiz.id as string });
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
  record({
    project: "institute",
    kind: "quiz_lesson",
    id: quizLesson.id as string,
  });

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
  record({
    project: "institute",
    kind: "content_block",
    id: block.id as string,
  });

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
  manifest: HugoCleanupManifest,
) {
  await runHugoCleanupSteps([
    {
      label: "Institute role-play results",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "content_block",
          "role_play_results",
          "block_id",
        ),
    },
    {
      label: "Institute block progress",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "content_block",
          "user_block_progress",
          "block_id",
        ),
    },
    {
      label: "Institute content block",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "content_block",
          "content_blocks",
          "id",
        ),
    },
    {
      label: "Institute quiz lesson",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "quiz_lesson",
          "lessons",
          "id",
        ),
    },
    {
      label: "Institute role-play lesson",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "lesson",
          "lessons",
          "id",
        ),
    },
    {
      label: "Institute quiz",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "quiz",
          "quizzes",
          "id",
        ),
    },
    {
      label: "Institute module",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "module",
          "modules",
          "id",
        ),
    },
    {
      label: "Institute program-course link",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "program",
          "program_courses",
          "program_id",
        ),
    },
    {
      label: "Institute program access",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "program",
          "program_access",
          "program_id",
        ),
    },
    {
      label: "Institute course access",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "course",
          "course_access",
          "course_id",
        ),
    },
    {
      label: "Institute course",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "course",
          "courses",
          "id",
        ),
    },
    {
      label: "Institute program",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "program",
          "programs",
          "id",
        ),
    },
    {
      label: "Institute user role group",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "role_group",
          "user_role_groups",
          "role_group_id",
        ),
    },
    {
      label: "Institute role group",
      run: () =>
        deleteTrackedCleanupRows(
          client,
          manifest,
          "institute",
          "role_group",
          "role_groups",
          "id",
        ),
    },
  ]);
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
  let cleanupManifest: HugoCleanupManifest | null = null;

  test.beforeAll(async () => {
    const recorder = createHugoSeedRecorder(
      createHugoCleanupManifest(acceptanceRun),
      (manifest) => {
        cleanupManifest = manifest;
      },
    );
    const bmh = adminClient();
    const closer = closerAdmin();
    const userId = await ensureTestUser(bmh);
    closerSeed = await seedCloserRolePlay(closer, recorder.record);
    bmhSeed = await seedBmhLesson(
      bmh,
      userId,
      closerSeed.rolePlayId,
      recorder.record,
    );
  });

  test.afterAll(async ({}, testInfo) => {
    const manifest = cleanupManifest;
    await runHugoCleanupSteps([
      {
        label: "cross-app cleanup manifest",
        run: async () => {
          if (manifest) await writeHugoCleanupManifest(testInfo, manifest);
        },
      },
      {
        label: "Institute cross-app fixtures",
        run: async () => {
          if (manifest) await cleanupBmhLesson(adminClient(), manifest);
        },
      },
      {
        label: "Closer cross-app fixtures",
        run: async () => {
          if (manifest) await cleanupCloserRolePlay(closerAdmin(), manifest);
        },
      },
    ]);
  });

  test("Closer Lab iframe completion marks the BMH lesson block complete", async ({
    page,
  }, testInfo) => {
    if (!bmhSeed || !closerSeed) throw new Error("Missing cross-app seed data");

    const consoleErrors: string[] = [];
    let status: "PASS" | "FAIL" = "FAIL";
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    try {
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
      status = "PASS";
    } finally {
      if (cleanupManifest) {
        await writeHugoEvidence(testInfo, createHugoEvidenceRecord({
          run: acceptanceRun,
          project: "institute",
          roles: ["owner"],
          journey: "cross-app role-play completion",
          status,
          entryPoint: "/lessons/:lessonId",
          actions: [
            "open seeded lesson",
            "start embedded role play",
            "stop embedded role play",
            "verify completion and persisted receipts",
          ],
          successSignals: ["lesson shows Complete", "progress and result receipts exist"],
          failureSignals: consoleErrors.length > 0 ? ["browser console error observed"] : [],
          artifacts: [{ kind: "cleanup-manifest", path: "hugo-cleanup-manifest.json" }],
          cleanupManifest,
        }));
      }
    }
  });
});
