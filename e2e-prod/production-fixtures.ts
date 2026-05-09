import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ProductionReadinessFixture = {
  prefix: string;
  password: string;
  roleGroupId: string;
  programId: string;
  courseId: string;
  moduleId: string;
  contentLessonId: string;
  contentBlockId: string;
  embedBlockId: string;
  quizId: string;
  quizLessonId: string;
  correctOptionText: string;
  textAssignmentId: string;
  textAssignmentLessonId: string;
  fileAssignmentId: string;
  fileAssignmentLessonId: string;
  admin: { id: string; email: string };
  learner: { id: string; email: string };
  unassigned: { id: string; email: string };
};

export type ProductionInviteFixture = {
  prefix: string;
  password: string;
  roleGroupId: string;
  programId: string;
  inviter: { id: string; email: string };
  inviteeEmail: string;
};

export type ProductionRecoveryFixture = {
  email: string;
  userId: string;
  oldPassword: string;
  newPassword: string;
};

type InsertResult = { id: string };

const PROD_PROJECT_REF = "dhvfsyteqsxagokoerrx";

export function productionAdminClient(): SupabaseClient {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Production readiness needs TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!url.includes(PROD_PROJECT_REF)) {
    throw new Error(
      `Production readiness must point at production ref ${PROD_PROJECT_REF}.`,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function productionAnonClient(): SupabaseClient {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Production readiness needs TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY.",
    );
  }
  if (!url.includes(PROD_PROJECT_REF)) {
    throw new Error(
      `Production readiness must point at production ref ${PROD_PROJECT_REF}.`,
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function productionUserClient(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = productionAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function createProductionReadinessFixture(
  admin: SupabaseClient,
): Promise<ProductionReadinessFixture> {
  const prefix = `PRD-READY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = process.env.PROD_READINESS_TEST_PASSWORD?.trim()
    || `BMHProdReady-${crypto.randomUUID()}!1`;
  const adminEmail = `${prefix.toLowerCase()}-admin@bmh-institute.test`;
  const learnerEmail = `${prefix.toLowerCase()}-learner@bmh-institute.test`;
  const unassignedEmail = `${prefix.toLowerCase()}-unassigned@bmh-institute.test`;

  const adminUser = await createFixtureUser(admin, {
    email: adminEmail,
    password,
    fullName: `${prefix} Admin`,
    systemRole: "owner",
  });
  const learner = await createFixtureUser(admin, {
    email: learnerEmail,
    password,
    fullName: `${prefix} Learner`,
    systemRole: "learner",
  });
  const unassigned = await createFixtureUser(admin, {
    email: unassignedEmail,
    password,
    fullName: `${prefix} Unassigned`,
    systemRole: "learner",
  });

  const roleGroupId = await insertOne(admin, "role_groups", {
    name: `${prefix} Role Group`,
    description: "Disposable production-readiness role group.",
  });
  await admin
    .from("user_role_groups")
    .insert({ user_id: learner.id, role_group_id: roleGroupId })
    .throwOnError();

  const programId = await insertOne(admin, "programs", {
    title: `${prefix} Program`,
    description: "Disposable production-readiness program.",
    is_published: true,
    course_order_mode: "free",
    certificate_enabled: true,
    sort_order: 9999,
  });
  const courseId = await insertOne(admin, "courses", {
    title: `${prefix} Course`,
    description: "Disposable production-readiness course.",
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
    description: "Disposable production-readiness module.",
    sort_order: 10,
  });
  const contentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Content Lesson`,
    description: "Disposable content lesson.",
    lesson_type: "content",
    is_required_for_completion: true,
    sort_order: 10,
  });
  const contentBlockId = await insertOne(admin, "content_blocks", {
    lesson_id: contentLessonId,
    block_type: "text",
    content: {
      html: `<h2>${prefix} Operating standard</h2><p>Disposable production-readiness content.</p>`,
    },
    sort_order: 10,
    is_required_for_completion: true,
  });
  const embedBlockId = await insertOne(admin, "content_blocks", {
    lesson_id: contentLessonId,
    block_type: "embed",
    content: {
      iframe_src: "https://example.com",
      aspect_ratio: "16:9",
    },
    sort_order: 20,
    is_required_for_completion: false,
  });

  const quizId = await insertOne(admin, "quizzes", {
    title: `${prefix} Quiz`,
    description: "Disposable production-readiness quiz.",
    passing_score: 80,
    randomize_questions: false,
    randomize_answers: false,
    max_attempts: 3,
    retake_cooldown_hours: 0,
    show_correct_answers_after: "after_pass",
  });
  const questionId = await insertOne(admin, "questions", {
    quiz_id: quizId,
    question_text: "What confirms the production readiness quiz path?",
    question_type: "single_choice",
    explanation: "The test selects the known correct option.",
    points: 1,
    sort_order: 10,
  });
  const correctOptionText = `${prefix} correct answer`;
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
        option_text: `${prefix} incorrect answer`,
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
    sort_order: 20,
  });

  const textAssignmentId = await insertOne(admin, "assignments", {
    title: `${prefix} Text Assignment`,
    instructions: "Submit a text response for production-readiness validation.",
    submission_type: "text",
    requires_review: true,
  });
  const textAssignmentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Text Assignment Lesson`,
    description: "Disposable text assignment lesson.",
    lesson_type: "assignment",
    assignment_id: textAssignmentId,
    is_required_for_completion: true,
    sort_order: 30,
  });

  const fileAssignmentId = await insertOne(admin, "assignments", {
    title: `${prefix} File Assignment`,
    instructions: "Upload a file for production-readiness validation.",
    submission_type: "file_upload",
    requires_review: true,
  });
  const fileAssignmentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} File Assignment Lesson`,
    description: "Disposable file assignment lesson.",
    lesson_type: "assignment",
    assignment_id: fileAssignmentId,
    is_required_for_completion: true,
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
    embedBlockId,
    quizId,
    quizLessonId,
    correctOptionText,
    textAssignmentId,
    textAssignmentLessonId,
    fileAssignmentId,
    fileAssignmentLessonId,
    admin: adminUser,
    learner,
    unassigned,
  };
}

