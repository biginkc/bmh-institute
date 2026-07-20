import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { PRODUCTION_READINESS_VIDEO_BASE64 } from "../src/lib/testing/production-readiness-media";

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
  videoPath: string;
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
  courseId: string;
  inviter: { id: string; email: string };
  inviteeEmail: string;
};

export type ProductionRecoveryFixture = {
  email: string;
  userId: string;
  oldPassword: string;
  newPassword: string;
};

export type ProductionPilotDryRunFixture = {
  prefix: string;
  password: string;
  roleGroupId: string;
  programId: string;
  courseId: string;
  moduleId: string;
  contentLessonId: string;
  quizId: string;
  quizLessonId: string;
  textAssignmentId: string;
  textAssignmentLessonId: string;
  admin: { id: string; email: string };
  certified: { id: string; email: string };
  needsReview: { id: string; email: string };
  needsRevision: { id: string; email: string };
  notStarted: { id: string; email: string };
  needsAccess: { id: string; email: string };
  accessCorrection: { id: string; email: string };
  suspended: { id: string; email: string };
};

type InsertResult = { id: string };

type FixtureRollbackAction = {
  label: string;
  run: () => Promise<void>;
};

async function runCleanupActions(
  scope: string,
  actions: FixtureRollbackAction[],
): Promise<void> {
  const failures: Error[] = [];
  for (const action of actions) {
    try {
      await action.run();
    } catch (error) {
      failures.push(new Error(`Cleanup failed for ${action.label}.`, { cause: error }));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${scope} cleanup was incomplete.`);
  }
}

class FixtureCleanupJournal {
  private actions: FixtureRollbackAction[] = [];

  add(label: string, run: () => Promise<void>): void {
    this.actions.push({ label, run });
  }

  commit(): void {
    this.actions = [];
  }

  async rollback(): Promise<Error[]> {
    const failures: Error[] = [];
    for (const action of this.actions.reverse()) {
      try {
        await action.run();
      } catch (error) {
        failures.push(new Error(`Fixture rollback failed for ${action.label}.`, { cause: error }));
      }
    }
    this.actions = [];
    return failures;
  }
}

async function buildFixtureWithRollback<T>(
  build: (journal: FixtureCleanupJournal) => Promise<T>,
): Promise<T> {
  const journal = new FixtureCleanupJournal();
  try {
    const fixture = await build(journal);
    journal.commit();
    return fixture;
  } catch (error) {
    const originalError = error;
    const cleanupFailures = await journal.rollback();
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [originalError, ...cleanupFailures],
        "Fixture construction failed and its rollback was incomplete.",
        { cause: originalError },
      );
    }
    throw originalError;
  }
}

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
  return buildFixtureWithRollback(async (journal) => {
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
  }, journal);
  const learner = await createFixtureUser(admin, {
    email: learnerEmail,
    password,
    fullName: `${prefix} Learner`,
    systemRole: "learner",
  }, journal);
  const unassigned = await createFixtureUser(admin, {
    email: unassignedEmail,
    password,
    fullName: `${prefix} Unassigned`,
    systemRole: "learner",
  }, journal);

  const roleGroupId = await insertOne(admin, "role_groups", {
    name: `${prefix} Role Group`,
    description: "Disposable production-readiness role group.",
  });
  journalTableRow(admin, journal, "role_groups", roleGroupId);
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
  journalTableRow(admin, journal, "programs", programId);
  const courseId = await insertOne(admin, "courses", {
    title: `${prefix} Course`,
    description: "Disposable production-readiness course.",
    is_published: true,
    certificate_enabled: true,
    sort_order: 9999,
  });
  journalTableRow(admin, journal, "courses", courseId);
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
    is_required_for_completion: false,
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
  const videoPath = `production-readiness/${prefix}/required-video.webm`;
  const { error: videoUploadError } = await admin.storage
    .from("content")
    .upload(videoPath, Buffer.from(PRODUCTION_READINESS_VIDEO_BASE64, "base64"), {
      contentType: "video/webm",
      upsert: false,
    });
  if (videoUploadError) throw videoUploadError;
  journal.add(`storage content/${videoPath}`, async () => {
    await removeStorageObjects(admin, "content", [videoPath]);
  });
  await insertOne(admin, "content_blocks", {
    lesson_id: contentLessonId,
    block_type: "video",
    content: {
      source: "upload",
      file_path: videoPath,
      duration_seconds: 1,
      title: `${prefix} Required video`,
    },
    sort_order: 30,
    is_required_for_completion: true,
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
  journalTableRow(admin, journal, "quizzes", quizId);
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
    prerequisite_lesson_id: contentLessonId,
    sort_order: 20,
  });

  const textAssignmentId = await insertOne(admin, "assignments", {
    title: `${prefix} Text Assignment`,
    instructions: "Submit a text response for production-readiness validation.",
    submission_type: "text",
    requires_review: true,
  });
  journalTableRow(admin, journal, "assignments", textAssignmentId);
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
    instructions: "Upload a file for production-readiness validation.",
    submission_type: "file_upload",
    requires_review: true,
  });
  journalTableRow(admin, journal, "assignments", fileAssignmentId);
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
    embedBlockId,
    videoPath,
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
  });
}

export async function cleanupProductionReadinessFixture(
  admin: SupabaseClient,
  fixture: ProductionReadinessFixture | null,
): Promise<void> {
  if (!fixture) return;

  await runCleanupActions("Production readiness fixture", [
    { label: "readiness storage", run: () => cleanupProductionReadinessStorage(admin, fixture) },
    { label: `program ${fixture.programId}`, run: () => deleteRow(admin, "programs", fixture.programId) },
    { label: `course ${fixture.courseId}`, run: () => deleteRow(admin, "courses", fixture.courseId) },
    {
      label: "readiness assignments",
      run: async () => {
        await admin.from("assignments").delete()
          .in("id", [fixture.textAssignmentId, fixture.fileAssignmentId]).throwOnError();
      },
    },
    { label: `quiz ${fixture.quizId}`, run: () => deleteRow(admin, "quizzes", fixture.quizId) },
    { label: `role group ${fixture.roleGroupId}`, run: () => deleteRow(admin, "role_groups", fixture.roleGroupId) },
    { label: `admin user ${fixture.admin.id}`, run: () => deleteAuthUser(admin, fixture.admin.id) },
    { label: `learner user ${fixture.learner.id}`, run: () => deleteAuthUser(admin, fixture.learner.id) },
    { label: `unassigned user ${fixture.unassigned.id}`, run: () => deleteAuthUser(admin, fixture.unassigned.id) },
  ]);
}

export async function createProductionInviteFixture(
  admin: SupabaseClient,
  inviteeEmail: string,
): Promise<ProductionInviteFixture> {
  return buildFixtureWithRollback(async (journal) => {
  const prefix = `PRD-INVITE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = process.env.PROD_READINESS_TEST_PASSWORD?.trim()
    || `BMHProdInvite-${crypto.randomUUID()}!1`;

  const inviter = await createFixtureUser(admin, {
    email: `${prefix.toLowerCase()}-owner@bmh-institute.test`,
    password,
    fullName: `${prefix} Owner`,
    systemRole: "owner",
  }, journal);

  const roleGroupId = await insertOne(admin, "role_groups", {
    name: `${prefix} Invite Role Group`,
    description: "Disposable production invite role group.",
  });
  journalTableRow(admin, journal, "role_groups", roleGroupId);

  const programId = await insertOne(admin, "programs", {
    title: `${prefix} Invite Program`,
    description: "Disposable production invite program.",
    is_published: true,
    course_order_mode: "free",
    certificate_enabled: false,
    sort_order: 9999,
  });
  journalTableRow(admin, journal, "programs", programId);
  const courseId = await insertOne(admin, "courses", {
    title: `${prefix} Invite Course`,
    description: "Disposable production invite course.",
    is_published: true,
    certificate_enabled: false,
    sort_order: 9999,
  });
  journalTableRow(admin, journal, "courses", courseId);

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

  return {
    prefix,
    password,
    roleGroupId,
    programId,
    courseId,
    inviter,
    inviteeEmail,
  };
  });
}

