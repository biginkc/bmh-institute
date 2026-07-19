import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/037_protect_unreleased_import_qa_membership.sql",
  ),
  "utf8",
);

describe("unreleased import QA membership guard", () => {
  it("blocks generic user membership and invite assignment at the database boundary", () => {
    expect(migration).toMatch(
      /create trigger user_role_groups_guard_unreleased_import_qa[\s\S]*before insert or update of role_group_id[\s\S]*public\.user_role_groups/i,
    );
    expect(migration).toMatch(
      /create trigger invites_guard_unreleased_import_qa[\s\S]*before insert or update of role_group_ids[\s\S]*public\.invites/i,
    );
    expect(migration).toMatch(
      /content_import_id is not null[\s\S]*is_published = false[\s\S]*content_import_release_records/i,
    );
    expect(migration).toMatch(
      /unreleased imported catalog QA role group cannot be assigned/i,
    );
    expect(migration).toMatch(
      /create trigger program_access_guard_unreleased_import_qa[\s\S]*before insert or update of program_id, role_group_id[\s\S]*public\.program_access/i,
    );
    expect(migration).toMatch(
      /course-import-qa-membership:[\s\S]*pg_advisory_xact_lock/i,
    );
    expect(migration).toMatch(
      /already has user memberships[\s\S]*already has pending invites/i,
    );
  });

  it("keeps release service-only and rejects unexpected QA memberships and pending invites", () => {
    const releaseBody = migration.match(
      /create or replace function public\.fn_release_course_import_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";

    expect(releaseBody).toMatch(/auth\.role\(\)[\s\S]*service_role/i);
    expect(releaseBody).toMatch(
      /lock table[\s\S]*public\.user_role_groups[\s\S]*public\.invites/i,
    );
    expect(releaseBody).toMatch(
      /public\.user_role_groups[\s\S]*role_group_id = v_qa_role_group_id[\s\S]*unexpected QA role group memberships/i,
    );
    expect(releaseBody).toMatch(
      /public\.invites[\s\S]*accepted_at is null[\s\S]*role_group_ids[\s\S]*pending invites target the QA role group/i,
    );
    expect(releaseBody).toMatch(
      /private\.fn_release_course_import_v027_without_global_mutation_lock/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_release_course_import_v1\(text, uuid, uuid, jsonb, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.fn_release_course_import_v1\(text, uuid, uuid, jsonb, text\)[\s\S]*to service_role/i,
    );
  });
});
