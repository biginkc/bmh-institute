import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { courseImportProviderPsqlEnvironment } from "@/lib/course-import/provider-acceptance";

function requiredTestEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for intranet quiz-summary integration coverage.`);
  }
  return value;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const url = requiredTestEnvironment("TEST_SUPABASE_URL");
const serviceRoleKey = requiredTestEnvironment(
  "TEST_SUPABASE_SERVICE_ROLE_KEY",
);
const databaseUrl = requiredTestEnvironment("TEST_SUPABASE_DB_URL");
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const psqlEnvironment = courseImportProviderPsqlEnvironment(databaseUrl);
const migrationSql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260901015000_intranet_quiz_summary.sql",
  ),
  "utf8",
);

type Summary = {
  attempts: number;
  best_final_quiz_score: number | null;
  catalog_valid: boolean;
  email: string | null;
  last_attempt_at: string | null;
  profile_match_count: number;
};

function runFixture(sql: string): Map<string, Summary> {
  const stdout = execFileSync(
    process.env.PSQL_BIN ?? "psql",
    ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      encoding: "utf8",
      env: { ...process.env, ...psqlEnvironment },
    },
  );

  return new Map(
    stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("|");
        return [
          line.slice(0, separator),
          JSON.parse(line.slice(separator + 1)) as Summary,
        ];
      }),
  );
}

function summarySql(label: string, email: string, importId: string): string {
  return `
    select ${sqlLiteral(`${label}|`)} || row_to_json(summary)::text
    from public.fn_intranet_learner_quiz_summary_v1(
      ${sqlLiteral(email)},
      ${sqlLiteral(importId)}
    ) summary;
  `;
}

describe("intranet quiz summary SQL function on migrated TEST", () => {
  it("uses exact email equality and fails closed on module and quiz ties", async () => {
    const suffix = randomBytes(8).toString("hex");
    const email = `intranet-summary-${suffix}@bmh.invalid`;
    const password = `${randomBytes(24).toString("base64url")}!Aa1`;
    const importId = `intranet-summary-${suffix}`;
    const ids = {
      course: randomUUID(),
      earlyLesson: randomUUID(),
      earlyModule: randomUUID(),
      earlyQuiz: randomUUID(),
      finalLesson: randomUUID(),
      finalModule: randomUUID(),
      finalQuiz: randomUUID(),
      tieLesson: randomUUID(),
      tieModule: randomUUID(),
      tieQuiz: randomUUID(),
      unrelatedCourse: randomUUID(),
      unrelatedLesson: randomUUID(),
      unrelatedModule: randomUUID(),
      unrelatedQuiz: randomUUID(),
    };
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Could not create the TEST learner.");
    }

    try {
      const summaries = runFixture(`
        begin;
        ${migrationSql}
        set local session_replication_role = replica;

        insert into public.courses (id, title, is_published, content_import_id)
        values
          (${sqlLiteral(ids.course)}::uuid, 'Canonical', true, ${sqlLiteral(importId)}),
          (${sqlLiteral(ids.unrelatedCourse)}::uuid, 'Unrelated', true, ${sqlLiteral(`${importId}-unrelated`)});

        insert into public.modules (id, course_id, title, sort_order)
        values
          (${sqlLiteral(ids.earlyModule)}::uuid, ${sqlLiteral(ids.course)}::uuid, 'Early', 1),
          (${sqlLiteral(ids.finalModule)}::uuid, ${sqlLiteral(ids.course)}::uuid, 'Final', 2),
          (${sqlLiteral(ids.unrelatedModule)}::uuid, ${sqlLiteral(ids.unrelatedCourse)}::uuid, 'Unrelated', 99);

        insert into public.quizzes (id, title)
        values
          (${sqlLiteral(ids.earlyQuiz)}::uuid, 'Early'),
          (${sqlLiteral(ids.finalQuiz)}::uuid, 'Final'),
          (${sqlLiteral(ids.unrelatedQuiz)}::uuid, 'Unrelated'),
          (${sqlLiteral(ids.tieQuiz)}::uuid, 'Tie');

        insert into public.lessons
          (id, module_id, title, lesson_type, quiz_id, is_required_for_completion, sort_order)
        values
          (${sqlLiteral(ids.earlyLesson)}::uuid, ${sqlLiteral(ids.earlyModule)}::uuid, 'Early', 'quiz', ${sqlLiteral(ids.earlyQuiz)}::uuid, true, 99),
          (${sqlLiteral(ids.finalLesson)}::uuid, ${sqlLiteral(ids.finalModule)}::uuid, 'Final', 'quiz', ${sqlLiteral(ids.finalQuiz)}::uuid, true, 1),
          (${sqlLiteral(ids.unrelatedLesson)}::uuid, ${sqlLiteral(ids.unrelatedModule)}::uuid, 'Unrelated', 'quiz', ${sqlLiteral(ids.unrelatedQuiz)}::uuid, true, 99);

        insert into public.user_quiz_attempts
          (user_id, quiz_id, lesson_id, score, completed_at)
        values
          (${sqlLiteral(created.data.user.id)}::uuid, ${sqlLiteral(ids.earlyQuiz)}::uuid, ${sqlLiteral(ids.earlyLesson)}::uuid, 100, '2026-08-30T10:00:00Z'),
          (${sqlLiteral(created.data.user.id)}::uuid, ${sqlLiteral(ids.finalQuiz)}::uuid, ${sqlLiteral(ids.finalLesson)}::uuid, 80, '2026-08-30T11:00:00Z'),
          (${sqlLiteral(created.data.user.id)}::uuid, ${sqlLiteral(ids.finalQuiz)}::uuid, ${sqlLiteral(ids.finalLesson)}::uuid, 90, '2026-08-30T12:00:00Z'),
          (${sqlLiteral(created.data.user.id)}::uuid, ${sqlLiteral(ids.unrelatedQuiz)}::uuid, ${sqlLiteral(ids.unrelatedLesson)}::uuid, 100, '2026-08-30T13:00:00Z');

        set local role service_role;

        ${summarySql("EXACT", email.toUpperCase(), importId)}
        ${summarySql("ASTERISK", "*", importId)}

        insert into public.modules (id, course_id, title, sort_order)
        values (${sqlLiteral(ids.tieModule)}::uuid, ${sqlLiteral(ids.course)}::uuid, 'Tie', 2);

        ${summarySql("MODULE_TIE", email, importId)}

        delete from public.modules
        where id = ${sqlLiteral(ids.tieModule)}::uuid;
        insert into public.lessons
          (id, module_id, title, lesson_type, quiz_id, is_required_for_completion, sort_order)
        values
          (${sqlLiteral(ids.tieLesson)}::uuid, ${sqlLiteral(ids.finalModule)}::uuid, 'Tie', 'quiz', ${sqlLiteral(ids.tieQuiz)}::uuid, true, 1);

        ${summarySql("QUIZ_TIE", email, importId)}
        rollback;
      `);

      expect(summaries.get("EXACT")).toMatchObject({
        attempts: 2,
        best_final_quiz_score: 90,
        catalog_valid: true,
        email,
        profile_match_count: 1,
      });
      expect(
        new Date(summaries.get("EXACT")?.last_attempt_at ?? "").toISOString(),
      ).toBe("2026-08-30T12:00:00.000Z");
      expect(summaries.get("ASTERISK")).toMatchObject({
        attempts: 0,
        best_final_quiz_score: null,
        email: null,
        profile_match_count: 0,
      });
      expect(summaries.get("MODULE_TIE")).toMatchObject({
        attempts: 0,
        best_final_quiz_score: null,
        catalog_valid: false,
        email,
        last_attempt_at: null,
        profile_match_count: 1,
      });
      expect(summaries.get("QUIZ_TIE")).toMatchObject({
        attempts: 0,
        best_final_quiz_score: null,
        catalog_valid: false,
        email,
        last_attempt_at: null,
        profile_match_count: 1,
      });
    } finally {
      const deleted = await admin.auth.admin.deleteUser(created.data.user.id);
      if (deleted.error) throw deleted.error;
    }
  });
});