export async function cleanupProductionInviteFixture(
  admin: SupabaseClient,
  fixture: ProductionInviteFixture | null,
): Promise<void> {
  if (!fixture) return;

  await runCleanupActions("Production invite fixture", [
    {
      label: `invite ${fixture.inviteeEmail}`,
      run: async () => {
        await admin.from("invites").delete().eq("email", fixture.inviteeEmail).throwOnError();
      },
    },
    { label: `program ${fixture.programId}`, run: () => deleteRow(admin, "programs", fixture.programId) },
    { label: `course ${fixture.courseId}`, run: () => deleteRow(admin, "courses", fixture.courseId) },
    { label: `role group ${fixture.roleGroupId}`, run: () => deleteRow(admin, "role_groups", fixture.roleGroupId) },
    { label: `invitee user ${fixture.inviteeEmail}`, run: () => deleteAuthUserByEmail(admin, fixture.inviteeEmail) },
    { label: `inviter user ${fixture.inviter.id}`, run: () => deleteAuthUser(admin, fixture.inviter.id) },
  ]);
}

export async function createProductionRecoveryFixture(
  admin: SupabaseClient,
  email: string,
): Promise<ProductionRecoveryFixture> {
  return buildFixtureWithRollback(async (journal) => {
  const oldPassword = process.env.PROD_READINESS_TEST_PASSWORD?.trim()
    || `BMHProdRecovery-${crypto.randomUUID()}!1`;
  const newPassword = `BMHProdRecoveryNew-${crypto.randomUUID()}!1`;
  const user = await createFixtureUser(admin, {
    email,
    password: oldPassword,
    fullName: "Production Readiness Recovery",
    systemRole: "learner",
  }, journal);
  return { email, userId: user.id, oldPassword, newPassword };
  });
}

