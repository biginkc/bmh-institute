import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/043_set_based_admin_completion_report.sql",
  ),
  "utf8",
);

describe("set-based admin completion report migration", () => {
  it("keeps the admin and imported-catalog review boundaries fail closed", () => {
    expect(migration).toMatch(
      /coalesce\(auth\.role\(\), ''\) <> 'service_role'[\s\S]*public\.is_admin\(auth\.uid\(\)\)/,
    );
    expect(migration).toMatch(
      /fn_actor_may_access_catalog_entity_v1\(\s*auth\.uid\(\), 'lessons', lesson\.id\s*\)/,
    );
    expect(migration).toContain("using errcode = '42501'");
  });

  it("computes current content, quiz, and assignment state without a per-pair RPC", () => {
    expect(migration).toContain("lesson.lesson_type = 'content'");
    expect(migration).toContain("lesson.lesson_type = 'quiz'");
    expect(migration).toContain("lesson.lesson_type = 'assignment'");
    expect(migration).toContain("public.fn_video_asset_version(block.content)");
    expect(migration).toContain("attempt.passed = true");
    expect(migration).toContain("submission.status = 'approved'");
    expect(migration).not.toMatch(
      /select\s+public\.fn_lesson_is_complete\s*\(/i,
    );
  });

  it("preserves input bounds and exact cross-product rows", () => {
    expect(migration).toContain("cardinality(p_user_ids) > 500");
    expect(migration).toContain("cardinality(p_lesson_ids) > 500");
    expect(migration).toContain(
      "cardinality(p_user_ids)::bigint * cardinality(p_lesson_ids)::bigint > 5000",
    );
    expect(migration).toMatch(/cross join requested_lessons lesson/);
    expect(migration).toMatch(/coalesce\(state\.is_complete, false\)/);
  });
});
