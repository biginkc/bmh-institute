import {
  spawn,
  type ChildProcessByStdio,
} from "node:child_process";
import type { Readable } from "node:stream";
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { courseImportProviderPsqlEnvironment } from "@/lib/course-import/provider-acceptance";

const url = requiredTestEnvironment("TEST_SUPABASE_URL");
const serviceRoleKey = requiredTestEnvironment("TEST_SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl = requiredTestEnvironment("TEST_SUPABASE_DB_URL");
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const psqlEnvironment = courseImportProviderPsqlEnvironment(databaseUrl);

type PsqlResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type HeldLock = {
  child: ChildProcessByStdio<null, Readable, Readable>;
  ready: Promise<void>;
  done: Promise<PsqlResult>;
};

function requiredTestEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for quiz contention TEST coverage.`);
  return value;
}

function runPsql(sql: string): Promise<PsqlResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PSQL_BIN ?? "psql",
      ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { env: { ...process.env, ...psqlEnvironment }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function holdAttemptLock(attemptId: string): HeldLock {
  const child = spawn(
    process.env.PSQL_BIN ?? "psql",
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      `begin;
       select id from public.user_quiz_attempts where id = '${attemptId}' for update;
       select 'LOCK_READY';
       select pg_sleep(7);
       commit;`,
    ],
    { env: { ...process.env, ...psqlEnvironment }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const done = new Promise<PsqlResult>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("LOCK_READY")) readyResolve();
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      readyReject(error);
      reject(error);
    });
    child.on("close", (code) => {
      if (!stdout.includes("LOCK_READY")) {
        readyReject(new Error("The TEST lock holder never acquired the attempt row lock."));
      }
      resolve({ code, stdout, stderr });
    });
  });
  return { child, ready, done };
}

describe("quiz attempt contention on migrated TEST", () => {
  it("enforces migrated lock timeout and one-winner concurrent start", async () => {
    const suffix = randomBytes(8).toString("hex");
    const password = `${randomBytes(24).toString("base64url")}!Aa1`;
    const email = `quiz-contention-${suffix}@bmh.invalid`;
    let userId: string | null = null;
    let courseId: string | null = null;
    let quizId: string | null = null;
    let lessonId: string | null = null;
    let questionId: string | null = null;
    let optionId: string | null = null;
    const attemptIds: string[] = [];
    let holder: HeldLock | null = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw created.error ?? new Error("TEST learner creation failed.");
      }
      userId = created.data.user.id;

      const course = await admin
        .from("courses")
        .insert({ title: `Quiz contention ${suffix}`, is_published: true })
        .select("id")
        .single();
      if (course.error || !course.data) throw course.error;
      courseId = course.data.id;

      const moduleRow = await admin
        .from("modules")
        .insert({ course_id: courseId, title: "Quiz contention module" })
        .select("id")
        .single();
      if (moduleRow.error || !moduleRow.data) throw moduleRow.error;

      const quiz = await admin
        .from("quizzes")
        .insert({ title: `Quiz contention ${suffix}` })
        .select("id")
        .single();
      if (quiz.error || !quiz.data) throw quiz.error;
      quizId = quiz.data.id;

      const lesson = await admin
        .from("lessons")
        .insert({
          module_id: moduleRow.data.id,
          title: "Quiz contention lesson",
          lesson_type: "quiz",
          quiz_id: quizId,
        })
        .select("id")
        .single();
      if (lesson.error || !lesson.data) throw lesson.error;
      lessonId = lesson.data.id;

      const question = await admin
        .from("questions")
        .insert({
          quiz_id: quizId,
          question_text: "Contention question",
          question_type: "single_choice",
          sort_order: 1,
        })
        .select("id")
        .single();
      if (question.error || !question.data) throw question.error;
      questionId = question.data.id;

      const option = await admin
        .from("answer_options")
        .insert({
          question_id: questionId,
          option_text: "Contention answer",
          sort_order: 1,
          is_correct: true,
        })
        .select("id")
        .single();
      if (option.error || !option.data) throw option.error;
      optionId = option.data.id;

      const migrationState = await runPsql(`
        select version
        from supabase_migrations.schema_migrations
        where version = '20260729220000'
        order by version;
      `);
      expect(migrationState.code).toBe(0);
      expect(migrationState.stdout.trim().split(/\s+/)).toEqual(["20260729220000"]);

      const functionSettings = await runPsql(`
        select array_to_string(proconfig, ',')
        from pg_proc
        join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
        where pg_namespace.nspname = 'public'
          and pg_proc.proname = 'fn_record_quiz_answer';
      `);
      expect(functionSettings.code).toBe(0);
      expect(functionSettings.stdout).toMatch(/lock_timeout=5s/);
      expect(functionSettings.stdout).not.toMatch(/statement_timeout=8s/);

      const lockAttempt = await admin
        .from("user_quiz_attempts")
        .insert({
          user_id: userId,
          quiz_id: quizId,
          lesson_id: lessonId,
          question_order: [questionId],
          answer_orders: { [questionId!]: [optionId] },
          responses: {},
        })
        .select("id")
        .single();
      if (lockAttempt.error || !lockAttempt.data) throw lockAttempt.error;
      attemptIds.push(lockAttempt.data.id);

      holder = holdAttemptLock(lockAttempt.data.id);
      await holder.ready;
      const blockedStartedAt = Date.now();
      const blocked = await runPsql(`
        select *
        from public.fn_record_quiz_answer(
          '${lockAttempt.data.id}',
          '${questionId}',
          array['${optionId}']::text[]
        );
      `);
      const blockedDurationMs = Date.now() - blockedStartedAt;
      expect(blocked.code).not.toBe(0);
      expect(blocked.stderr).toMatch(/lock timeout|canceling statement due to lock timeout/i);
      expect(blockedDurationMs).toBeGreaterThanOrEqual(4_000);
      expect(blockedDurationMs).toBeLessThan(7_000);
      await holder.done;
      holder = null;

      await admin.from("user_quiz_attempts").delete().eq("id", lockAttempt.data.id);
      attemptIds.length = 0;

      const startPayload = {
        user_id: userId,
        quiz_id: quizId,
        lesson_id: lessonId,
        question_order: [questionId],
        answer_orders: { [questionId!]: [optionId] },
        responses: {},
      };
      const startA = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const startB = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const starts = await Promise.all([
        startA.from("user_quiz_attempts").insert(startPayload).select("id").single(),
        startB.from("user_quiz_attempts").insert(startPayload).select("id").single(),
      ]);
      const winners = starts.filter((result) => !result.error && result.data);
      const losers = starts.filter((result) => result.error);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]?.error?.code).toBe("23505");
      if (winners[0]?.data?.id) attemptIds.push(winners[0].data.id);

      const persisted = await admin
        .from("user_quiz_attempts")
        .select("id")
        .eq("user_id", userId)
        .eq("quiz_id", quizId)
        .is("completed_at", null);
      expect(persisted.error).toBeNull();
      expect(persisted.data).toHaveLength(1);
    } finally {
      if (holder) {
        holder.child.kill();
        await holder.done.catch(() => undefined);
      }
      const cleanupFailures: string[] = [];
      if (attemptIds.length) {
        const result = await admin
          .from("user_quiz_attempts")
          .delete()
          .in("id", attemptIds);
        if (result.error) cleanupFailures.push(`attempts: ${result.error.message}`);
      }
      if (quizId) {
        const result = await admin.from("quizzes").delete().eq("id", quizId);
        if (result.error) cleanupFailures.push(`quiz: ${result.error.message}`);
      }
      if (courseId) {
        const result = await admin.from("courses").delete().eq("id", courseId);
        if (result.error) cleanupFailures.push(`course: ${result.error.message}`);
      }
      if (userId) {
        const result = await admin.auth.admin.deleteUser(userId);
        if (result.error) cleanupFailures.push(`auth user: ${result.error.message}`);
      }
      if (cleanupFailures.length) {
        throw new Error(`TEST fixture cleanup failed: ${cleanupFailures.join("; ")}`);
      }
    }
  }, 30_000);
});