export async function cleanupProductionRecoveryFixture(
  admin: SupabaseClient,
  fixture: ProductionRecoveryFixture | null,
): Promise<void> {
  if (!fixture) return;
  await runCleanupActions("Production recovery fixture", [
    { label: `recovery user ${fixture.userId}`, run: () => deleteAuthUser(admin, fixture.userId) },
  ]);
}

export async function createProductionPilotDryRunFixture(
  admin: SupabaseClient,
): Promise<ProductionPilotDryRunFixture> {
  return buildFixtureWithRollback(async (journal) => {
  const prefix = `PILOT-DRYRUN-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const password = process.env.PROD_READINESS_TEST_PASSWORD?.trim()
    || `BMHPilotDryRun-${crypto.randomUUID()}!1`;
  const email = (name: string) =>
    `${prefix.toLowerCase()}-${name}@bmh-institute.test`;

  // Sequential creation prevents a rejected Promise.all from racing rollback
  // while another auth request is still creating a user.
  const adminUser = await createFixtureUser(admin, {
    email: email("owner"),
    password,
    fullName: `${prefix} Owner`,
    systemRole: "owner",
  }, journal);
  const certified = await createFixtureUser(admin, {
    email: email("certified"),
    password,
    fullName: `${prefix} Certified Learner`,
    systemRole: "learner",
  }, journal);
  const needsReview = await createFixtureUser(admin, {
    email: email("needs-review"),
    password,
    fullName: `${prefix} Needs Review`,
    systemRole: "learner",
  }, journal);
  const needsRevision = await createFixtureUser(admin, {
    email: email("needs-revision"),
    password,
    fullName: `${prefix} Needs Revision`,
    systemRole: "learner",
  }, journal);
  const notStarted = await createFixtureUser(admin, {
    email: email("not-started"),
    password,
    fullName: `${prefix} Not Started`,
    systemRole: "learner",
  }, journal);
  const needsAccess = await createFixtureUser(admin, {
    email: email("needs-access"),
    password,
    fullName: `${prefix} Needs Access`,
    systemRole: "learner",
  }, journal);
  const accessCorrection = await createFixtureUser(admin, {
    email: email("access-correction"),
    password,
    fullName: `${prefix} Access Correction`,
    systemRole: "learner",
  }, journal);
  const suspended = await createFixtureUser(admin, {
    email: email("suspended"),
    password,
    fullName: `${prefix} Suspended`,
    systemRole: "learner",
  }, journal);

  const roleGroupId = await insertOne(admin, "role_groups", {
    name: `${prefix} Pilot Cohort`,
    description: "Disposable production pilot dry-run role group.",
  });
  journalTableRow(admin, journal, "role_groups", roleGroupId);

  await admin
    .from("user_role_groups")
    .insert([
      { user_id: certified.id, role_group_id: roleGroupId },
      { user_id: needsReview.id, role_group_id: roleGroupId },
      { user_id: needsRevision.id, role_group_id: roleGroupId },
      { user_id: notStarted.id, role_group_id: roleGroupId },
      { user_id: suspended.id, role_group_id: roleGroupId },
    ])
    .throwOnError();
  await admin
    .from("profiles")
    .update({ status: "suspended" })
    .eq("id", suspended.id)
    .throwOnError();

  const programId = await insertOne(admin, "programs", {
    title: `${prefix} Pilot Program`,
    description: "Disposable production pilot dry-run program.",
    is_published: true,
    course_order_mode: "free",
    certificate_enabled: true,
    sort_order: 9999,
  });
  journalTableRow(admin, journal, "programs", programId);
  const courseId = await insertOne(admin, "courses", {
    title: `${prefix} Pilot Course`,
    description: "Disposable production pilot dry-run course.",
    is_published: true,
    certificate_enabled: true,
    sort_order: 9999,
  });
  journalTableRow(admin, journal, "courses", courseId);
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
    title: `${prefix} Pilot Module`,
    description: "Disposable production pilot dry-run module.",
    sort_order: 10,
  });
  const contentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Pilot Content`,
    description: "Disposable pilot content lesson.",
    lesson_type: "content",
    is_required_for_completion: true,
    sort_order: 10,
  });
  await insertOne(admin, "content_blocks", {
    lesson_id: contentLessonId,
    block_type: "text",
    content: {
      html: `<h2>${prefix} Pilot standard</h2><p>Disposable pilot dry-run content.</p>`,
    },
    sort_order: 10,
    is_required_for_completion: true,
  });

  const quizId = await insertOne(admin, "quizzes", {
    title: `${prefix} Pilot Quiz`,
    description: "Disposable production pilot dry-run quiz.",
    passing_score: 80,
    randomize_questions: false,
    randomize_answers: false,
    max_attempts: 3,
    retake_cooldown_hours: 0,
    show_correct_answers_after: "after_pass",
  });
  journalTableRow(admin, journal, "quizzes", quizId);
  const questionId = await insertOne(admin, "questions", {
    quiz_id: quizId,
    question_text: "What confirms the pilot dry-run quiz path?",
    question_type: "single_choice",
    explanation: "The test inserts known passed attempts for reporting.",
    points: 1,
    sort_order: 10,
  });
  await admin
    .from("answer_options")
    .insert([
      {
        question_id: questionId,
        option_text: `${prefix} correct answer`,
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
    title: `${prefix} Pilot Quiz`,
    description: "Disposable pilot quiz lesson.",
    lesson_type: "quiz",
    quiz_id: quizId,
    is_required_for_completion: true,
    prerequisite_lesson_id: contentLessonId,
    sort_order: 20,
  });

  const textAssignmentId = await insertOne(admin, "assignments", {
    title: `${prefix} Pilot Assignment`,
    instructions: "Submit a response for production pilot dry-run validation.",
    submission_type: "text",
    requires_review: true,
  });
  journalTableRow(admin, journal, "assignments", textAssignmentId);
  const textAssignmentLessonId = await insertOne(admin, "lessons", {
    module_id: moduleId,
    title: `${prefix} Pilot Assignment`,
    description: "Disposable pilot assignment lesson.",
    lesson_type: "assignment",
    assignment_id: textAssignmentId,
    is_required_for_completion: true,
    prerequisite_lesson_id: quizLessonId,
    sort_order: 30,
  });

  await seedPilotDryRunStates(admin, {
    prefix,
    programId,
    courseId,
    contentLessonId,
    quizLessonId,
    textAssignmentId,
    textAssignmentLessonId,
    quizId,
    adminId: adminUser.id,
    certifiedId: certified.id,
    needsReviewId: needsReview.id,
    needsRevisionId: needsRevision.id,
  });

  return {
    prefix,
    password,
    roleGroupId,
    programId,
    courseId,
    moduleId,
    contentLessonId,
    quizId,
    quizLessonId,
    textAssignmentId,
    textAssignmentLessonId,
    admin: adminUser,
    certified,
    needsReview,
    needsRevision,
    notStarted,
    needsAccess,
    accessCorrection,
    suspended,
  };
  });
}

