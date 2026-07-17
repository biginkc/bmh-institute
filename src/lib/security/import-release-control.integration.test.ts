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

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
const envPresent = Boolean(url && anonKey && serviceKey && databaseUrl);
const service = envPresent
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

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
  systemRole: "learner" | "owner",
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
          PGDATABASE: databaseUrl,
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

describe.skipIf(!envPresent)("imported catalog release control on a test project", () => {
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
              from pg_stat_activity blocked
              where blocked.pid <> pg_backend_pid()
                and blocked.wait_event_type = 'Lock'
                and ${writerPid} = any(pg_blocking_pids(blocked.pid))
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

  it("lets only the sole QA cohort exercise the unpublished learner path and blocks admin deletion", async () => {
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
    const qaRoleGroup = operation("role_groups");
    let learner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let owner: Awaited<ReturnType<typeof createSignedInUser>> | null = null;
    let unrelatedCourseId: string | null = null;

    try {
      await applyImportPlan(plan, adapter());
      learner = await createSignedInUser("learner");
      owner = await createSignedInUser("owner");
      const membership = await service.from("user_role_groups").insert({
        user_id: learner.id,
        role_group_id: qaRoleGroup.id,
      });
      if (membership.error) throw membership.error;

      const unrelated = await service
        .from("courses")
        .insert({ title: `Unrelated unpublished ${randomBytes(6).toString("hex")}` })
        .select("id")
        .single();
      if (unrelated.error || !unrelated.data) throw unrelated.error;
      unrelatedCourseId = unrelated.data.id;
      const unrelatedAccess = await service.from("course_access").insert({
        course_id: unrelatedCourseId,
        role_group_id: qaRoleGroup.id,
      });
      if (unrelatedAccess.error) throw unrelatedAccess.error;

      const [visibleProgram, visibleCourse, visibleLesson, hiddenUnrelated, unlocked] =
        await Promise.all([
          learner.client.from("programs").select("id").eq("id", program.id).maybeSingle(),
          learner.client.from("courses").select("id").eq("id", course.id).maybeSingle(),
          learner.client.from("lessons").select("id").eq("id", lesson.id).maybeSingle(),
          learner.client.from("courses").select("id").eq("id", unrelatedCourseId).maybeSingle(),
          learner.client.rpc("fn_lesson_is_unlocked", {
            p_user_id: learner.id,
            p_lesson_id: lesson.id,
          }),
        ]);
      expect(visibleProgram.data?.id).toBe(program.id);
      expect(visibleCourse.data?.id).toBe(course.id);
      expect(visibleLesson.data?.id).toBe(lesson.id);
      expect(hiddenUnrelated.data).toBeNull();
      expect(unlocked.error).toBeNull();
      expect(unlocked.data).toBe(true);

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
    } finally {
      if (unrelatedCourseId) {
        await service.from("course_access").delete().eq("course_id", unrelatedCourseId);
        await service.from("courses").delete().eq("id", unrelatedCourseId);
      }
      if (learner) await service.auth.admin.deleteUser(learner.id);
      if (owner) await service.auth.admin.deleteUser(owner.id);
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
