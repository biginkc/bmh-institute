import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/046_reviewer_answer_option_reconciliation.sql",
  ),
  "utf8",
);

describe("reviewer answer option reconciliation migration", () => {
  it("tracks only reviewer-created options behind an inaccessible RLS table", () => {
    expect(migration).toMatch(
      /create table public\.course_import_reviewer_answer_options_v1[\s\S]*answer_option_id uuid primary key[\s\S]*references public\.answer_options\(id\) on delete cascade[\s\S]*program_id uuid not null references public\.programs\(id\) on delete cascade[\s\S]*reviewer_user_id uuid not null references public\.profiles\(id\) on delete restrict/i,
    );
    expect(migration).toMatch(
      /alter table public\.course_import_reviewer_answer_options_v1 enable row level security[\s\S]*revoke all on table public\.course_import_reviewer_answer_options_v1[\s\S]*public, anon, authenticated, service_role/i,
    );
  });

  it("permits only the exact authenticated reviewer option transaction", () => {
    const body = migration.match(
      /create function public\.fn_guard_imported_answer_option_insert_v046\(\)[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(body).toMatch(/auth\.role\(\)[\s\S]*= 'authenticated'/i);
    for (const marker of [
      "bmh.reviewer_option_create_import_id",
      "bmh.reviewer_option_create_program_id",
      "bmh.reviewer_option_create_user_id",
      "bmh.reviewer_option_create_lesson_id",
      "bmh.reviewer_option_create_question_id",
      "bmh.reviewer_option_create_option_id",
    ]) {
      expect(body).toContain(marker);
    }
    expect(body).toMatch(/new\.question_id::text = v_reviewer_question_id/i);
    expect(body).toMatch(/new\.id::text = v_reviewer_option_id/i);
    expect(body).toMatch(/course_import_reviewers_v1 reviewer/i);
    expect(body).toMatch(/program\.is_published = false/i);
    expect(body).toMatch(/content_import_release_records/i);
    expect(migration).toMatch(
      /drop trigger if exists guard_imported_catalog_insert on public\.answer_options[\s\S]*before insert on public\.answer_options[\s\S]*fn_guard_imported_answer_option_insert_v046/i,
    );
  });

  it("binds the create RPC to one locked reviewer, program, import, question, and option", () => {
    const body = migration.match(
      /create or replace function public\.fn_create_answer_option_for_reviewer_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(body).toMatch(/pg_advisory_xact_lock[\s\S]*course-import-catalog-mutation/i);
    expect(body).toMatch(/cardinality\(v_program_ids\) <> 1/i);
    expect(body).toMatch(/cardinality\(v_import_ids\) <> 1/i);
    expect(body).toMatch(/course_import_reviewers_v1 reviewer/i);
    expect(body).toMatch(/content_import_release_records/i);
    expect(body).toMatch(/v_option_id uuid := gen_random_uuid\(\)/i);
    expect(body).toMatch(
      /if cardinality\(v_import_ids\) = 0 then[\s\S]*insert into public\.answer_options[\s\S]*return true/i,
    );
    expect(body).toMatch(
      /set_config\('bmh\.reviewer_option_create_option_id', v_option_id::text, true\)[\s\S]*insert into public\.answer_options[\s\S]*insert into public\.course_import_reviewer_answer_options_v1/i,
    );
  });

  it("removes exact tracked options during reviewer cleanup before access revocation", () => {
    const cleanup = migration.match(
      /create function private\.fn_cleanup_reviewer_evidence_v040[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(cleanup).toMatch(
      /set_config\('bmh\.reviewer_option_cleanup_import_id', p_import_id, true\)[\s\S]*delete from public\.answer_options option[\s\S]*course_import_reviewer_answer_options_v1 created[\s\S]*created\.reviewer_user_id = p_user_id/i,
    );
    expect(cleanup).toMatch(
      /delete from public\.answer_options[\s\S]*set_config\('bmh\.reviewer_option_cleanup_import_id', '', true\)/i,
    );
    expect(migration).toMatch(
      /alter function private\.fn_cleanup_reviewer_evidence_v040[\s\S]*rename to fn_cleanup_reviewer_evidence_v045_without_reviewer_options/i,
    );
  });

  it("rejects non-admin update callers before taking the global catalog lock", () => {
    const body = migration.match(
      /create function public\.fn_update_answer_option_for_reviewer_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(body).toMatch(
      /auth\.role\(\)[\s\S]*public\.is_admin\(auth\.uid\(\)\)[\s\S]*pg_advisory_xact_lock/i,
    );
  });

  it("keeps imported option deletion closed except for exact tracked cleanup", () => {
    const body = migration.match(
      /create function public\.fn_guard_imported_answer_option_delete_v046\(\)[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    expect(body).toContain("bmh.reviewer_option_cleanup_import_id");
    expect(body).toContain("bmh.reviewer_option_cleanup_user_id");
    expect(body).toMatch(/course_import_reviewer_answer_options_v1 created/i);
    expect(body).toMatch(/created\.answer_option_id = old\.id/i);
    expect(body).toMatch(/private\.fn_user_is_unreleased_import_reviewer_v1/i);
    expect(body).toMatch(/Imported catalog graph deletion requires the exact course-import rollback operation/i);
    expect(migration).toMatch(
      /drop trigger if exists guard_imported_catalog_delete on public\.answer_options[\s\S]*before delete on public\.answer_options[\s\S]*fn_guard_imported_answer_option_delete_v046/i,
    );
  });
});