export async function cleanupProductionPilotDryRunFixture(
  admin: SupabaseClient,
  fixture: ProductionPilotDryRunFixture | null,
): Promise<void> {
  if (!fixture) return;

  const userIds = [
    fixture.admin.id,
    fixture.certified.id,
    fixture.needsReview.id,
    fixture.needsRevision.id,
    fixture.notStarted.id,
    fixture.needsAccess.id,
    fixture.accessCorrection.id,
    fixture.suspended.id,
  ];

  await runCleanupActions("Production pilot dry-run fixture", [
    { label: `program ${fixture.programId}`, run: () => deleteRow(admin, "programs", fixture.programId) },
    { label: `course ${fixture.courseId}`, run: () => deleteRow(admin, "courses", fixture.courseId) },
    { label: `assignment ${fixture.textAssignmentId}`, run: () => deleteRow(admin, "assignments", fixture.textAssignmentId) },
    { label: `quiz ${fixture.quizId}`, run: () => deleteRow(admin, "quizzes", fixture.quizId) },
    { label: `role group ${fixture.roleGroupId}`, run: () => deleteRow(admin, "role_groups", fixture.roleGroupId) },
    ...userIds.map((userId) => ({
      label: `pilot user ${userId}`,
      run: () => deleteAuthUser(admin, userId),
    })),
  ]);
}

