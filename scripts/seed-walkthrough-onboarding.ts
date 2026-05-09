import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  WALKTHROUGH_COURSE,
  WALKTHROUGH_PROGRAM,
  WALKTHROUGH_ROLE_GROUP,
  walkthroughModules,
  type WalkthroughBlock,
  type WalkthroughLesson,
} from "@/lib/walkthrough/curriculum";

const PROD_PROJECT_REF = "dhvfsyteqsxagokoerrx";
const args = new Set(process.argv.slice(2));
const applyProduction = args.has("--apply-production");
const dryRun = args.has("--dry-run") || !applyProduction;

loadLocalEnv(".env.local");
loadLocalEnv(".env");

if (!applyProduction) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        message:
          "Walkthrough curriculum is valid. Re-run with --apply-production to write production content.",
        program: WALKTHROUGH_PROGRAM,
        course: WALKTHROUGH_COURSE,
        modules: walkthroughModules.map((module) => ({
          title: module.title,
          lessons: module.lessons.map((lesson) => lesson.title),
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const supabaseUrl =
  process.env.PROD_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.TEST_SUPABASE_URL;
const serviceRole =
  process.env.PROD_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  throw new Error(
    "Set PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

if (!supabaseUrl.includes(PROD_PROJECT_REF)) {
  throw new Error(`Refusing unexpected Supabase project. Expected ${PROD_PROJECT_REF}.`);
}

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  if (dryRun) return;

  await resetExisting(admin);

  const roleGroupId = await upsertRoleGroup(admin);
  const courseId = await insertOne(admin, "courses", {
    title: WALKTHROUGH_COURSE,
    description:
      "Durable demo course for learner onboarding, admin walkthroughs, and Closer Lab role-play review.",
    is_published: true,
    certificate_enabled: true,
    sort_order: 5,
  });

  await admin
    .from("course_access")
    .insert({ course_id: courseId, role_group_id: roleGroupId })
    .throwOnError();

  const programId = await insertOne(admin, "programs", {
    title: WALKTHROUGH_PROGRAM,
    description:
      "Persistent walkthrough program for onboarding new learners and demonstrating BMH Institute end to end.",
    is_published: true,
    course_order_mode: "sequential",
    certificate_enabled: true,
    sort_order: 5,
  });

  await admin
    .from("program_access")
    .insert({ program_id: programId, role_group_id: roleGroupId })
    .throwOnError();
  await admin
    .from("program_courses")
    .insert({ program_id: programId, course_id: courseId, sort_order: 10 })
    .throwOnError();

  const moduleIds: string[] = [];
  for (const [moduleIndex, module] of walkthroughModules.entries()) {
    const moduleId = await insertOne(admin, "modules", {
      course_id: courseId,
      title: module.title,
      description: module.description,
      sort_order: (moduleIndex + 1) * 10,
    });
    moduleIds.push(moduleId);

    for (const [lessonIndex, lesson] of module.lessons.entries()) {
      await createLesson(admin, moduleId, lesson, (lessonIndex + 1) * 10);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: false,
        programId,
        courseId,
        roleGroupId,
        moduleIds,
        program: WALKTHROUGH_PROGRAM,
        course: WALKTHROUGH_COURSE,
        moduleCount: walkthroughModules.length,
        lessonCount: walkthroughModules.reduce(
          (count, module) => count + module.lessons.length,
          0,
        ),
      },
      null,
      2,
    ),
  );
}

async function resetExisting(client: SupabaseClient) {
  await deleteByTitle(client, "programs", WALKTHROUGH_PROGRAM);
  await deleteByTitle(client, "courses", WALKTHROUGH_COURSE);

  const quizTitles = walkthroughModules.flatMap((module) =>
    module.lessons
      .filter((lesson): lesson is Extract<WalkthroughLesson, { type: "quiz" }> =>
        lesson.type === "quiz",
      )
      .map((lesson) => lesson.quiz.title),
  );
  if (quizTitles.length) {
    await client.from("quizzes").delete().in("title", quizTitles).throwOnError();
  }

  const assignmentTitles = walkthroughModules.flatMap((module) =>
    module.lessons
      .filter(
        (lesson): lesson is Extract<WalkthroughLesson, { type: "assignment" }> =>
          lesson.type === "assignment",
      )
      .map((lesson) => lesson.assignment.title),
  );
  if (assignmentTitles.length) {
    await client
      .from("assignments")
      .delete()
      .in("title", assignmentTitles)
      .throwOnError();
  }
}

async function upsertRoleGroup(client: SupabaseClient) {
  const { data: existing } = await client
    .from("role_groups")
    .select("id")
    .eq("name", WALKTHROUGH_ROLE_GROUP)
    .maybeSingle()
    .throwOnError();
  if (existing?.id) return existing.id as string;

  return insertOne(client, "role_groups", {
    name: WALKTHROUGH_ROLE_GROUP,
    description:
      "Learners assigned here can access the persistent walkthrough onboarding program.",
  });
}

async function createLesson(
  client: SupabaseClient,
  moduleId: string,
  lesson: WalkthroughLesson,
  sortOrder: number,
) {
  if (lesson.type === "quiz") {
    const quizId = await createQuiz(client, lesson);
    await insertOne(client, "lessons", {
      module_id: moduleId,
      title: lesson.title,
      description: lesson.description,
      lesson_type: "quiz",
      quiz_id: quizId,
      is_required_for_completion: lesson.required ?? true,
      sort_order: sortOrder,
    });
    return;
  }

  if (lesson.type === "assignment") {
    const assignmentId = await insertOne(client, "assignments", {
      title: lesson.assignment.title,
      instructions: lesson.assignment.instructions,
      submission_type: lesson.assignment.submissionType,
      requires_review: lesson.assignment.requiresReview,
    });
    await insertOne(client, "lessons", {
      module_id: moduleId,
      title: lesson.title,
      description: lesson.description,
      lesson_type: "assignment",
      assignment_id: assignmentId,
      is_required_for_completion: lesson.required ?? true,
      sort_order: sortOrder,
    });
    return;
  }

  const lessonId = await insertOne(client, "lessons", {
    module_id: moduleId,
    title: lesson.title,
    description: lesson.description,
    lesson_type: "content",
    is_required_for_completion: lesson.required ?? true,
    sort_order: sortOrder,
  });

  await client
    .from("content_blocks")
    .insert(
      lesson.blocks.map((block, blockIndex) => ({
        lesson_id: lessonId,
        block_type: block.type,
        content: blockContent(block),
        sort_order: (blockIndex + 1) * 10,
        is_required_for_completion:
          block.required ?? (block.type !== "divider" && block.type !== "callout"),
      })),
    )
    .throwOnError();
}

async function createQuiz(
  client: SupabaseClient,
  lesson: Extract<WalkthroughLesson, { type: "quiz" }>,
) {
  const quizId = await insertOne(client, "quizzes", {
    title: lesson.quiz.title,
    description: lesson.quiz.description,
    passing_score: lesson.quiz.passingScore,
    randomize_questions: true,
    randomize_answers: true,
    questions_per_attempt: null,
    max_attempts: 3,
    retake_cooldown_hours: 0,
    show_correct_answers_after: "after_pass",
  });

  for (const [questionIndex, question] of lesson.quiz.questions.entries()) {
    const questionId = await insertOne(client, "questions", {
      quiz_id: quizId,
      question_text: question.question,
      question_type: "single_choice",
      explanation: question.explanation,
      points: 1,
      sort_order: (questionIndex + 1) * 10,
    });
    await client
      .from("answer_options")
      .insert(
        question.options.map((option, optionIndex) => ({
          question_id: questionId,
          option_text: option.text,
          is_correct: option.correct,
          sort_order: (optionIndex + 1) * 10,
        })),
      )
      .throwOnError();
  }

  return quizId;
}

function blockContent(block: WalkthroughBlock) {
  switch (block.type) {
    case "text":
      return { html: block.html };
    case "callout":
      return { variant: block.variant, markdown: block.markdown };
    case "external_link":
      return {
        label: block.label,
        url: block.url,
        description: block.description,
        open_in_new_tab: block.url.startsWith("http"),
      };
    case "embed":
      return {
        iframe_src: block.iframe_src,
        aspect_ratio: block.aspect_ratio,
      };
    case "role_play":
      return {
        scenario_id: block.scenario_id,
        title: block.title,
        height_px: block.height_px,
      };
    case "divider":
      return {};
  }
}

async function deleteByTitle(client: SupabaseClient, table: string, title: string) {
  await client.from(table).delete().eq("title", title).throwOnError();
}

async function insertOne(
  client: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await client.from(table).insert(values).select("id").single();
  if (error) throw error;
  return data.id as string;
}

function loadLocalEnv(filename: string) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
