import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireE2eSeedPassword } from "../src/lib/testing/e2e-seed-password";

type SeedUser = {
  email: string;
  password: string;
  fullName: string;
  systemRole: "owner" | "admin" | "learner";
  assignToLearnerGroup?: boolean;
};

const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";
const PROD_PROJECT_REF = "dhvfsyteqsxagokoerrx";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

const E2E_PASSWORD = requireE2eSeedPassword();
const SEED = {
  roleGroup: "E2E Appointment Setters",
  program: "E2E VA Onboarding",
  courses: {
    fundamentals: "E2E BMH Fundamentals",
    objections: "E2E Objection Handling",
    standalone: "E2E Standalone Policy Refresher",
  },
  users: {
    owner: {
      email: "e2e.owner@bmh-institute.test",
      password: E2E_PASSWORD,
      fullName: "E2E Owner",
      systemRole: "owner",
    },
    learner: {
      email: "e2e.learner@bmh-institute.test",
      password: E2E_PASSWORD,
      fullName: "E2E Learner",
      systemRole: "learner",
      assignToLearnerGroup: true,
    },
    unassignedLearner: {
      email: "e2e.unassigned@bmh-institute.test",
      password: E2E_PASSWORD,
      fullName: "E2E Unassigned Learner",
      systemRole: "learner",
    },
  } satisfies Record<string, SeedUser>,
};

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "Set TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY before running this seed.",
  );
}

if (SUPABASE_URL.includes(PROD_PROJECT_REF)) {
  throw new Error("Refusing to seed the production Supabase project.");
}

if (!SUPABASE_URL.includes(TEST_PROJECT_REF)) {
  throw new Error(
    `Refusing to seed unexpected Supabase project. Expected ${TEST_PROJECT_REF}.`,
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  await cleanupSeed(supabase);

  const users = await createSeedUsers(supabase);
  const roleGroupId = await insertOne("role_groups", {
    name: SEED.roleGroup,
    description: "Role group used by durable Playwright E2E tests.",
  });

  await supabase
    .from("user_role_groups")
    .insert({
      user_id: users.learner,
      role_group_id: roleGroupId,
    })
    .throwOnError();

  const fundamentalsCourseId = await createCourse({
    title: SEED.courses.fundamentals,
    description: "Core operating expectations for BMH Group VAs.",
    sortOrder: 10,
    roleGroupId,
    includeQuiz: true,
    includeAssignment: true,
  });
  const objectionsCourseId = await createCourse({
    title: SEED.courses.objections,
    description: "Practice responses for common seller objections.",
    sortOrder: 20,
    roleGroupId,
    includeQuiz: false,
    includeAssignment: false,
  });
  const standaloneCourseId = await createCourse({
    title: SEED.courses.standalone,
    description: "Standalone policy review course used for course access tests.",
    sortOrder: 30,
    roleGroupId,
    includeQuiz: true,
    includeAssignment: false,
    standalone: true,
  });

  const programId = await insertOne("programs", {
    title: SEED.program,
    description: "Seeded internal onboarding program for durable E2E tests.",
    is_published: true,
    course_order_mode: "sequential",
    certificate_enabled: true,
    sort_order: 10,
  });

  await supabase
    .from("program_access")
    .insert({ program_id: programId, role_group_id: roleGroupId })
    .throwOnError();
  await supabase
    .from("program_courses")
    .insert([
      { program_id: programId, course_id: fundamentalsCourseId, sort_order: 10 },
      { program_id: programId, course_id: objectionsCourseId, sort_order: 20 },
    ])
    .throwOnError();

  const contentBlock = await supabase
    .from("content_blocks")
    .select("id, lesson_id")
    .eq("content->>seed_key", "fundamentals-intro")
    .maybeSingle()
    .throwOnError();

  if (contentBlock.data) {
    await supabase
      .from("user_block_progress")
      .upsert(
        {
          user_id: users.learner,
          block_id: contentBlock.data.id,
        },
        { onConflict: "user_id,block_id" },
      )
      .throwOnError();
  }

  const quizLesson = await supabase
    .from("lessons")
    .select("id, quiz_id")
    .eq("title", "E2E Knowledge Check")
    .maybeSingle()
    .throwOnError();

  if (quizLesson.data?.quiz_id) {
    await supabase
      .from("user_quiz_attempts")
      .insert({
        user_id: users.learner,
        quiz_id: quizLesson.data.quiz_id,
        lesson_id: quizLesson.data.id,
        score: 100,
        passed: true,
        question_order: [],
        answer_orders: {},
        responses: {},
        completed_at: new Date().toISOString(),
      })
      .throwOnError();
  }

  const assignmentLesson = await supabase
    .from("lessons")
    .select("id, assignment_id")
    .eq("title", "E2E Call Notes Assignment")
    .maybeSingle()
    .throwOnError();

  if (assignmentLesson.data?.assignment_id) {
    await supabase
      .from("assignment_submissions")
      .insert({
        assignment_id: assignmentLesson.data.assignment_id,
        lesson_id: assignmentLesson.data.id,
        user_id: users.learner,
        submission_text:
          "Seeded assignment submission for admin review Playwright coverage.",
        status: "submitted",
      })
      .throwOnError();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRef: TEST_PROJECT_REF,
        programId,
        roleGroupId,
        courseIds: {
          fundamentalsCourseId,
          objectionsCourseId,
          standaloneCourseId,
        },
        seededUserCount: Object.keys(SEED.users).length,
      },
      null,
      2,
    ),
  );
}