export async function countProductionPilotDryRunArtifacts(
  admin: SupabaseClient,
  prefix: string,
): Promise<Record<string, number>> {
  const lowerPrefix = prefix.toLowerCase();
  const [profiles, roleGroups, programs, courses, assignments, quizzes] =
    await Promise.all([
      countRows(admin, "profiles", "email", `${lowerPrefix}%`),
      countRows(admin, "role_groups", "name", `${prefix}%`),
      countRows(admin, "programs", "title", `${prefix}%`),
      countRows(admin, "courses", "title", `${prefix}%`),
      countRows(admin, "assignments", "title", `${prefix}%`),
      countRows(admin, "quizzes", "title", `${prefix}%`),
    ]);

  return { profiles, roleGroups, programs, courses, assignments, quizzes };
}

async function cleanupProductionReadinessStorage(
  admin: SupabaseClient,
  fixture: ProductionReadinessFixture,
) {
  const learnerId = fixture.learner.id;
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

  await runCleanupActions("Production readiness storage", [
    ...(paths.length > 0 ? [{
      label: "readiness submission objects",
      run: () => removeStorageObjects(admin, "submissions", paths),
    }] : []),
    {
      label: `readiness video ${fixture.videoPath}`,
      run: () => removeStorageObjects(admin, "content", [fixture.videoPath]),
    },
  ]);
}

