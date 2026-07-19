import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  applyImportPlan,
  atomicImportOperations,
  buildRollbackOwnedIds,
  type CourseImportAdapter,
} from "@/lib/course-import/execute";
import { buildImportPlan, type ImportPlan } from "@/lib/course-import/operations";
import { validCourseManifest } from "@/lib/course-import/test-fixtures";
import { courseImportProviderPsqlEnvironment } from "@/lib/course-import/provider-acceptance";

function requiredTestEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for imported-catalog integration coverage.`);
  }
  return value;
}

const url = requiredTestEnvironment("TEST_SUPABASE_URL");
const anonKey = requiredTestEnvironment("TEST_SUPABASE_ANON_KEY");
const serviceKey = requiredTestEnvironment("TEST_SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl = requiredTestEnvironment("TEST_SUPABASE_DB_URL");
const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function uniquePlan(): ImportPlan {
  const suffix = randomBytes(8).toString("hex");
  const manifest = validCourseManifest();
  manifest.import_id = `release-control-${suffix}`;
  manifest.qa_role_group.name = `Release QA ${suffix}`;
  return buildImportPlan(manifest);
}

function contentionPlan(): ImportPlan {
  const suffix = randomBytes(8).toString("hex");
  const manifest = validCourseManifest();
  manifest.import_id = `release-contention-${suffix}`;
  manifest.qa_role_group.name = `Release contention QA ${suffix}`;
  const quizLesson = manifest.program.courses[0]?.modules[0]?.lessons.find(
    (lesson) => lesson.quiz,
  );
  const quiz = quizLesson?.quiz;
  const template = quiz?.questions[0];
  if (!quiz || !template) throw new Error("Contention fixture quiz is missing.");

  // A same-manifest replay validates this entire envelope before the legacy
  // helper takes its broad table locks. That makes the provider test below a
  // reliable probe for the old row-lock-then-table-lock upgrade deadlock.
  quiz.questions = Array.from({ length: 240 }, (_, index) => ({
    ...template,
    source_key: `contention-question-${index}`,
    question_text: `Contention question ${index}`,
    sort_order: index,
    options: template.options.map((option, optionIndex) => ({
      ...option,
      source_key: `contention-question-${index}-option-${optionIndex}`,
    })),
  }));
  quiz.questions_per_attempt = 10;
  return buildImportPlan(manifest);
}

function adapter(): CourseImportAdapter {
  if (!service) throw new Error("Test-project service client is unavailable.");
  return {
    async applyAtomically(importId, operations) {
      const { data, error } = await service.rpc("fn_apply_course_import", {
        p_import_id: importId,
        p_operations: operations,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    async readRows(table, ids) {
      const { data, error } = await service.from(table).select("*").in("id", ids);
      if (error) throw new Error(error.message);
      return new Map(
        (data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
      );
    },
    async rollbackAtomically(importId, ownedIds) {
      const { data, error } = await service.rpc("fn_rollback_course_import", {
        p_import_id: importId,
        p_owned: ownedIds,
      });
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

async function createSignedInUser(
  systemRole: "learner" | "admin" | "owner",
): Promise<{ id: string; client: SupabaseClient }> {
  if (!service || !url || !anonKey) {
    throw new Error("Test-project clients are unavailable.");
  }
  const suffix = randomBytes(8).toString("hex");
  const email = `import-${systemRole}-${suffix}@bmh.invalid`;
  const password = `${randomBytes(18).toString("base64url")}!Aa1`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("Test user creation failed.");
  const id = created.data.user.id;
  let profileFound = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const profile = await service.from("profiles").select("id").eq("id", id).maybeSingle();
    if (profile.data) {
      profileFound = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!profileFound) throw new Error(`Profile creation timed out for ${id}.`);
  const profile = await service
    .from("profiles")
    .update({ system_role: systemRole, status: "active" })
    .eq("id", id);
  if (profile.error) throw profile.error;
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id, client };
}

const catalogPolicyTables = [
  "programs",
  "courses",
  "program_courses",
  "program_access",
  "course_access",
  "modules",
  "lessons",
  "content_blocks",
  "quizzes",
  "questions",
  "answer_options",
  "assignments",
] as const;

const importedCatalogTables = catalogPolicyTables.filter(
  (table) => table !== "course_access",
);

type GuardedCatalogTable = (typeof catalogPolicyTables)[number];
type CatalogRowReference = { table: GuardedCatalogTable; id: string };

function importedCatalogReferences(plan: ImportPlan): CatalogRowReference[] {
  const operations = atomicImportOperations(plan);
  return importedCatalogTables.map((table) => {
    const operation = operations.find((candidate) => candidate.table === table);
    if (!operation) throw new Error(`Test import is missing ${table}.`);
    return { table, id: operation.id };
  });
}

async function readCatalogReferences(
  client: SupabaseClient,
  references: CatalogRowReference[],
): Promise<Array<string | null>> {
  return Promise.all(
    references.map(async ({ table, id }) => {
      const result = await client.from(table).select("id").eq("id", id).maybeSingle();
      if (result.error) throw result.error;
      return result.data?.id ?? null;
    }),
  );
}

async function cleanupContentionPlan(
  client: SupabaseClient,
  plan: ImportPlan,
  programId: string,
): Promise<Error | null> {
  const cleanupErrors: Error[] = [];
  const before = await client
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("id", programId);
  if (before.error) {
    cleanupErrors.push(new Error(`Contention cleanup lookup failed: ${before.error.message}`));
  } else if ((before.count ?? 0) > 0) {
    const rollback = await client.rpc("fn_rollback_course_import", {
      p_import_id: plan.importId,
      p_owned: buildRollbackOwnedIds(plan),
    });
    if (rollback.error) {
      cleanupErrors.push(new Error(`Contention cleanup rollback failed: ${rollback.error.message}`));
    }
  }

  const after = await client
    .from("programs")
    .select("id", { count: "exact", head: true })
    .eq("id", programId);
  if (after.error) {
    cleanupErrors.push(new Error(`Contention cleanup verification failed: ${after.error.message}`));
  } else if ((after.count ?? 0) !== 0) {
    cleanupErrors.push(new Error("Contention cleanup left the imported program in the test project."));
  }

  if (cleanupErrors.length === 0) return null;
  return new AggregateError(cleanupErrors, "Contention import cleanup was not exact.");
}

type PsqlSession = {
  child: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
};

function startPsql(applicationName: string): PsqlSession {
  if (!databaseUrl) throw new Error("Test-project Postgres URL is unavailable.");
  const session: PsqlSession = {
    child: spawn(
      "psql",
      ["-X", "--set", "ON_ERROR_STOP=1", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet"],
      {
        env: {
          ...process.env,
          ...courseImportProviderPsqlEnvironment(databaseUrl),
          PGAPPNAME: applicationName,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    ),
    stdout: "",
    stderr: "",
  };
  session.child.stdout.on("data", (chunk) => {
    session.stdout += String(chunk);
  });
  session.child.stderr.on("data", (chunk) => {
    session.stderr += String(chunk);
  });
  return session;
}

async function waitForPsqlOutput(
  session: PsqlSession,
  pattern: RegExp,
  timeoutMs = 15_000,
): Promise<RegExpMatchArray> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const match = session.stdout.match(pattern);
    if (match) return match;
    if (session.child.exitCode !== null) {
      throw new Error(
        `psql exited before its barrier (${session.child.exitCode}): ${session.stderr}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`psql barrier timed out: ${session.stderr}`);
}

async function waitForPsqlExit(session: PsqlSession, timeoutMs = 20_000) {
  if (session.child.exitCode === null) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`psql exit timed out: ${session.stderr}`));
      }, timeoutMs);
      session.child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`psql failed (${code}): ${session.stderr}`));
      });
      session.child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  } else if (session.child.exitCode !== 0) {
    throw new Error(`psql failed (${session.child.exitCode}): ${session.stderr}`);
  }
}

