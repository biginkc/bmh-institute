import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertCanonicalSupabaseProjectUrl } from "../src/lib/supabase/canonical-project-url";

export type WritePathFixture = {
  prefix: string;
  password: string;
  roleGroupId: string;
  programId: string;
  courseId: string;
  moduleId: string;
  contentLessonId: string;
  contentBlockId: string;
  quizId: string;
  quizLessonId: string;
  correctOptionText: string;
  incorrectOptionText: string;
  textAssignmentId: string;
  textAssignmentLessonId: string;
  fileAssignmentId: string;
  fileAssignmentLessonId: string;
  reviewerProgramIds: string[];
  admin: { id: string; email: string };
  learner: { id: string; email: string };
  unassigned: { id: string; email: string };
};

type InsertResult = { id: string };

const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";

export function writePathAdminClient(): SupabaseClient {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Write-path E2E needs TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  try {
    assertCanonicalSupabaseProjectUrl(url, [TEST_PROJECT_REF]);
  } catch {
    throw new Error(
      `Write-path E2E requires exact test origin https://${TEST_PROJECT_REF}.supabase.co.`,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createWritePathFixture(
  admin: SupabaseClient,
): Promise<WritePathFixture> {
  const prefix = `E2E-WRITE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password =
    process.env.E2E_SEED_PASSWORD?.trim() ||
    `BMHWritePath-${crypto.randomUUID()}!1`;

  // Resolve the existing unreleased imported programs before creating any
  // disposable users, so a hosted-catalog read failure cannot strand users.
  const { data: importedPrograms, error: importedProgramsError } = await admin
    .from("programs")
    .select("id")
    .not("content_import_id", "is", null)
    .eq("is_published", false);
  if (importedProgramsError) throw importedProgramsError;
  const reviewerProgramIds = (importedPrograms ?? []).map(
    (program) => program.id,
  );

  const adminUser = await createFixtureUser(admin, {
    email: `${prefix.toLowerCase()}-admin@bmh-institute.test`,
    password,
    fullName: `${prefix} Admin`,
    systemRole: "owner",
  });
  const learner = await createFixtureUser(admin, {
    email: `${prefix.toLowerCase()}-learner@bmh-institute.test`,
    password,
    fullName: `${prefix} Learner`,
    systemRole: "learner",
  });
  const unassigned = await createFixtureUser(admin, {
    email: `${prefix.toLowerCase()}-unassigned@bmh-institute.test`,
    password,
    fullName: `${prefix} Unassigned`,
    systemRole: "learner",
  });

  // The hosted TEST catalog can contain unreleased imported programs. The
  // report completion RPC correctly requires an explicit reviewer grant for
  // those lessons, even for an owner. Grant the disposable fixture owner
  // access to that existing test catalog and remove the grants during cleanup;
  // this keeps the E2E fixture aligned with the production authorization
  // boundary instead of weakening the RPC or report page.
  if (reviewerProgramIds.length > 0) {
    const grantedReviewerProgramIds: string[] = [];
    try {
      for (const programId of reviewerProgramIds) {
        await admin
          .rpc("fn_set_unreleased_import_reviewer_v1", {
            p_program_id: programId,
            p_user_id: adminUser.id,
            p_allowed: true,
          })
          .throwOnError();
        grantedReviewerProgramIds.push(programId);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const programId of grantedReviewerProgramIds) {
        try {
          await admin
            .rpc("fn_set_unreleased_import_reviewer_v1", {
              p_program_id: programId,
              p_user_id: adminUser.id,
              p_allowed: false,
            })
            .throwOnError();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      const userCleanupErrors = await deleteFixtureUsers(admin, [
        adminUser.id,
        learner.id,
        unassigned.id,
      ]);
      if (rollbackErrors.length > 0 || userCleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors, ...userCleanupErrors],
          "Failed to create and roll back disposable reviewer grants.",
        );
      }
      throw error;
    }
  }

  const roleGroupId = await insertOne(admin, "role_groups", {
    name: `${prefix} Role Group`,
    description: "Disposable write-path E2E role group.",
  });
  await admin
    .from("user_role_groups")
    .insert({ user_id: learner.id, role_group_id: roleGroupId })
    .throwOnError();

  const programId = await insertOne(admin, "programs", {
    title: `${prefix} Program`,
    description: "Disposable write-path E2E program.",
    is_published: true,
    course_order_mode: "free",
    certificate_enabled: true,
    sort_order: 9999,
  });
  const courseId = await insertOne(admin, "courses", {
    title: `${prefix} Course`,
    description: "Disposable write-path E2E course.",
    is_published: true,
    certificate_enabled: true,
    sort_order: 9999,
  });
  await admin
    .from("program_access")
    .insert({ program_id: programId, role_group_id: roleGroupId })
    .throwOnError();
  await admin
    .from("course_access")
    .insert({ course_id: courseId, role_group_id: roleGroupId })
    .throwOnError();
  await admin
    .from("program_courses")
    .insert({ program_id: programId, course_id: courseId, sort_order: 10 })
    .throwOnError();

  const moduleId = await insertOne(admin, "modules", {
    course_id: courseId,
    title: `${prefix} Module`,
    description: "Disposable write-path E2E module.",
    sort_order: 10,
  });
  const contentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Content Lesson`,
    description: "Disposable content lesson.",
    lesson_type: "content",
    is_required_for_completion: false,
    sort_order: 10,
  });
  await insertOne(admin, "content_blocks", {
    lesson_id: contentLessonId,
    block_type: "text",
    content: {
      html: `<h2>${prefix} Operating standard</h2><p>Keep notes concise and confirm next steps.</p>`,
    },
    sort_order: 10,
    is_required_for_completion: false,
  });
  const contentBlockId = await insertOne(admin, "content_blocks", {
    lesson_id: contentLessonId,
    block_type: "embed",
    content: {
      iframe_src: "https://www.loom.com/embed/original",
      aspect_ratio: "16:9",
    },
    sort_order: 20,
    is_required_for_completion: false,
  });

  const quizId = await insertOne(admin, "quizzes", {
    title: `${prefix} Quiz`,
    description: "Disposable write-path E2E quiz.",
    passing_score: 80,
    randomize_questions: false,
    randomize_answers: false,
    max_attempts: 3,
    retake_cooldown_hours: 0,
    show_correct_answers_after: "after_pass",
  });
  const questionId = await insertOne(admin, "questions", {
    quiz_id: quizId,
    question_text: "What should a BMH Group VA confirm before ending a call?",
    question_type: "single_choice",
    explanation: "A next step keeps the workflow clear.",
    points: 1,
    sort_order: 10,
  });
  const correctOptionText = `${prefix} confirm the next step`;
  const incorrectOptionText = `${prefix} end without notes`;
  await admin
    .from("answer_options")
    .insert([
      {
        question_id: questionId,
        option_text: correctOptionText,
        is_correct: true,
        sort_order: 10,
      },
      {
        question_id: questionId,
        option_text: incorrectOptionText,
        is_correct: false,
        sort_order: 20,
      },
    ])
    .throwOnError();
  const quizLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Quiz Lesson`,
    description: "Disposable quiz lesson.",
    lesson_type: "quiz",
    quiz_id: quizId,
    is_required_for_completion: true,
    prerequisite_lesson_id: contentLessonId,
    sort_order: 20,
  });

  const textAssignmentId = await insertOne(admin, "assignments", {
    title: `${prefix} Text Assignment`,
    instructions: "Submit a brief call-note summary.",
    submission_type: "text",
    requires_review: true,
    rubric: [
      {
        criterion: "Clarity",
        description: "The response is concise and confirms the next action.",
      },
    ],
  });
  const textAssignmentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Text Assignment Lesson`,
    description: "Disposable text assignment lesson.",
    lesson_type: "assignment",
    assignment_id: textAssignmentId,
    is_required_for_completion: true,
    prerequisite_lesson_id: quizLessonId,
    sort_order: 30,
  });

  const fileAssignmentId = await insertOne(admin, "assignments", {
    title: `${prefix} File Assignment`,
    instructions: "Upload a short call-note file.",
    submission_type: "file_upload",
    requires_review: true,
    rubric: [
      {
        criterion: "Completeness",
        description: "The uploaded note contains the required evidence.",
      },
    ],
  });
  const fileAssignmentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} File Assignment Lesson`,
    description: "Disposable file assignment lesson.",
    lesson_type: "assignment",
    assignment_id: fileAssignmentId,
    is_required_for_completion: true,
    prerequisite_lesson_id: textAssignmentLessonId,
    sort_order: 40,
  });

  return {
    prefix,
    password,
    roleGroupId,
    programId,
    courseId,
    moduleId,
    contentLessonId,
    contentBlockId,
    quizId,
    quizLessonId,
    correctOptionText,
    incorrectOptionText,
    textAssignmentId,
    textAssignmentLessonId,
    fileAssignmentId,
    fileAssignmentLessonId,
    reviewerProgramIds,
    admin: adminUser,
    learner,
    unassigned,
  };
}

export async function cleanupWritePathFixture(
  admin: SupabaseClient,
  fixture: WritePathFixture | null,
): Promise<void> {
  if (!fixture) return;

  const cleanupErrors: unknown[] = [];
  try {
    await cleanupSubmissionStorage(admin, fixture.learner.id);
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (fixture.reviewerProgramIds.length > 0) {
    for (const programId of fixture.reviewerProgramIds) {
      try {
        await admin
          .rpc("fn_set_unreleased_import_reviewer_v1", {
            p_program_id: programId,
            p_user_id: fixture.admin.id,
            p_allowed: false,
          })
          .throwOnError();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  await captureCleanupError(cleanupErrors, () =>
    admin.from("programs").delete().eq("id", fixture.programId).throwOnError(),
  );
  await captureCleanupError(cleanupErrors, () =>
    admin.from("courses").delete().eq("id", fixture.courseId).throwOnError(),
  );
  await captureCleanupError(cleanupErrors, () =>
    admin
      .from("assignments")
      .delete()
      .in("id", [fixture.textAssignmentId, fixture.fileAssignmentId])
      .throwOnError(),
  );
  await captureCleanupError(cleanupErrors, () =>
    admin.from("quizzes").delete().eq("id", fixture.quizId).throwOnError(),
  );
  await captureCleanupError(cleanupErrors, () =>
    admin
      .from("role_groups")
      .delete()
      .eq("id", fixture.roleGroupId)
      .throwOnError(),
  );
  await captureCleanupError(cleanupErrors, () =>
    deleteFixtureUsers(admin, [
      fixture.admin.id,
      fixture.learner.id,
      fixture.unassigned.id,
    ]),
  );
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Failed to clean up one or more disposable fixture resources.",
    );
  }
}

async function captureCleanupError(
  errors: unknown[],
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    errors.push(error);
  }
}

async function deleteFixtureUsers(
  admin: SupabaseClient,
  userIds: string[],
): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const userId of userIds) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function cleanupSubmissionStorage(
  admin: SupabaseClient,
  learnerId: string,
): Promise<void> {
  const { data, error } = await admin.storage
    .from("submissions")
    .list(learnerId, { limit: 1000 });
  if (error) throw error;

  const paths = (data ?? [])
    .map((item) => `${learnerId}/${item.name}`)
    .filter((path) => path.endsWith("write-path-upload.txt"));

  if (paths.length > 0) {
    const { error: removeError } = await admin.storage
      .from("submissions")
      .remove(paths);
    if (removeError) throw removeError;
  }
}

async function createFixtureUser(
  admin: SupabaseClient,
  input: {
    email: string;
    password: string;
    fullName: string;
    systemRole: "owner" | "admin" | "learner";
  },
): Promise<{ id: string; email: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) {
    throw error ?? new Error(`Failed to create ${input.email}`);
  }
  await admin
    .from("profiles")
    .update({
      full_name: input.fullName,
      system_role: input.systemRole,
      status: "active",
    })
    .eq("id", data.user.id)
    .throwOnError();
  return { id: data.user.id, email: input.email };
}

async function insertOne(
  admin: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from(table)
    .insert(values)
    .select("id")
    .single<InsertResult>();
  if (error || !data) {
    throw error ?? new Error(`Failed to insert ${table}`);
  }
  return data.id;
}