async function seedPilotDryRunStates(
  admin: SupabaseClient,
  input: {
    prefix: string;
    programId: string;
    courseId: string;
    contentLessonId: string;
    quizId: string;
    quizLessonId: string;
    textAssignmentId: string;
    textAssignmentLessonId: string;
    adminId: string;
    certifiedId: string;
    needsReviewId: string;
    needsRevisionId: string;
  },
) {
  const completedAt = new Date().toISOString();
  const { data: requiredLessons, error: requiredLessonsError } = await admin
    .from("lessons")
    .select("id")
    .eq("is_required_for_completion", true);
  if (requiredLessonsError) throw requiredLessonsError;
  const certifiedLessonCompletions = Array.from(
    new Set([
      ...(requiredLessons ?? []).map((lesson) => lesson.id as string),
      input.contentLessonId,
      input.quizLessonId,
      input.textAssignmentLessonId,
    ]),
  ).map((lessonId) => ({ user_id: input.certifiedId, lesson_id: lessonId }));
  await admin
    .from("user_lesson_completions")
    .insert([
      ...certifiedLessonCompletions,
      { user_id: input.needsReviewId, lesson_id: input.contentLessonId },
      { user_id: input.needsReviewId, lesson_id: input.quizLessonId },
      { user_id: input.needsRevisionId, lesson_id: input.contentLessonId },
      { user_id: input.needsRevisionId, lesson_id: input.quizLessonId },
    ])
    .throwOnError();
  await admin
    .from("user_quiz_attempts")
    .insert([
      {
        user_id: input.certifiedId,
        quiz_id: input.quizId,
        lesson_id: input.quizLessonId,
        score: 100,
        passed: true,
        responses: {},
        completed_at: completedAt,
      },
      {
        user_id: input.needsReviewId,
        quiz_id: input.quizId,
        lesson_id: input.quizLessonId,
        score: 100,
        passed: true,
        responses: {},
        completed_at: completedAt,
      },
      {
        user_id: input.needsRevisionId,
        quiz_id: input.quizId,
        lesson_id: input.quizLessonId,
        score: 100,
        passed: true,
        responses: {},
        completed_at: completedAt,
      },
    ])
    .throwOnError();
  await admin
    .from("assignment_submissions")
    .insert([
      {
        assignment_id: input.textAssignmentId,
        lesson_id: input.textAssignmentLessonId,
        user_id: input.certifiedId,
        submission_text: `${input.prefix} approved response`,
        status: "approved",
        reviewed_by: input.adminId,
        reviewed_at: completedAt,
      },
      {
        assignment_id: input.textAssignmentId,
        lesson_id: input.textAssignmentLessonId,
        user_id: input.needsReviewId,
        submission_text: `${input.prefix} pending response`,
        status: "submitted",
      },
      {
        assignment_id: input.textAssignmentId,
        lesson_id: input.textAssignmentLessonId,
        user_id: input.needsRevisionId,
        submission_text: `${input.prefix} revision response`,
        status: "needs_revision",
        reviewed_by: input.adminId,
        reviewed_at: completedAt,
        reviewer_notes: `${input.prefix} revise this`,
      },
    ])
    .throwOnError();
}

async function countRows(
  admin: SupabaseClient,
  table: string,
  column: string,
  pattern: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .like(column, pattern);
  if (error) throw error;
  return count ?? 0;
}

async function deleteAuthUserByEmail(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (user) {
    await deleteAuthUser(admin, user.id);
  }
}

async function deleteAuthUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

async function deleteRow(
  admin: SupabaseClient,
  table: string,
  id: string,
): Promise<void> {
  await admin.from(table).delete().eq("id", id).throwOnError();
}

async function createFixtureUser(
  admin: SupabaseClient,
  input: {
    email: string;
    password: string;
    fullName: string;
    systemRole: "owner" | "admin" | "learner";
  },
  journal: FixtureCleanupJournal,
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
  const userId = data.user.id;
  journal.add(`auth user ${userId}`, async () => {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
  });
  await admin
    .from("profiles")
    .update({
      full_name: input.fullName,
      system_role: input.systemRole,
      status: "active",
    })
    .eq("id", userId)
    .throwOnError();
  return { id: userId, email: input.email };
}

function journalTableRow(
  admin: SupabaseClient,
  journal: FixtureCleanupJournal,
  table: string,
  id: string,
): void {
  journal.add(`${table} row ${id}`, async () => {
    const { error } = await admin.from(table).delete().eq("id", id);
    if (error) throw error;
  });
}

async function removeStorageObjects(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) throw error;
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