async function cleanupSeed(client: SupabaseClient) {
  await client
    .from("profiles")
    .update({ system_role: "admin" })
    .eq("email", SEED.users.owner.email)
    .throwOnError();

  const { data: programs } = await client
    .from("programs")
    .select("id")
    .eq("title", SEED.program)
    .throwOnError();
  if (programs?.length) {
    await client
      .from("programs")
      .delete()
      .in(
        "id",
        programs.map((row) => row.id),
      )
      .throwOnError();
  }

  const { data: courses } = await client
    .from("courses")
    .select("id")
    .in("title", Object.values(SEED.courses))
    .throwOnError();
  if (courses?.length) {
    await client
      .from("courses")
      .delete()
      .in(
        "id",
        courses.map((row) => row.id),
      )
      .throwOnError();
  }

  await client
    .from("quizzes")
    .delete()
    .in("title", ["E2E Knowledge Check", "E2E Policy Check"])
    .throwOnError();
  await client
    .from("assignments")
    .delete()
    .eq("title", "E2E Call Notes Assignment")
    .throwOnError();
  await client
    .from("role_groups")
    .delete()
    .eq("name", SEED.roleGroup)
    .throwOnError();

  const { data: listed, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  const seedEmails = new Set(Object.values(SEED.users).map((user) => user.email));
  for (const user of listed.users) {
    if (user.email && seedEmails.has(user.email)) {
      const { error: deleteError } = await client.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
    }
  }
}

async function createSeedUsers(client: SupabaseClient) {
  const ids: Record<keyof typeof SEED.users, string> = {
    owner: "",
    learner: "",
    unassignedLearner: "",
  };

  for (const [key, user] of Object.entries(SEED.users) as Array<
    [keyof typeof SEED.users, SeedUser]
  >) {
    const { data, error } = await client.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (error || !data.user) {
      throw error ?? new Error(`Failed to create ${key} seed user`);
    }
    ids[key] = data.user.id;
    await client
      .from("profiles")
      .update({
        full_name: user.fullName,
        system_role: user.systemRole,
        status: "active",
      })
      .eq("id", data.user.id)
      .throwOnError();
  }

  return ids;
}

async function createCourse(input: {
  title: string;
  description: string;
  sortOrder: number;
  roleGroupId: string;
  includeQuiz: boolean;
  includeAssignment: boolean;
  standalone?: boolean;
}) {
  const courseId = await insertOne("courses", {
    title: input.title,
    description: input.description,
    is_published: true,
    certificate_enabled: true,
    sort_order: input.sortOrder,
  });
  await supabase
    .from("course_access")
    .insert({ course_id: courseId, role_group_id: input.roleGroupId })
    .throwOnError();

  const moduleOneId = await insertOne("modules", {
    course_id: courseId,
    title: "E2E Module 1",
    description: "Seeded module for E2E navigation and completion tests.",
    sort_order: 10,
  });
  const moduleTwoId = await insertOne("modules", {
    course_id: courseId,
    title: "E2E Module 2",
    description: "Second seeded module for count and navigation tests.",
    sort_order: 20,
  });

  const introLessonId = await insertOne("lessons", {
    module_id: moduleOneId,
    title: input.standalone ? "E2E Standalone Intro" : "E2E Fundamentals Intro",
    description: "A text lesson with a required block.",
    lesson_type: "content",
    is_required_for_completion: true,
    sort_order: 10,
  });
  await supabase
    .from("content_blocks")
    .insert([
      {
        lesson_id: introLessonId,
        block_type: "text",
        content: {
          seed_key: input.standalone
            ? "standalone-intro"
            : "fundamentals-intro",
          html:
            "<h2>BMH Group operating standard</h2><p>Confirm the seller's goal, capture the facts, and keep notes concise.</p>",
        },
        sort_order: 10,
        is_required_for_completion: true,
      },
      {
        lesson_id: introLessonId,
        block_type: "callout",
        content: {
          markdown:
            "Use plain English. Ask one question at a time. Confirm next steps before ending the call.",
          variant: "info",
        },
        sort_order: 20,
        is_required_for_completion: false,
      },
    ])
    .throwOnError();

  if (input.includeQuiz) {
    const quizId = await createQuiz(
      input.standalone ? "E2E Policy Check" : "E2E Knowledge Check",
    );
    await insertOne("lessons", {
      module_id: moduleOneId,
      title: input.standalone ? "E2E Policy Quiz" : "E2E Knowledge Check",
      description: "Seeded quiz lesson for Playwright submission coverage.",
      lesson_type: "quiz",
      quiz_id: quizId,
      is_required_for_completion: true,
      sort_order: 20,
    });
  }

  if (input.includeAssignment) {
    const assignmentId = await insertOne("assignments", {
      title: "E2E Call Notes Assignment",
      instructions:
        "Submit a short summary of the seller's goal, property condition, and next step.",
      submission_type: "text",
      requires_review: true,
    });
    await insertOne("lessons", {
      module_id: moduleTwoId,
      title: "E2E Call Notes Assignment",
      description: "Seeded assignment lesson for admin review coverage.",
      lesson_type: "assignment",
      assignment_id: assignmentId,
      is_required_for_completion: true,
      sort_order: 10,
    });
  } else {
    await insertOne("lessons", {
      module_id: moduleTwoId,
      title: input.standalone ? "E2E Policy Wrap Up" : "E2E Objection Practice",
      description: "A second content lesson to prove module and lesson counts.",
      lesson_type: "content",
      is_required_for_completion: true,
      sort_order: 10,
    });
  }

  return courseId;
}

async function createQuiz(title: string) {
  const quizId = await insertOne("quizzes", {
    title,
    description: "Seeded quiz for durable Playwright coverage.",
    passing_score: 80,
    randomize_questions: false,
    randomize_answers: false,
    questions_per_attempt: null,
    max_attempts: 3,
    retake_cooldown_hours: 0,
    show_correct_answers_after: "after_pass",
  });
  const questionId = await insertOne("questions", {
    quiz_id: quizId,
    question_text: "What should a BMH Group VA confirm before ending a call?",
    question_type: "single_choice",
    explanation:
      "The learner should confirm the next step so the workflow stays clear.",
    points: 1,
    sort_order: 10,
  });
  await supabase
    .from("answer_options")
    .insert([
      {
        question_id: questionId,
        option_text: "The next step",
        is_correct: true,
        sort_order: 10,
      },
      {
        question_id: questionId,
        option_text: "Only the caller's first name",
        is_correct: false,
        sort_order: 20,
      },
      {
        question_id: questionId,
        option_text: "Nothing, end immediately",
        is_correct: false,
        sort_order: 30,
      },
    ])
    .throwOnError();
  return quizId;
}

async function insertOne(table: string, values: Record<string, unknown>) {
  const { data, error } = await supabase
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