export async function cleanupProductionReadinessFixture(
  admin: SupabaseClient,
  fixture: ProductionReadinessFixture | null,
): Promise<void> {
  if (!fixture) return;

  await cleanupProductionReadinessStorage(admin, fixture.learner.id);
  await admin.from("programs").delete().eq("id", fixture.programId);
  await admin.from("courses").delete().eq("id", fixture.courseId);
  await admin
    .from("assignments")
    .delete()
    .in("id", [fixture.textAssignmentId, fixture.fileAssignmentId]);
  await admin.from("quizzes").delete().eq("id", fixture.quizId);
  await admin.from("role_groups").delete().eq("id", fixture.roleGroupId);
  await admin.auth.admin.deleteUser(fixture.admin.id);
  await admin.auth.admin.deleteUser(fixture.learner.id);
  await admin.auth.admin.deleteUser(fixture.unassigned.id);
}

export async function createProductionInviteFixture(
  admin: SupabaseClient,
  inviteeEmail: string,
): Promise<ProductionInviteFixture> {
  const prefix = `PRD-INVITE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = process.env.PROD_READINESS_TEST_PASSWORD?.trim()
    || `BMHProdInvite-${crypto.randomUUID()}!1`;

  const inviter = await createFixtureUser(admin, {
    email: `${prefix.toLowerCase()}-owner@bmh-institute.test`,
    password,
    fullName: `${prefix} Owner`,
    systemRole: "owner",
  });

  const roleGroupId = await insertOne(admin, "role_groups", {
    name: `${prefix} Invite Role Group`,
    description: "Disposable production invite role group.",
  });

  const programId = await insertOne(admin, "programs", {
    title: `${prefix} Invite Program`,
    description: "Disposable production invite program.",
    is_published: true,
    course_order_mode: "free",
    certificate_enabled: false,
    sort_order: 9999,
  });

  await admin
    .from("program_access")
    .insert({ program_id: programId, role_group_id: roleGroupId })
    .throwOnError();

  return {
    prefix,
    password,
    roleGroupId,
    programId,
    inviter,
    inviteeEmail,
  };
}

export async function cleanupProductionInviteFixture(
  admin: SupabaseClient,
  fixture: ProductionInviteFixture | null,
): Promise<void> {
  if (!fixture) return;

  await admin.from("invites").delete().eq("email", fixture.inviteeEmail);
  await admin.from("programs").delete().eq("id", fixture.programId);
  await admin.from("role_groups").delete().eq("id", fixture.roleGroupId);
  await deleteAuthUserByEmail(admin, fixture.inviteeEmail);
  await admin.auth.admin.deleteUser(fixture.inviter.id);
}

export async function createProductionRecoveryFixture(
  admin: SupabaseClient,
  email: string,
): Promise<ProductionRecoveryFixture> {
  const oldPassword = process.env.PROD_READINESS_TEST_PASSWORD?.trim()
    || `BMHProdRecovery-${crypto.randomUUID()}!1`;
  const newPassword = `BMHProdRecoveryNew-${crypto.randomUUID()}!1`;
  const user = await createFixtureUser(admin, {
    email,
    password: oldPassword,
    fullName: "Production Readiness Recovery",
    systemRole: "learner",
  });
  return { email, userId: user.id, oldPassword, newPassword };
}

export async function cleanupProductionRecoveryFixture(
  admin: SupabaseClient,
  fixture: ProductionRecoveryFixture | null,
): Promise<void> {
  if (!fixture) return;
  await admin.auth.admin.deleteUser(fixture.userId);
}

async function cleanupProductionReadinessStorage(
  admin: SupabaseClient,
  learnerId: string,
) {
  const { data, error } = await admin.storage
    .from("submissions")
    .list(learnerId, { limit: 1000 });
  if (error) throw error;

  const paths = (data ?? [])
    .map((item) => `${learnerId}/${item.name}`)
    .filter(
      (path) =>
        path.endsWith("production-readiness-upload.txt") ||
        path.endsWith("blocked-cross-prefix.txt"),
    );

  if (paths.length > 0) {
    const { error: removeError } = await admin.storage
      .from("submissions")
      .remove(paths);
    if (removeError) throw removeError;
  }
}

async function deleteAuthUserByEmail(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (user) {
    await admin.auth.admin.deleteUser(user.id);
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
