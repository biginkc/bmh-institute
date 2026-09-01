import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260901015000_intranet_quiz_summary.sql",
);
const routePath = path.resolve(
  process.cwd(),
  "src/app/api/internal/intranet/learners/[email]/quiz-summary/route.ts",
);

function readCandidate(pathname: string): string {
  return fs.existsSync(pathname) ? fs.readFileSync(pathname, "utf8") : "";
}

describe("intranet quiz summary migration", () => {
  it("exposes one stable read function to service_role only", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain(
      "create or replace function public.fn_intranet_learner_quiz_summary_v1",
    );
    expect(sql).toMatch(/language sql\s+stable\s+security invoker/i);
    expect(sql).toMatch(
      /revoke all on function public\.fn_intranet_learner_quiz_summary_v1\(text, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_intranet_learner_quiz_summary_v1\(text, text\)[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(/\b(insert|update|delete|merge)\b/i);
  });

  it("uses equality so a literal asterisk cannot become an email wildcard", () => {
    const sql = readCandidate(migrationPath);
    const route = readCandidate(routePath);

    expect(sql).toContain("lower(profile.email) = lower(trim(p_email))");
    expect(`${route}\n${sql}`).not.toMatch(/\.ilike\s*\(|\bilike\b/i);
  });

  it("fails closed on duplicate profiles, courses, modules, or final lessons", () => {
    const sql = readCandidate(migrationPath);

    expect(sql).toContain("count(*)::bigint as profile_match_count");
    expect(sql).toContain("course_count = 1");
    expect(sql).toContain("top_module_count = 1");
    expect(sql).toContain("final_lesson_count = 1");
    expect(sql).toContain("course.content_import_id = p_course_import_id");
  });

  it("computes count, best score, and latest completion in one statement snapshot", () => {
    const sql = readCandidate(migrationPath);
    const route = readCandidate(routePath);

    expect(route).toContain('supabase.rpc(');
    expect(route).not.toContain('.from("user_quiz_attempts")');
    expect(sql).toContain("count(attempt.id)::bigint as attempts");
    expect(sql).toContain("max(attempt.score)::integer as best_final_quiz_score");
    expect(sql).toContain("max(attempt.completed_at) as last_attempt_at");
    expect(sql).toContain("attempt.lesson_id = final_state.lesson_id");
    expect(sql).toContain("attempt.quiz_id = final_state.quiz_id");
  });

  it("resolves one unique terminal module before its unique terminal quiz", () => {
    const sql = readCandidate(migrationPath);
    const courseModulesAt = sql.indexOf("course_modules as");
    const moduleStateAt = sql.indexOf("top_module_state as");
    const quizLessonsAt = sql.indexOf("quiz_lessons as");
    const lessonOrderAt = sql.indexOf("top_lesson_order as");

    expect(courseModulesAt).toBeGreaterThan(-1);
    expect(moduleStateAt).toBeGreaterThan(courseModulesAt);
    expect(quizLessonsAt).toBeGreaterThan(moduleStateAt);
    expect(lessonOrderAt).toBeGreaterThan(quizLessonsAt);
    expect(sql).toContain("from public.modules module");
    expect(sql).toContain("top_module_count = 1");
    expect(sql).toContain("lesson.module_id = top_module_state.module_id");
    expect(sql).toContain("quiz_lesson.module_id = top_module_state.module_id");
    expect(sql).toContain("final_lesson_count = 1");
  });
});
