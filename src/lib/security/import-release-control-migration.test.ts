import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = [
  "027_import_release_control.sql",
  "029_import_release_access_hardening.sql",
  "030_import_release_idempotent_apply.sql",
]
  .map((name) =>
    readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8"),
  )
  .join("\n");

describe("migration 027 imported catalog release control", () => {
  it("blocks generic publication and additional unreleased role-group access", () => {
    expect(sql).toMatch(
      /create trigger programs_guard_imported_publication[\s\S]*before insert or update of is_published/i,
    );
    expect(sql).toMatch(
      /create trigger courses_guard_imported_publication[\s\S]*before insert or update of is_published/i,
    );
    expect(sql).toMatch(
      /Unreleased imported catalog access is limited to its QA role group/i,
    );
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) = 'service_role'/i);
    expect(sql).toMatch(/Only the service-role importer may create the first, QA-only access row/i);
    expect(sql).toMatch(/exact service-role replay of the already-recorded QA access row/i);
    expect(sql).toMatch(/create trigger course_access_guard_unreleased_import/i);
    expect(sql).toMatch(/Unreleased imported courses must have zero direct access grants/i);
    expect(sql).toMatch(/'course_access'[\s\S]*jsonb_agg/i);
  });

  it("records immutable checksum-bound evidence for every required release gate", () => {
    expect(sql).toMatch(/create table public\.content_import_release_records/i);
    expect(sql).toMatch(/Content import release records are immutable/i);
    for (const gate of [
      "manifest",
      "reconciliation",
      "rollback_rehearsal",
      "chrome_desktop",
      "chrome_mobile",
      "admin_happy_path",
      "jarrad_approval",
    ]) {
      expect(sql).toContain(`'${gate}'`);
    }
    expect(sql).toMatch(/manifest_sha256[\s\S]*reconciliation_sha256[\s\S]*catalog_sha256/i);
    expect(sql).toMatch(/approved_by text not null check \(approved_by = 'Jarrad Henry'\)/i);
  });

  it("keeps release service-only, atomic, and certificate-scoped", () => {
    expect(sql).toMatch(/function public\.fn_release_course_import_v1/i);
    expect(sql).toMatch(/Course import release requires the service role/i);
    expect(sql).toMatch(
      /revoke all on function public\.fn_release_course_import_v1[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/set is_published = true, certificate_enabled = false[\s\S]*where content_import_id = p_import_id/i);
    expect(sql).toMatch(/set is_published = true, certificate_enabled = true[\s\S]*where id = p_program_id/i);
    expect(sql).toMatch(/insert into public\.program_access[\s\S]*p_employee_role_group_id/i);
  });

  it("does not add fixture-cleanup-blocking foreign keys to the audit record", () => {
    const releaseTable = sql.match(
      /create table public\.content_import_release_records \(([\s\S]*?)\n\);/i,
    )?.[1];
    expect(releaseTable).toBeTruthy();
    expect(releaseTable).not.toMatch(/references public\./i);
  });
});
