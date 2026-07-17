import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/025_final_runtime_security.sql"),
  "utf8",
);

describe("final runtime security migration", () => {
  it("limits learner profile updates to explicitly self-managed columns", () => {
    expect(sql).toMatch(/revoke update on public\.profiles from anon, authenticated/i);
    expect(sql).toMatch(
      /grant update \(full_name, avatar_url\) on public\.profiles to authenticated/i,
    );
    expect(sql).toMatch(/profiles_self_update[\s\S]*status = 'active'/i);
  });

  it("requires an active actor for user-state and catalog access", () => {
    expect(sql).toMatch(/function public\.fn_can_read_user_state[\s\S]*actor\.status = 'active'/i);
    expect(sql).toMatch(/function public\.fn_user_has_program_access[\s\S]*p\.is_published = true/i);
    expect(sql).toMatch(/function public\.fn_user_has_course_access[\s\S]*c\.is_published = true/i);
    expect(sql).toMatch(/function public\.fn_lesson_is_unlocked[\s\S]*fn_can_read_user_state\(p_user_id\)/i);
    for (const policy of [
      "submissions_self_insert",
      "submissions_self_read",
      "submissions_self_delete",
    ]) {
      expect(sql).toMatch(
        new RegExp(`${policy}[\\s\\S]*actor\\.status = 'active'`, "i"),
      );
    }
  });

  it("issues program certificates only through explicit active enrollment in a published program", () => {
    expect(sql).toMatch(
      /function public\.fn_issue_program_certificate_if_eligible[\s\S]*join public\.program_access/i,
    );
    expect(sql).toMatch(/learner\.status = 'active'[\s\S]*p\.is_published = true/i);
  });

  it("makes assignment decisions terminal and permits only one active outcome", () => {
    expect(sql).toMatch(
      /unique index[\s\S]*assignment_submissions[\s\S]*user_id, assignment_id[\s\S]*status in \('submitted', 'approved'\)/i,
    );
    expect(sql).toMatch(/old\.status <> 'submitted'[\s\S]*immutable/i);
    expect(sql).toMatch(/new\.status not in \('submitted', 'approved', 'needs_revision'\)/i);
  });
});
