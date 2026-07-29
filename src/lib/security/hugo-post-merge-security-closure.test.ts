import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729141000_hugo_post_merge_security_closure.sql",
  ),
  "utf8",
);

describe("Hugo post-merge security closure", () => {
  it("puts the ACL baseline behind the mandatory public-table RLS boundary", () => {
    expect(migration).toContain(
      "alter table public.hugo_access_acl_baseline enable row level security",
    );
    expect(migration).toContain(
      "on public.hugo_access_acl_baseline\n  as restrictive",
    );
  });

  it("requires active Hugo access inside the privileged lesson-state RPC", () => {
    expect(migration).toContain(
      "'public.fn_learner_lesson_states_v1(uuid,uuid[])'::regprocedure",
    );
    expect(migration).toContain(
      "if not public.fn_hugo_access_is_active(v_actor_id) then",
    );
    expect(migration).toContain(
      "Learner lesson states require active Hugo access.",
    );
  });

  it("turns known final-owner trigger failures into bound terminal receipts", () => {
    expect(migration).toContain(
      "'public.hugo_apply_access(uuid,text,text,jsonb,text,timestamptz,text)'::regprocedure",
    );
    expect(migration).toContain("exception when check_violation then");
    expect(migration).toContain(
      "Cannot remove the final usable Institute owner.",
    );
    expect(migration).toContain(
      "Cannot remove the final usable Institute owner grant.",
    );
    expect(migration).toContain("public.fn_hugo_store_guard_failure");
    expect(migration).toContain("'final_owner_guard'");
  });

  it("is transactional, bounded, and fails closed if source definitions drift", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*\nbegin;/);
    expect(migration).toContain("set local lock_timeout = '10s'");
    expect(migration).toContain("source definition drifted");
    expect(migration.trimEnd()).toMatch(/commit;$/);
  });
});