async function runPsql(sql: string, applicationName: string) {
  const session = startPsql(applicationName);
  session.child.stdin.end(sql);
  try {
    await waitForPsqlExit(session);
  } finally {
    if (session.child.exitCode === null) session.child.kill("SIGTERM");
  }
}

async function terminatePsql(session: PsqlSession | null) {
  if (!session || session.child.exitCode !== null) return;
  session.child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    session.child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  if (session.child.exitCode === null) session.child.kill("SIGKILL");
}

describe("imported catalog release control on a test project", () => {
  it("settles same-manifest apply against ordinary catalog updates without a lock-upgrade deadlock", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = contentionPlan();
    const program = atomicImportOperations(plan).find(
      (operation) => operation.table === "programs",
    );
    if (!program) throw new Error("Contention import program is missing.");
    expect(plan.operations.length).toBeGreaterThan(700);
    let testError: unknown = null;
    let barrier: PsqlSession | null = null;
    let writer: PsqlSession | null = null;

    try {
      await applyImportPlan(plan, adapter());

      const lockKeyA = Number.parseInt(randomBytes(4).toString("hex"), 16) | 0;
      const lockKeyB = Number.parseInt(randomBytes(4).toString("hex"), 16) | 0;
      barrier = startPsql("bmh-import-contention-barrier");
      barrier.child.stdin.write(
        `select pg_advisory_lock(${lockKeyA}, ${lockKeyB});\nselect 'BARRIER_HELD';\n`,
      );
      await waitForPsqlOutput(barrier, /BARRIER_HELD/);

      // The writer takes its table lock before waiting on the advisory barrier.
      // That exact backend PID lets the observer prove the replay is blocked by
      // this transaction in Postgres, not merely that two HTTP promises overlap.
      writer = startPsql("bmh-import-contention-writer");
      writer.child.stdin.end(`
        begin;
        set local statement_timeout = '20s';
        lock table public.programs in row exclusive mode;
        select pg_backend_pid()::text || ':WRITER_LOCKED';
        select pg_advisory_xact_lock(${lockKeyA}, ${lockKeyB});
        update public.programs
        set description = 'Deterministic contention writer'
        where id = '${program.id}';
        commit;
      `);
      const writerBarrier = await waitForPsqlOutput(
        writer,
        /([0-9]+):WRITER_LOCKED/,
      );
      const writerPid = Number(writerBarrier[1]);
      expect(writerPid).toBeGreaterThan(0);

      const replay = applyImportPlan(plan, adapter());
      await runPsql(`
        do $observer$
        declare
          v_deadline timestamptz := clock_timestamp() + interval '15 seconds';
        begin
          loop
            if exists (
              select 1
              from (
                select distinct lock.pid
                from pg_catalog.pg_locks lock
                where lock.pid is not null
              ) blocked
              where blocked.pid <> pg_backend_pid()
                and ${writerPid} = any(pg_catalog.pg_blocking_pids(blocked.pid))
            ) then
              return;
            end if;
            if clock_timestamp() >= v_deadline then
              raise exception 'Replay never became blocked by writer backend ${writerPid}';
            end if;
            perform pg_sleep(0.025);
          end loop;
        end
        $observer$;
      `, "bmh-import-contention-observer");

      barrier.child.stdin.end(
        `select pg_advisory_unlock(${lockKeyA}, ${lockKeyB});\n\\q\n`,
      );
      await Promise.all([waitForPsqlExit(barrier), waitForPsqlExit(writer), replay]);
    } catch (error) {
      testError = error;
    } finally {
      await Promise.all([terminatePsql(writer), terminatePsql(barrier)]);
    }

    const cleanupError = await cleanupContentionPlan(service, plan, program.id);
    if (testError && cleanupError) {
      throw new AggregateError(
        [testError, cleanupError],
        "Contention proof failed and its test-project cleanup also failed.",
      );
    }
    if (testError) throw testError;
    if (cleanupError) throw cleanupError;
  }, 60_000);

  it("denies generic publication and a second role group while preserving rollback", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const program = atomicImportOperations(plan).find(
      (operation) => operation.table === "programs",
    );
    const course = atomicImportOperations(plan).find(
      (operation) => operation.table === "courses",
    );
    if (!program) throw new Error("Test import program is missing.");
    if (!course) throw new Error("Test import course is missing.");
    let employeeRoleGroupId: string | null = null;

    try {
      await applyImportPlan(plan, adapter());

      const { data: digest, error: digestError } = await service.rpc(
        "fn_course_import_catalog_sha256",
        { p_import_id: plan.importId },
      );
      expect(digestError).toBeNull();
      expect(digest).toMatch(/^[a-f0-9]{64}$/);

      const publish = await service
        .from("programs")
        .update({ is_published: true })
        .eq("id", program.id);
      expect(publish.error?.message).toMatch(/evidence-bound release/i);

      const employee = await service
        .from("role_groups")
        .insert({ name: `Employee release ${randomBytes(8).toString("hex")}` })
        .select("id")
        .single();
      if (employee.error || !employee.data) throw employee.error;
      employeeRoleGroupId = employee.data.id;

      const access = await service.from("program_access").insert({
        program_id: program.id,
        role_group_id: employeeRoleGroupId,
      });
      expect(access.error?.message).toMatch(/exact apply or release operation/i);

      const directCourseAccess = await service.from("course_access").insert({
        course_id: course.id,
        role_group_id: employeeRoleGroupId,
      });
      expect(directCourseAccess.error?.message).toMatch(
        /zero direct access grants/i,
      );

      const malformedRelease = await service.rpc("fn_release_course_import_v1", {
        p_import_id: plan.importId,
        p_program_id: program.id,
        p_employee_role_group_id: employeeRoleGroupId,
        p_evidence: {},
        p_confirmation: "not-a-release",
      });
      expect(malformedRelease.error?.message).toMatch(/confirmation|evidence/i);

      const anonymous = createClient(url!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const anonymousRelease = await anonymous.rpc("fn_release_course_import_v1", {
        p_import_id: plan.importId,
        p_program_id: program.id,
        p_employee_role_group_id: employeeRoleGroupId,
        p_evidence: {},
        p_confirmation: "not-a-release",
      });
      expect(anonymousRelease.error).not.toBeNull();
    } finally {
      await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      if (employeeRoleGroupId) {
        await service.from("role_groups").delete().eq("id", employeeRoleGroupId);
      }
    }
  });

  it("keeps imported review reviewer-only and blocks generic QA membership and invites", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const operation = (table: ImportPlan["operations"][number]["table"]) => {
      const row = atomicImportOperations(plan).find((candidate) => candidate.table === table);
      if (!row) throw new Error(`Test import is missing ${table}.`);
      return row;
    };
    const program = operation("programs");
    const course = operation("courses");
    const lesson = operation("lessons");
    const importedModule = operation("modules");
    const quiz = operation("quizzes");
    const answerOption = operation("answer_options");
    const quizLesson = atomicImportOperations(plan).find(
      (candidate) =>
        candidate.table === "lessons" && candidate.row.quiz_id === quiz.id,
    );
    if (!quizLesson) throw new Error("Test import quiz lesson is missing.");
    const assignment = operation("assignments");
    const assignmentLesson = atomicImportOperations(plan).find(
      (candidate) =>
        candidate.table === "lessons" && candidate.row.assignment_id === assignment.id,
    );
    if (!assignmentLesson) throw new Error("Test import assignment lesson is missing.");
    const qaRoleGroup = operation("role_groups");
    const importedReferences = importedCatalogReferences(plan);
    let learner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let admin: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let owner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let importApplied = false;
    let reviewerOptionOutstanding = false;

    try {
      await applyImportPlan(plan, adapter());
      importApplied = true;
      learner = await createSignedInUser("learner");
      admin = await createSignedInUser("admin");
      owner = await createSignedInUser("owner");

      const [ownerBeforeGrant, adminBeforeGrant, learnerBeforeGrant] =
        await Promise.all([
          readCatalogReferences(owner.client, importedReferences),
          readCatalogReferences(admin.client, importedReferences),
          readCatalogReferences(learner.client, importedReferences),
        ]);
      expect(ownerBeforeGrant).toEqual(importedReferences.map(() => null));
      expect(adminBeforeGrant).toEqual(importedReferences.map(() => null));
      expect(learnerBeforeGrant).toEqual(importedReferences.map(() => null));

      const directReviewerRead = await owner.client
        .from("course_import_reviewers_v1")
        .select("program_id")
        .eq("program_id", program.id);
      expect(directReviewerRead.error?.message).toMatch(/permission denied/i);

      const directReviewerInsert = await owner.client
        .from("course_import_reviewers_v1")
        .insert({ program_id: program.id, user_id: owner.id });
      expect(directReviewerInsert.error?.message).toMatch(/permission denied/i);

      const serviceReviewerRead = await service
        .from("course_import_reviewers_v1")
        .select("program_id")
        .eq("program_id", program.id);
      expect(serviceReviewerRead.error?.message).toMatch(/permission denied/i);

      const serviceReviewerInsert = await service
        .from("course_import_reviewers_v1")
        .insert({ program_id: program.id, user_id: owner.id });
      expect(serviceReviewerInsert.error?.message).toMatch(/permission denied/i);

      const directMembership = await service.from("user_role_groups").insert({
        user_id: learner.id,
        role_group_id: qaRoleGroup.id,
      });
      expect(directMembership.error?.message).toMatch(
        /QA role group cannot be assigned/i,
      );

      const genericAssignment = await owner.client.rpc(
        "fn_set_user_role_groups",
        {
          p_user_id: learner.id,
          p_role_group_ids: [qaRoleGroup.id],
        },
      );
      expect(genericAssignment.error?.message).toMatch(
        /QA role group cannot be assigned/i,
      );

      const genericInvite = await service.from("invites").insert({
        email: `qa-invite-${randomBytes(6).toString("hex")}@bmh.invalid`,
        role_group_ids: [qaRoleGroup.id],
        token: randomBytes(24).toString("base64url"),
      });
      expect(genericInvite.error?.message).toMatch(
        /QA role group cannot be assigned/i,
      );

      const authenticatedGrant = await owner.client.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: owner.id,
          p_allowed: true,
        },
      );
      expect(authenticatedGrant.error).not.toBeNull();

      const reviewerGrant = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: owner.id,
          p_allowed: true,
        },
      );
      expect(reviewerGrant.error).toBeNull();

      const [visibleToReviewer, hiddenFromAdmin, hiddenFromLearner, unlocked] =
        await Promise.all([
          readCatalogReferences(owner.client, importedReferences),
          readCatalogReferences(admin.client, importedReferences),
          readCatalogReferences(learner.client, importedReferences),
          owner.client.rpc("fn_lesson_is_unlocked", {
            p_user_id: owner.id,
            p_lesson_id: lesson.id,
          }),
        ]);
      expect(visibleToReviewer).toEqual(importedReferences.map(({ id }) => id));
      expect(hiddenFromAdmin).toEqual(importedReferences.map(() => null));
      expect(hiddenFromLearner).toEqual(importedReferences.map(() => null));
      expect(unlocked.error).toBeNull();
      expect(unlocked.data).toBe(true);

      const adminModuleMove = await admin.client.rpc("fn_move_module", {
        p_module_id: importedModule.id,
        p_course_id: course.id,
        p_direction: "up",
      });
      expect(adminModuleMove.error?.message).toMatch(/admin reviewer access required/i);

      const reviewerModuleMove = await owner.client.rpc("fn_move_module", {
        p_module_id: importedModule.id,
        p_course_id: course.id,
        p_direction: "up",
      });
      expect(reviewerModuleMove.error).toBeNull();

      const assignmentArgs = {
        p_lesson_id: assignmentLesson.id,
        p_assignment_id: assignment.id,
        p_title: String(assignment.row.title),
        p_instructions: String(assignment.row.instructions),
        p_submission_type: String(assignment.row.submission_type),
        p_requires_review: Boolean(assignment.row.requires_review),
        p_rubric: assignment.row.rubric,
      };
      const adminAssignmentUpdate = await admin.client.rpc(
        "fn_update_assignment_for_lesson",
        assignmentArgs,
      );
      expect(adminAssignmentUpdate.error?.message).toMatch(
        /admin reviewer access required/i,
      );

      const reviewerAssignmentUpdate = await owner.client.rpc(
        "fn_update_assignment_for_lesson",
        assignmentArgs,
      );
      expect(reviewerAssignmentUpdate.error).toBeNull();
      expect(reviewerAssignmentUpdate.data).toBe(true);

      const ordinaryAdminOptionUpdate = await admin.client.rpc(
        "fn_update_answer_option_for_reviewer_v1",
        {
          p_lesson_id: quizLesson.id,
          p_option_id: answerOption.id,
          p_option_text: "Ordinary admin must not write this",
          p_is_correct: false,
          p_exclusive_peer_option_ids: [],
        },
      );
      expect(ordinaryAdminOptionUpdate.error?.message).toMatch(
        /admin reviewer access required/i,
      );

      const ordinaryAdminOptionCreate = await admin.client.rpc(
        "fn_create_answer_option_for_reviewer_v1",
        {
          p_lesson_id: quizLesson.id,
          p_question_id: answerOption.row.question_id,
          p_option_text: "Ordinary admin must not create this",
        },
      );
      expect(ordinaryAdminOptionCreate.error?.message).toMatch(
        /admin reviewer access required/i,
      );

      const directReviewerOptionCreate = await owner.client
        .from("answer_options")
        .insert({
          question_id: answerOption.row.question_id,
          option_text: "Direct reviewer insert must stay blocked",
          is_correct: false,
          sort_order: 999,
        });
      expect(directReviewerOptionCreate.error?.message).toMatch(
        /permission denied|exact apply or release operation/i,
      );

      const reviewerOptionCreate = await owner.client.rpc(
        "fn_create_answer_option_for_reviewer_v1",
        {
          p_lesson_id: quizLesson.id,
          p_question_id: answerOption.row.question_id,
          p_option_text: "Reviewer temporary option",
        },
      );
      reviewerOptionOutstanding =
        reviewerOptionCreate.error === null && reviewerOptionCreate.data === true;
      expect(reviewerOptionCreate.error).toBeNull();
      expect(reviewerOptionCreate.data).toBe(true);

      const temporaryOption = await service
        .from("answer_options")
        .select("id")
        .eq("question_id", answerOption.row.question_id)
        .eq("option_text", "Reviewer temporary option")
        .single();
      if (temporaryOption.error || !temporaryOption.data) {
        throw temporaryOption.error ?? new Error("Temporary reviewer option was not created.");
      }
      const reviewerOptionUpdate = await owner.client.rpc(
        "fn_update_answer_option_for_reviewer_v1",
        {
          p_lesson_id: quizLesson.id,
          p_option_id: answerOption.id,
          p_option_text: "Reviewer-authorized option",
          p_is_correct: Boolean(answerOption.row.is_correct),
          p_exclusive_peer_option_ids: [],
        },
      );
      expect(reviewerOptionUpdate.error).toBeNull();
      expect(reviewerOptionUpdate.data).toBe(true);

      const radioCorrectness = await service
        .from("answer_options")
        .select("id,is_correct")
        .eq("question_id", answerOption.row.question_id);
      expect(radioCorrectness.error).toBeNull();
      expect(
        radioCorrectness.data?.filter((option) => option.is_correct),
      ).toEqual([expect.objectContaining({ id: answerOption.id })]);

      const revokeWithReviewerOption = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: owner.id,
          p_allowed: false,
        },
      );
      expect(revokeWithReviewerOption.error).toBeNull();
      const hiddenAfterOptionRevoke = await owner.client
        .from("answer_options")
        .select("id")
        .eq("id", temporaryOption.data.id)
        .maybeSingle();
      expect(hiddenAfterOptionRevoke.error).toBeNull();
      expect(hiddenAfterOptionRevoke.data).toBeNull();
      const revokedReviewerOptionUpdate = await owner.client.rpc(
        "fn_update_answer_option_for_reviewer_v1",
        {
          p_lesson_id: quizLesson.id,
          p_option_id: answerOption.id,
          p_option_text: "Revoked reviewer must not write this",
          p_is_correct: false,
          p_exclusive_peer_option_ids: [],
        },
      );
      expect(revokedReviewerOptionUpdate.error?.message).toMatch(
        /admin reviewer access required/i,
      );

      const regrantForOptionCleanup = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: owner.id,
          p_allowed: true,
        },
      );
      expect(regrantForOptionCleanup.error).toBeNull();

      const forgedServiceOptionDelete = await service
        .from("answer_options")
        .delete()
        .eq("id", temporaryOption.data.id);
      expect(forgedServiceOptionDelete.error?.message).toMatch(
        /exact course-import rollback operation/i,
      );

      const optionCleanup = await service.rpc(
        "fn_cleanup_unreleased_import_reviewer_evidence_v1",
        { p_import_id: plan.importId, p_user_id: owner.id },
      );
      expect(optionCleanup.error).toBeNull();
      reviewerOptionOutstanding = false;
      expect(optionCleanup.data).toMatchObject({
        import_id: plan.importId,
        reviewer_user_id: owner.id,
        status: "reviewer_evidence_cleaned",
        reviewer_access_revoked: true,
      });
      const removedTemporaryOption = await service
        .from("answer_options")
        .select("id")
        .eq("id", temporaryOption.data.id)
        .maybeSingle();
      expect(removedTemporaryOption.error).toBeNull();
      expect(removedTemporaryOption.data).toBeNull();
      const reviewerRegrantAfterOptionCleanup = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: owner.id,
          p_allowed: true,
        },
      );
      expect(reviewerRegrantAfterOptionCleanup.error).toBeNull();

      const reviewerRevoke = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: owner.id,
          p_allowed: false,
        },
      );
      expect(reviewerRevoke.error).toBeNull();
      expect(await readCatalogReferences(owner.client, importedReferences)).toEqual(
        importedReferences.map(() => null),
      );
      const lockedAfterRevoke = await owner.client.rpc("fn_lesson_is_unlocked", {
        p_user_id: owner.id,
        p_lesson_id: lesson.id,
      });
      expect(lockedAfterRevoke.error).toBeNull();
      expect(lockedAfterRevoke.data).toBe(false);

      const reviewerRegrant = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: owner.id,
          p_allowed: true,
        },
      );
      expect(reviewerRegrant.error).toBeNull();

      const genericDelete = await owner.client
        .from("programs")
        .delete()
        .eq("id", program.id);
      expect(genericDelete.error?.message).toMatch(/exact course-import rollback/i);

      const forgedServiceDelete = await service
        .from("programs")
        .delete()
        .eq("id", program.id);
      expect(forgedServiceDelete.error?.message).toMatch(
        /exact course-import rollback/i,
      );

      const rollback = await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      expect(rollback.error).toBeNull();
      expect(rollback.data).toMatchObject({
        import_id: plan.importId,
        status: "rolled_back",
      });
      importApplied = false;

      await applyImportPlan(plan, adapter());
      importApplied = true;
      expect(await readCatalogReferences(owner.client, importedReferences)).toEqual(
        importedReferences.map(() => null),
      );
    } finally {
      if (owner && importApplied && reviewerOptionOutstanding) {
        const regrant = await service.rpc(
          "fn_set_unreleased_import_reviewer_v1",
          {
            p_program_id: program.id,
            p_user_id: owner.id,
            p_allowed: true,
          },
        );
        expect(regrant.error).toBeNull();
        const cleanup = await service.rpc(
          "fn_cleanup_unreleased_import_reviewer_evidence_v1",
          { p_import_id: plan.importId, p_user_id: owner.id },
        );
        expect(cleanup.error).toBeNull();
        reviewerOptionOutstanding = false;
      }
      if (learner) await service.auth.admin.deleteUser(learner.id);
      if (admin) await service.auth.admin.deleteUser(admin.id);
      if (owner) await service.auth.admin.deleteUser(owner.id);
      if (importApplied) {
        const rollback = await service.rpc("fn_rollback_course_import", {
          p_import_id: plan.importId,
          p_owned: buildRollbackOwnedIds(plan),
        });
        expect(rollback.error).toBeNull();
        expect(rollback.data).toMatchObject({
          import_id: plan.importId,
          status: "rolled_back",
        });
      }
    }
  });

  it("cleans exact reviewer evidence, suppresses Sandra, and preserves learner rollback blockers", async () => {
    const plan = uniquePlan();
    const operations = atomicImportOperations(plan);
    const operation = (table: ImportPlan["operations"][number]["table"]) => {
      const row = operations.find((candidate) => candidate.table === table);
      if (!row) throw new Error(`Test import is missing ${table}.`);
      return row;
    };
    const program = operation("programs");
    const course = operation("courses");
    const contentBlock = operation("content_blocks");
    const quiz = operation("quizzes");
    const assignment = operation("assignments");
    const quizLesson = operations.find(
      (candidate) =>
        candidate.table === "lessons" && candidate.row.quiz_id === quiz.id,
    );
    const assignmentLesson = operations.find(
      (candidate) =>
        candidate.table === "lessons" &&
        candidate.row.assignment_id === assignment.id,
    );
    if (!quizLesson || !assignmentLesson) {
      throw new Error("Reviewer evidence lessons are missing.");
    }

    let reviewer: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let learner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let ordinaryAdmin: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let importApplied = false;
    let storagePath: string | null = null;
    let auditEventId: string | null = null;
    let reviewerAccessRevoked = false;
    let testError: unknown = null;

    const insert = async (table: string, row: Record<string, unknown>) => {
      const result = await service.from(table).insert(row);
      if (result.error) throw result.error;
    };
    const reviewerRowCount = async (table: string, column: string) => {
      if (!reviewer) throw new Error("Reviewer is unavailable.");
      const result = await service
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, reviewer.id);
      if (result.error) throw result.error;
      return result.count ?? 0;
    };

    try {
      await applyImportPlan(plan, adapter());
      importApplied = true;
      reviewer = await createSignedInUser("owner");
      learner = await createSignedInUser("learner");
      ordinaryAdmin = await createSignedInUser("admin");

      const grant = await service.rpc("fn_set_unreleased_import_reviewer_v1", {
        p_program_id: program.id,
        p_user_id: reviewer.id,
        p_allowed: true,
      });
      expect(grant.error).toBeNull();

      storagePath = `${reviewer.id}/review-${randomBytes(8).toString("hex")}.txt`;
      const upload = await service.storage
        .from("submissions")
        .upload(storagePath, Buffer.from("private reviewer assignment evidence"), {
          contentType: "text/plain",
          upsert: false,
        });
      expect(upload.error).toBeNull();

      const reviewerSubmission = await service
        .from("assignment_submissions")
        .insert({
          assignment_id: assignment.id,
          lesson_id: assignmentLesson.id,
          user_id: reviewer.id,
          submission_text: "Reviewer assignment evidence",
          submission_file_path: storagePath,
          status: "submitted",
        })
        .select("id")
        .single();
      if (reviewerSubmission.error || !reviewerSubmission.data) {
        throw reviewerSubmission.error ?? new Error("Reviewer submission insert failed.");
      }

      const reviewerSubmissionRead = await reviewer.client
        .from("assignment_submissions")
        .select("id")
        .eq("id", reviewerSubmission.data.id)
        .single();
      expect(reviewerSubmissionRead.error).toBeNull();
      expect(reviewerSubmissionRead.data?.id).toBe(reviewerSubmission.data.id);
      const reviewerFile = await reviewer.client.storage
        .from("submissions")
        .createSignedUrl(storagePath, 60);
      expect(reviewerFile.error).toBeNull();
      expect(reviewerFile.data?.signedUrl).toBeTruthy();

      const hiddenSubmission = await ordinaryAdmin.client
        .from("assignment_submissions")
        .select("id")
        .eq("id", reviewerSubmission.data.id)
        .maybeSingle();
      expect(hiddenSubmission.error).toBeNull();
      expect(hiddenSubmission.data).toBeNull();
      const deniedSubmissionUpdate = await ordinaryAdmin.client
        .from("assignment_submissions")
        .update({ reviewer_notes: "Unauthorized review" })
        .eq("id", reviewerSubmission.data.id)
        .select("id");
      expect(deniedSubmissionUpdate.error).toBeNull();
      expect(deniedSubmissionUpdate.data).toEqual([]);
      const deniedFile = await ordinaryAdmin.client.storage
        .from("submissions")
        .createSignedUrl(storagePath, 60);
      expect(deniedFile.error).not.toBeNull();
      await insert("user_quiz_attempts", {
        user_id: reviewer.id,
        quiz_id: quiz.id,
        lesson_id: quizLesson.id,
        score: 100,
        passed: true,
        completed_at: new Date().toISOString(),
      });
      await insert("user_video_progress", {
        user_id: reviewer.id,
        block_id: contentBlock.id,
        position_seconds: 10,
        duration_seconds: 10,
        watched_ranges: [[0, 10]],
        last_observed_position_seconds: 10,
        asset_version: "reviewer-test#duration=10",
      });
      await insert("user_video_completion_history", {
        user_id: reviewer.id,
        block_id: contentBlock.id,
        asset_version: "reviewer-test#duration=10",
      });
      await service.from("user_block_progress").upsert({
        user_id: reviewer.id,
        block_id: contentBlock.id,
        asset_version: "reviewer-test#duration=10",
      });
      await service.from("user_lesson_completions").upsert({
        user_id: reviewer.id,
        lesson_id: quizLesson.id,
      });
      await insert("role_play_results", {
        user_id: reviewer.id,
        block_id: contentBlock.id,
        scenario_id: "reviewer-scenario",
        attempt_id: `reviewer-${randomBytes(8).toString("hex")}`,
        score: 100,
      });
      await service.from("user_course_resume").upsert({
        user_id: reviewer.id,
        course_id: course.id,
        last_lesson_id: quizLesson.id,
        last_block_id: contentBlock.id,
      });
      await service.from("certificates").upsert({
        user_id: reviewer.id,
        course_id: course.id,
        certificate_number: `REVIEW-C-${randomBytes(10).toString("hex")}`,
      });
      await service.from("program_certificates").upsert({
        user_id: reviewer.id,
        program_id: program.id,
        certificate_number: `REVIEW-P-${randomBytes(10).toString("hex")}`,
      });

      const outboxBeforeClaim = await service
        .from("sandra_course_completion_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", reviewer.id)
        .eq("course_id", course.id);
      expect(outboxBeforeClaim.error).toBeNull();
      expect(outboxBeforeClaim.count).toBe(0);

      const suppressedClaim = await service.rpc(
        "fn_claim_sandra_course_completion_delivery",
        {
          p_user_id: reviewer.id,
          p_course_id: course.id,
          p_payload: {
            userId: reviewer.id,
            courseId: course.id,
            completedAt: new Date().toISOString(),
          },
        },
      );
      expect(suppressedClaim.error?.message).toMatch(
        /suppressed for an unreleased imported course/i,
      );

      const outboxAfterClaim = await service
        .from("sandra_course_completion_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", reviewer.id)
        .eq("course_id", course.id);
      expect(outboxAfterClaim.error).toBeNull();
      expect(outboxAfterClaim.count).toBe(0);

      // Seed a legacy reviewer delivery to prove cleanup handles rows created
      // before the suppression guard was deployed.
      await insert("sandra_course_completion_deliveries", {
        user_id: reviewer.id,
        course_id: course.id,
        completed_at: new Date().toISOString(),
        payload: { userId: reviewer.id, courseId: course.id },
      });
      auditEventId = randomUUID();
      await insert("audit_log", {
        id: auditEventId,
        user_id: reviewer.id,
        action: "reviewer_acceptance_evidence",
        entity_type: "program",
        entity_id: program.id,
        metadata: { import_id: plan.importId },
      });

      const authenticatedCleanup = await reviewer.client.rpc(
        "fn_cleanup_unreleased_import_reviewer_evidence_v1",
        { p_import_id: plan.importId, p_user_id: reviewer.id },
      );
      expect(authenticatedCleanup.error).not.toBeNull();

      await insert("role_play_results", {
        user_id: learner.id,
        block_id: contentBlock.id,
        scenario_id: "non-reviewer-scenario",
        attempt_id: `learner-${randomBytes(8).toString("hex")}`,
        score: 80,
      });

      const revokeWithEvidence = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: reviewer.id,
          p_allowed: false,
        },
      );
      expect(revokeWithEvidence.error).toBeNull();
      const revokedSubmissionRead = await reviewer.client
        .from("assignment_submissions")
        .select("id")
        .eq("id", reviewerSubmission.data.id)
        .maybeSingle();
      expect(revokedSubmissionRead.error).toBeNull();
      expect(revokedSubmissionRead.data).toBeNull();
      const revokedFile = await reviewer.client.storage
        .from("submissions")
        .createSignedUrl(storagePath, 60);
      expect(revokedFile.error).not.toBeNull();

      const regrantForCleanup = await service.rpc(
        "fn_set_unreleased_import_reviewer_v1",
        {
          p_program_id: program.id,
          p_user_id: reviewer.id,
          p_allowed: true,
        },
      );
      expect(regrantForCleanup.error).toBeNull();

      const storagePreflight = await service.rpc(
        "fn_cleanup_unreleased_import_reviewer_evidence_v1",
        { p_import_id: plan.importId, p_user_id: reviewer.id },
      );
      expect(storagePreflight.error).toBeNull();
      expect(storagePreflight.data).toMatchObject({
        import_id: plan.importId,
        reviewer_user_id: reviewer.id,
        status: "storage_cleanup_required",
        submission_file_paths: [storagePath],
      });
      expect(await reviewerRowCount("assignment_submissions", "user_id")).toBe(1);

      const removeReviewerStorage = await service.storage
        .from("submissions")
        .remove([storagePath]);
      expect(removeReviewerStorage.error).toBeNull();
      storagePath = null;

      const cleanup = await service.rpc(
        "fn_cleanup_unreleased_import_reviewer_evidence_v1",
        { p_import_id: plan.importId, p_user_id: reviewer.id },
      );
      expect(cleanup.error).toBeNull();
      expect(cleanup.data).toMatchObject({
        import_id: plan.importId,
        reviewer_user_id: reviewer.id,
        status: "reviewer_evidence_cleaned",
        reviewer_access_revoked: true,
      });
      reviewerAccessRevoked = true;

      for (const table of [
        "assignment_submissions",
        "user_quiz_attempts",
        "role_play_results",
        "user_video_progress",
        "user_video_completion_history",
        "user_block_progress",
        "user_lesson_completions",
        "user_course_resume",
        "certificates",
        "program_certificates",
        "sandra_course_completion_deliveries",
      ]) {
        expect(await reviewerRowCount(table, "user_id"), table).toBe(0);
      }
      const preservedAudit = await service
        .from("audit_log")
        .select("id")
        .eq("id", auditEventId)
        .single();
      expect(preservedAudit.error).toBeNull();
      expect(preservedAudit.data?.id).toBe(auditEventId);
      expect(
        await readCatalogReferences(reviewer.client, importedCatalogReferences(plan)),
      ).toEqual(importedCatalogReferences(plan).map(() => null));

      const blockedRollback = await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      expect(blockedRollback.error?.message).toMatch(/role-play results exist/i);

      const removeLearnerEvidence = await service
        .from("role_play_results")
        .delete()
        .eq("user_id", learner.id)
        .eq("block_id", contentBlock.id);
      expect(removeLearnerEvidence.error).toBeNull();

      const rollback = await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      expect(rollback.error).toBeNull();
      expect(rollback.data).toMatchObject({
        import_id: plan.importId,
        status: "rolled_back",
      });
      importApplied = false;
    } catch (error) {
      testError = error;
    } finally {
      const cleanupErrors: Error[] = [];
      if (learner) {
        const result = await service
          .from("role_play_results")
          .delete()
          .eq("user_id", learner.id);
        if (result.error) cleanupErrors.push(result.error);
      }
      if (reviewer && importApplied && !reviewerAccessRevoked) {
        const preflight = await service.rpc(
          "fn_cleanup_unreleased_import_reviewer_evidence_v1",
          {
            p_import_id: plan.importId,
            p_user_id: reviewer.id,
          },
        );
        if (preflight.error) {
          cleanupErrors.push(preflight.error);
        } else if (
          preflight.data?.status === "storage_cleanup_required" &&
          Array.isArray(preflight.data.submission_file_paths)
        ) {
          const paths = preflight.data.submission_file_paths.filter(
            (value: unknown): value is string => typeof value === "string",
          );
          const removed = await service.storage.from("submissions").remove(paths);
          if (removed.error) cleanupErrors.push(removed.error);
          const cleanup = await service.rpc(
            "fn_cleanup_unreleased_import_reviewer_evidence_v1",
            {
              p_import_id: plan.importId,
              p_user_id: reviewer.id,
            },
          );
          if (cleanup.error) cleanupErrors.push(cleanup.error);
        }
      }
      if (storagePath) {
        const removed = await service.storage.from("submissions").remove([storagePath]);
        if (removed.error) cleanupErrors.push(removed.error);
      }
      if (auditEventId) {
        const removed = await service.from("audit_log").delete().eq("id", auditEventId);
        if (removed.error) cleanupErrors.push(removed.error);
      }
      if (importApplied) {
        const rollback = await service.rpc("fn_rollback_course_import", {
          p_import_id: plan.importId,
          p_owned: buildRollbackOwnedIds(plan),
        });
        if (rollback.error) cleanupErrors.push(rollback.error);
      }
      for (const actor of [learner, ordinaryAdmin, reviewer]) {
        if (!actor) continue;
        const removed = await service.auth.admin.deleteUser(actor.id);
        if (removed.error) cleanupErrors.push(removed.error);
      }
      if (testError && cleanupErrors.length > 0) {
        throw new AggregateError(
          [testError, ...cleanupErrors],
          "Reviewer evidence proof and its TEST cleanup both failed.",
        );
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          "Reviewer evidence TEST cleanup failed.",
        );
      }
    }
    if (testError) throw testError;
  });

  it("preserves ordinary admin review and editing of hand-authored unpublished drafts", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const suffix = randomBytes(8).toString("hex");
    const ids = {
      roleGroup: randomUUID(), program: randomUUID(), course: randomUUID(),
      programCourse: randomUUID(), programAccess: randomUUID(), courseAccess: randomUUID(),
      module: randomUUID(), quiz: randomUUID(), question: randomUUID(),
      answerOption: randomUUID(), assignment: randomUUID(), contentLesson: randomUUID(),
      quizLesson: randomUUID(), assignmentLesson: randomUUID(), contentBlock: randomUUID(),
    };
    const references: CatalogRowReference[] = [
      { table: "programs", id: ids.program },
      { table: "courses", id: ids.course },
      { table: "program_courses", id: ids.programCourse },
      { table: "program_access", id: ids.programAccess },
      { table: "course_access", id: ids.courseAccess },
      { table: "modules", id: ids.module },
      { table: "lessons", id: ids.contentLesson },
      { table: "content_blocks", id: ids.contentBlock },
      { table: "quizzes", id: ids.quiz },
      { table: "questions", id: ids.question },
      { table: "answer_options", id: ids.answerOption },
      { table: "assignments", id: ids.assignment },
    ];
    let admin: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let manualLearner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let manualSubmissionId: string | null = null;
    let manualStoragePath: string | null = null;
    let testError: unknown = null;

    const insert = async (table: string, row: Record<string, unknown>) => {
      const result = await service.from(table).insert(row);
      if (result.error) throw result.error;
    };

    try {
      await insert("role_groups", { id: ids.roleGroup, name: `Hand-authored draft ${suffix}` });
      await insert("programs", {
        id: ids.program, title: `Hand-authored program ${suffix}`,
        description: "Unpublished editor fixture.", is_published: false,
      });
      await insert("courses", {
        id: ids.course, title: `Hand-authored course ${suffix}`,
        description: "Unpublished editor fixture.", is_published: false,
      });
      await insert("program_courses", {
        id: ids.programCourse, program_id: ids.program, course_id: ids.course,
      });
      await insert("program_access", {
        id: ids.programAccess, program_id: ids.program, role_group_id: ids.roleGroup,
      });
      await insert("course_access", {
        id: ids.courseAccess, course_id: ids.course, role_group_id: ids.roleGroup,
      });
      await insert("modules", { id: ids.module, course_id: ids.course, title: "Draft module" });
      await insert("quizzes", { id: ids.quiz, title: "Draft quiz" });
      await insert("questions", {
        id: ids.question, quiz_id: ids.quiz, question_text: "Draft question?",
        question_type: "single_choice",
      });
      await insert("answer_options", {
        id: ids.answerOption, question_id: ids.question,
        option_text: "Draft answer", is_correct: true,
      });
      await insert("assignments", {
        id: ids.assignment, title: "Draft assignment",
        instructions: "Complete the draft assignment.", submission_type: "text",
        requires_review: true,
        rubric: [{ criterion: "Complete", description: "Answers the prompt." }],
      });
      await insert("lessons", {
        id: ids.contentLesson, module_id: ids.module, title: "Draft content lesson",
        lesson_type: "content", sort_order: 0,
      });
      await insert("lessons", {
        id: ids.quizLesson, module_id: ids.module, title: "Draft quiz lesson",
        lesson_type: "quiz", quiz_id: ids.quiz, sort_order: 1,
      });
      await insert("lessons", {
        id: ids.assignmentLesson, module_id: ids.module, title: "Draft assignment lesson",
        lesson_type: "assignment", assignment_id: ids.assignment, sort_order: 2,
      });
      await insert("content_blocks", {
        id: ids.contentBlock, lesson_id: ids.contentLesson,
        block_type: "text", content: { markdown: "Draft content." },
      });

      admin = await createSignedInUser("admin");
      manualLearner = await createSignedInUser("learner");
      expect(await readCatalogReferences(admin.client, references)).toEqual(
        references.map(({ id }) => id),
      );

      const manualOptionCreate = await admin.client.rpc(
        "fn_create_answer_option_for_reviewer_v1",
        {
          p_lesson_id: ids.quizLesson,
          p_question_id: ids.question,
          p_option_text: "Draft answer created through the admin RPC",
        },
      );
      expect(manualOptionCreate.error).toBeNull();
      expect(manualOptionCreate.data).toBe(true);

      const directEdit = await admin.client
        .from("programs")
        .update({ description: "Edited by an ordinary admin." })
        .eq("id", ids.program)
        .select("id")
        .single();
      expect(directEdit.error).toBeNull();
      expect(directEdit.data?.id).toBe(ids.program);

      const moduleMove = await admin.client.rpc("fn_move_module", {
        p_module_id: ids.module, p_course_id: ids.course, p_direction: "up",
      });
      expect(moduleMove.error).toBeNull();

      const assignmentUpdate = await admin.client.rpc("fn_update_assignment_for_lesson", {
        p_lesson_id: ids.assignmentLesson, p_assignment_id: ids.assignment,
        p_title: "Draft assignment edited",
        p_instructions: "Complete the edited draft assignment.",
        p_submission_type: "text", p_requires_review: true,
        p_rubric: [{ criterion: "Complete", description: "Answers the edited prompt." }],
      });
      expect(assignmentUpdate.error).toBeNull();
      expect(assignmentUpdate.data).toBe(true);

      manualStoragePath = `${manualLearner.id}/manual-${suffix}.txt`;
      const upload = await service.storage
        .from("submissions")
        .upload(manualStoragePath, Buffer.from("ordinary draft submission"), {
          contentType: "text/plain",
          upsert: false,
        });
      expect(upload.error).toBeNull();
      const submission = await service
        .from("assignment_submissions")
        .insert({
          assignment_id: ids.assignment,
          lesson_id: ids.assignmentLesson,
          user_id: manualLearner.id,
          submission_text: "Ordinary draft submission",
          submission_file_path: manualStoragePath,
          status: "submitted",
        })
        .select("id")
        .single();
      if (submission.error || !submission.data) {
        throw submission.error ?? new Error("Manual submission insert failed.");
      }
      manualSubmissionId = submission.data.id;

      const visibleSubmission = await admin.client
        .from("assignment_submissions")
        .select("id")
        .eq("id", manualSubmissionId)
        .single();
      expect(visibleSubmission.error).toBeNull();
      expect(visibleSubmission.data?.id).toBe(manualSubmissionId);
      const reviewedSubmission = await admin.client
        .from("assignment_submissions")
        .update({
          status: "needs_revision",
          reviewer_notes: "Ordinary admin review remains available.",
        })
        .eq("id", manualSubmissionId)
        .select("id")
        .single();
      expect(reviewedSubmission.error).toBeNull();
      expect(reviewedSubmission.data?.id).toBe(manualSubmissionId);
      const signedFile = await admin.client.storage
        .from("submissions")
        .createSignedUrl(manualStoragePath, 60);
      expect(signedFile.error).toBeNull();
      expect(signedFile.data?.signedUrl).toBeTruthy();
    } catch (error) {
      testError = error;
    } finally {
      const cleanupErrors: Error[] = [];
      if (manualStoragePath) {
        const removed = await service.storage
          .from("submissions")
          .remove([manualStoragePath]);
        if (removed.error) cleanupErrors.push(removed.error);
      }
      if (manualSubmissionId) {
        const removed = await service
          .from("assignment_submissions")
          .delete()
          .eq("id", manualSubmissionId);
        if (removed.error) cleanupErrors.push(removed.error);
      }
      for (const actor of [admin, manualLearner]) {
        if (!actor) continue;
        const removed = await service.auth.admin.deleteUser(actor.id);
        if (removed.error) cleanupErrors.push(removed.error);
      }
      for (const [table, id] of [
        ["programs", ids.program],
        ["courses", ids.course],
        ["quizzes", ids.quiz],
        ["assignments", ids.assignment],
        ["role_groups", ids.roleGroup],
      ] as const) {
        const removed = await service.from(table).delete().eq("id", id);
        if (removed.error) cleanupErrors.push(removed.error);
      }
      if (testError && cleanupErrors.length > 0) {
        throw new AggregateError(
          [testError, ...cleanupErrors],
          "Manual draft proof and its TEST cleanup both failed.",
        );
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, "Manual draft TEST cleanup failed.");
      }
    }
    if (testError) throw testError;
  });

  it("refuses to link a pre-created QA role group that already has a learner", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const qaRoleGroup = atomicImportOperations(plan).find(
      (operation) => operation.table === "role_groups",
    );
    const program = atomicImportOperations(plan).find(
      (operation) => operation.table === "programs",
    );
    if (!qaRoleGroup || !program) throw new Error("Test import roots are missing.");
    let learner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;

    try {
      learner = await createSignedInUser("learner");
      const roleGroup = await service.from("role_groups").insert(qaRoleGroup.row);
      if (roleGroup.error) throw roleGroup.error;
      const membership = await service.from("user_role_groups").insert({
        user_id: learner.id,
        role_group_id: qaRoleGroup.id,
      });
      if (membership.error) throw membership.error;

      await expect(applyImportPlan(plan, adapter())).rejects.toThrow(
        /already has user memberships/i,
      );

      const importedProgram = await service
        .from("programs")
        .select("id", { count: "exact", head: true })
        .eq("id", program.id);
      expect(importedProgram.error).toBeNull();
      expect(importedProgram.count).toBe(0);
    } finally {
      if (learner) {
        await service
          .from("user_role_groups")
          .delete()
          .eq("user_id", learner.id)
          .eq("role_group_id", qaRoleGroup.id);
        await service.auth.admin.deleteUser(learner.id);
      }
      await service.from("role_groups").delete().eq("id", qaRoleGroup.id);
    }
  });

  it("refuses forged and oversized drift cleanup and preserves Sandra delivery evidence", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const operation = (table: ImportPlan["operations"][number]["table"]) => {
      const row = atomicImportOperations(plan).find((candidate) => candidate.table === table);
      if (!row) throw new Error(`Test import is missing ${table}.`);
      return row;
    };
    let user: Awaited<ReturnType<typeof createSignedInUser>> | null = null;

    try {
      await applyImportPlan(plan, adapter());
      user = await createSignedInUser("learner");

      const authenticated = await user.client.rpc(
        "fn_remove_unreleased_import_reconciliation_drift",
        {
          p_import_id: plan.importId,
          p_lesson_ids: [],
          p_orphan_course_ids: [randomUUID()],
        },
      );
      expect(authenticated.error).not.toBeNull();

      const duplicateId = randomUUID();
      const duplicate = await service.rpc(
        "fn_remove_unreleased_import_reconciliation_drift",
        {
          p_import_id: plan.importId,
          p_lesson_ids: [duplicateId],
          p_orphan_course_ids: [duplicateId],
        },
      );
      expect(duplicate.error?.message).toMatch(/IDs must be unique/i);

      const oversized = await service.rpc(
        "fn_remove_unreleased_import_reconciliation_drift",
        {
          p_import_id: plan.importId,
          p_lesson_ids: Array.from({ length: 101 }, () => randomUUID()),
          p_orphan_course_ids: [],
        },
      );
      expect(oversized.error?.message).toMatch(/payload is invalid/i);

      const wrongImport = await service.rpc(
        "fn_remove_unreleased_import_reconciliation_drift",
        {
          p_import_id: `${plan.importId}-wrong`,
          p_lesson_ids: [operation("lessons").id],
          p_orphan_course_ids: [],
        },
      );
      expect(wrongImport.error?.message).toMatch(/claimed, active, or dependent/i);

      const claimedLesson = await service.rpc(
        "fn_remove_unreleased_import_reconciliation_drift",
        {
          p_import_id: plan.importId,
          p_lesson_ids: [operation("lessons").id],
          p_orphan_course_ids: [],
        },
      );
      expect(claimedLesson.error?.message).toMatch(/claimed, active, or dependent/i);

      const delivery = await service
        .from("sandra_course_completion_deliveries")
        .insert({
          user_id: user.id,
          course_id: operation("courses").id,
          completed_at: new Date().toISOString(),
          payload: { source: "rollback-refusal-test" },
        });
      if (delivery.error) throw delivery.error;

      const protectedRollback = await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      expect(protectedRollback.error?.message).toMatch(/durable Sandra completion delivery evidence/i);

      await service.auth.admin.deleteUser(user.id);
      user = null;
    } finally {
      if (user) await service.auth.admin.deleteUser(user.id);
      await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
    }
  });

  it("blocks rogue inserts under imported ownership while preserving manual catalog creation", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const operation = (table: ImportPlan["operations"][number]["table"]) => {
      const row = atomicImportOperations(plan).find((candidate) => candidate.table === table);
      if (!row) throw new Error(`Test import is missing ${table}.`);
      return row;
    };
    const manual = {
      programId: randomUUID(),
      courseId: randomUUID(),
      moduleId: randomUUID(),
      lessonId: randomUUID(),
      quizId: randomUUID(),
      questionId: randomUUID(),
      roleGroupId: randomUUID(),
    };
    let owner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;

    try {
      await applyImportPlan(plan, adapter());
      owner = await createSignedInUser("owner");

      const manualRoots = await Promise.all([
        service.from("programs").insert({ id: manual.programId, title: "Manual insert program" }),
        service.from("courses").insert({ id: manual.courseId, title: "Manual insert course" }),
        service.from("quizzes").insert({ id: manual.quizId, title: "Manual insert quiz" }),
        service.from("role_groups").insert({ id: manual.roleGroupId, name: `Manual insert ${randomUUID()}` }),
      ]);
      for (const result of manualRoots) if (result.error) throw result.error;
      const manualModule = await service.from("modules").insert({
        id: manual.moduleId,
        course_id: manual.courseId,
        title: "Manual insert module",
      });
      if (manualModule.error) throw manualModule.error;
      const [manualLesson, manualQuestion] = await Promise.all([
        service.from("lessons").insert({
          id: manual.lessonId,
          module_id: manual.moduleId,
          title: "Manual insert lesson",
          lesson_type: "content",
        }),
        service.from("questions").insert({
          id: manual.questionId,
          quiz_id: manual.quizId,
          question_text: "Manual insert question",
          question_type: "single_choice",
        }),
      ]);
      if (manualLesson.error) throw manualLesson.error;
      if (manualQuestion.error) throw manualQuestion.error;
      const manualEdges = await Promise.all([
        service.from("content_blocks").insert({
          lesson_id: manual.lessonId,
          block_type: "text",
          content: { text: "Manual block" },
        }),
        service.from("program_courses").insert({
          program_id: manual.programId,
          course_id: manual.courseId,
        }),
        service.from("program_access").insert({
          program_id: manual.programId,
          role_group_id: manual.roleGroupId,
        }),
        service.from("answer_options").insert({
          question_id: manual.questionId,
          option_text: "Manual answer",
        }),
      ]);
      for (const result of manualEdges) expect(result.error).toBeNull();

      const rogueAttempts = [
        service.from("programs").insert({
          title: "Rogue imported program root",
          content_import_id: plan.importId,
        }),
        service.from("courses").insert({
          title: "Rogue imported course root",
          content_import_id: plan.importId,
        }),
        service.from("modules").insert({
          course_id: operation("courses").id,
          title: "Rogue imported module",
        }),
        service.from("lessons").insert({
          module_id: operation("modules").id,
          title: "Rogue imported lesson",
          lesson_type: "content",
        }),
        service.from("lessons").insert({
          module_id: manual.moduleId,
          title: "Rogue imported quiz edge",
          lesson_type: "quiz",
          quiz_id: operation("quizzes").id,
        }),
        service.from("content_blocks").insert({
          lesson_id: operation("lessons").id,
          block_type: "text",
          content: { text: "Rogue imported block" },
        }),
        service.from("program_courses").insert({
          program_id: operation("programs").id,
          course_id: manual.courseId,
        }),
        service.from("program_access").insert({
          program_id: operation("programs").id,
          role_group_id: manual.roleGroupId,
        }),
        service.from("questions").insert({
          quiz_id: operation("quizzes").id,
          question_text: "Rogue imported question",
          question_type: "single_choice",
        }),
        service.from("answer_options").insert({
          question_id: operation("questions").id,
          option_text: "Rogue imported answer",
        }),
      ];
      for (const attempt of await Promise.all(rogueAttempts)) {
        expect(attempt.error?.message).toMatch(/exact .*apply.*operation/i);
      }

      const rogueProvenanceClaim = await service
        .from("courses")
        .update({ content_import_id: plan.importId })
        .eq("id", manual.courseId);
      expect(rogueProvenanceClaim.error?.message).toMatch(/exact course-import apply operation/i);

      const ownerAttempt = await owner.client.from("modules").insert({
        course_id: operation("courses").id,
        title: "Owner rogue imported module",
      });
      expect(ownerAttempt.error).not.toBeNull();

      const rollback = await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      expect(rollback.error).toBeNull();
      expect(rollback.data).toMatchObject({ status: "rolled_back" });
    } finally {
      if (owner) await service.auth.admin.deleteUser(owner.id);
      await service.from("programs").delete().eq("id", manual.programId);
      await service.from("courses").delete().eq("id", manual.courseId);
      await service.from("quizzes").delete().eq("id", manual.quizId);
      await service.from("role_groups").delete().eq("id", manual.roleGroupId);
      const importedProgram = operation("programs").id;
      const remaining = await service
        .from("programs")
        .select("id", { count: "exact", head: true })
        .eq("id", importedProgram);
      if (remaining.count) {
        await service.rpc("fn_rollback_course_import", {
          p_import_id: plan.importId,
          p_owned: buildRollbackOwnedIds(plan),
        });
      }
    }
  });

  it("prevents imported descendants from being reparented around exact rollback", async () => {
    if (!service) throw new Error("Test-project service client is unavailable.");
    const plan = uniquePlan();
    const operation = (table: ImportPlan["operations"][number]["table"]) => {
      const row = atomicImportOperations(plan).find((candidate) => candidate.table === table);
      if (!row) throw new Error(`Test import is missing ${table}.`);
      return row;
    };
    const manual = {
      programId: randomUUID(),
      courseId: randomUUID(),
      moduleId: randomUUID(),
      lessonId: randomUUID(),
      quizId: randomUUID(),
      questionId: randomUUID(),
    };

    try {
      await applyImportPlan(plan, adapter());
      const roots = await Promise.all([
        service.from("programs").insert({ id: manual.programId, title: "Manual program root" }),
        service.from("courses").insert({ id: manual.courseId, title: "Manual course root" }),
        service.from("quizzes").insert({ id: manual.quizId, title: "Manual quiz root" }),
      ]);
      for (const result of roots) if (result.error) throw result.error;
      const moduleRow = await service.from("modules").insert({
        id: manual.moduleId,
        course_id: manual.courseId,
        title: "Manual module root",
      });
      if (moduleRow.error) throw moduleRow.error;
      const [lessonRow, questionRow] = await Promise.all([
        service.from("lessons").insert({
          id: manual.lessonId,
          module_id: manual.moduleId,
          title: "Manual lesson root",
          lesson_type: "content",
        }),
        service.from("questions").insert({
          id: manual.questionId,
          quiz_id: manual.quizId,
          question_text: "Manual question root",
          question_type: "single_choice",
        }),
      ]);
      if (lessonRow.error) throw lessonRow.error;
      if (questionRow.error) throw questionRow.error;

      const attempts = [
        service.from("modules").update({ course_id: manual.courseId }).eq("id", operation("modules").id),
        service.from("lessons").update({ module_id: manual.moduleId }).eq("id", operation("lessons").id),
        service.from("content_blocks").update({ lesson_id: manual.lessonId }).eq("id", operation("content_blocks").id),
        service.from("program_courses").update({ program_id: manual.programId }).eq("id", operation("program_courses").id),
        service.from("program_access").update({ program_id: manual.programId }).eq("id", operation("program_access").id),
        service.from("questions").update({ quiz_id: manual.quizId }).eq("id", operation("questions").id),
        service.from("answer_options").update({ question_id: manual.questionId }).eq("id", operation("answer_options").id),
      ];
      for (const attempt of await Promise.all(attempts)) {
        expect(attempt.error?.message).toMatch(/ownership edges are immutable/i);
      }

      const rollback = await service.rpc("fn_rollback_course_import", {
        p_import_id: plan.importId,
        p_owned: buildRollbackOwnedIds(plan),
      });
      expect(rollback.error).toBeNull();
      expect(rollback.data).toMatchObject({ status: "rolled_back" });
    } finally {
      await service.from("programs").delete().eq("id", manual.programId);
      await service.from("courses").delete().eq("id", manual.courseId);
      await service.from("quizzes").delete().eq("id", manual.quizId);
      const importedProgram = operation("programs").id;
      const remaining = await service
        .from("programs")
        .select("id", { count: "exact", head: true })
        .eq("id", importedProgram);
      if (remaining.count) {
        await service.rpc("fn_rollback_course_import", {
          p_import_id: plan.importId,
          p_owned: buildRollbackOwnedIds(plan),
        });
      }
    }
  });
});
