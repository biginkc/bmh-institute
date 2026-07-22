import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/034_import_release_and_fixture_dependency_guards.sql",
  ),
  "utf8",
);
const acceptanceSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/tests/034_import_release_and_fixture_dependency_guards.sql",
  ),
  "utf8",
);
const providerIntegration = readFileSync(
  resolve(process.cwd(), "src/lib/security/import-release-control.integration.test.ts"),
  "utf8",
);
const migrateWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/db-migrate-test.yml"),
  "utf8",
);

describe("final import release and fixture dependency guards", () => {
  it("registers later activity tables as dependency-only cleanup surfaces", () => {
    expect(migration).toMatch(
      /sandra_course_completion_deliveries[\s\S]*array\['id'\]::text\[\][\s\S]*0/i,
    );
    expect(migration).toMatch(
      /user_video_completion_history[\s\S]*array\['user_id', 'block_id', 'asset_version'\]::text\[\][\s\S]*0/i,
    );
    expect(migration).toMatch(
      /sandra_course_completion_deliveries'[\s\S]*'course_id'[\s\S]*'courses'[\s\S]*'scalar'/i,
    );
    expect(migration).toMatch(
      /user_video_completion_history'[\s\S]*'block_id'[\s\S]*'content_blocks'[\s\S]*'scalar'/i,
    );
  });

  it("serializes release, apply, and rollback without a row-before-table lock upgrade", () => {
    const releaseBody = migration.match(
      /create function public\.fn_release_course_import_v1[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    const applyBody = migration.match(
      /create or replace function public\.fn_apply_course_import[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    const rollbackBody = migration.match(
      /create or replace function public\.fn_rollback_course_import[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";

    for (const body of [releaseBody, applyBody, rollbackBody]) {
      expect(body).toMatch(
        /pg_advisory_xact_lock[\s\S]*course-import-catalog-mutation/i,
      );
    }
    for (const body of [applyBody, rollbackBody]) {
      expect(body).toMatch(
        /course-import-catalog-mutation[\s\S]*course-import-release:/i,
      );
      expect(body).not.toMatch(/\bfor\s+update\b/i);
      expect(body).not.toMatch(/lock table[\s\S]*public\.programs/i);
      expect(body).toMatch(
        /content_import_release_records[\s\S]*release\.import_id = p_import_id[\s\S]*released imports are immutable/i,
      );
      expect(body).toMatch(
        /program\.content_import_id = p_import_id and program\.is_published[\s\S]*course\.content_import_id = p_import_id and course\.is_published[\s\S]*published imports are immutable/i,
      );
    }

    const applyGlobalLock = applyBody.indexOf("course-import-catalog-mutation");
    const applyImportLock = applyBody.indexOf("course-import-release:");
    const applyImmutableCheck = applyBody.indexOf("released imports are immutable");
    const applyDelegate = applyBody.indexOf(
      "private.fn_apply_course_import_v023_without_insert_guard",
    );
    expect(applyGlobalLock).toBeGreaterThan(-1);
    expect(applyImportLock).toBeGreaterThan(applyGlobalLock);
    expect(applyImmutableCheck).toBeGreaterThan(applyImportLock);
    expect(applyDelegate).toBeGreaterThan(applyImmutableCheck);

    const rollbackGlobalLock = rollbackBody.indexOf("course-import-catalog-mutation");
    const rollbackImportLock = rollbackBody.indexOf("course-import-release:");
    const rollbackImmutableCheck = rollbackBody.indexOf("released imports are immutable");
    const rollbackActivityLock = rollbackBody.indexOf("lock table");
    const rollbackDelegate = rollbackBody.lastIndexOf(
      "private.fn_rollback_course_import_v019_without_video_history_guard",
    );
    expect(rollbackGlobalLock).toBeGreaterThan(-1);
    expect(rollbackImportLock).toBeGreaterThan(rollbackGlobalLock);
    expect(rollbackImmutableCheck).toBeGreaterThan(rollbackImportLock);
    expect(rollbackActivityLock).toBeGreaterThan(rollbackImmutableCheck);
    expect(rollbackDelegate).toBeGreaterThan(rollbackActivityLock);
    expect(rollbackBody.slice(rollbackActivityLock, rollbackDelegate)).toMatch(
      /public\.user_video_progress,[\s\S]*public\.user_video_completion_history,[\s\S]*public\.user_block_progress,[\s\S]*public\.sandra_course_completion_deliveries/i,
    );

    expect(migration).toMatch(
      /alter function public\.fn_release_course_import_v1[\s\S]*set schema private[\s\S]*rename to fn_release_course_import_v027_without_global_mutation_lock/i,
    );
    expect(migration).toMatch(
      /revoke all on function[\s\S]*fn_release_course_import_v027_without_global_mutation_lock[\s\S]*from public, anon, authenticated, service_role/i,
    );
  });

  it("checks rollback immutability before every malformed-payload delegate", () => {
    const rollbackBody = migration.match(
      /create or replace function public\.fn_rollback_course_import[\s\S]*?\n\$\$;/i,
    )?.[0] ?? "";
    const immutableCheck = rollbackBody.indexOf("released imports are immutable");
    const payloadBranch = rollbackBody.indexOf("if p_owned is null");
    const delegate = rollbackBody.indexOf(
      "private.fn_rollback_course_import_v019_without_video_history_guard",
    );
    expect(immutableCheck).toBeGreaterThan(-1);
    expect(payloadBranch).toBeGreaterThan(immutableCheck);
    expect(delegate).toBeGreaterThan(payloadBranch);
  });

  it("preserves the final rollback evidence checks and service-only grants", () => {
    expect(migration).toMatch(
      /fn_rollback_course_import[\s\S]*user_video_completion_history[\s\S]*sandra_course_completion_deliveries[\s\S]*fn_rollback_course_import_v019_without_video_history_guard/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_apply_course_import\(text, jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.fn_apply_course_import\(text, jsonb\)[\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_rollback_course_import\(text, jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.fn_rollback_course_import\(text, jsonb\)[\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.fn_release_course_import_v1\(text, uuid, uuid, jsonb, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.fn_release_course_import_v1\(text, uuid, uuid, jsonb, text\)[\s\S]*to service_role/i,
    );
  });

  it("executes a successful and idempotent public release in rolled-back SQL acceptance", () => {
    expect(acceptanceSql).toMatch(
      /fn_course_import_catalog_sha256[\s\S]*fn_release_course_import_v1[\s\S]*status' <> 'released'[\s\S]*fn_release_course_import_v1[\s\S]*status' <> 'already_released'/i,
    );
    expect(acceptanceSql).toMatch(
      /content_import_release_records[\s\S]*is_published and certificate_enabled[\s\S]*is_published and not certificate_enabled[\s\S]*count\(\*\)[\s\S]*program_access/i,
    );
    expect(acceptanceSql.trimEnd()).toMatch(/rollback;$/i);
  });

  it("checks live wrapper and private-helper privileges in Postgres", () => {
    for (const signature of [
      "public.fn_apply_course_import(text, jsonb)",
      "public.fn_rollback_course_import(text, jsonb)",
      "public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)",
    ]) {
      expect(acceptanceSql).toContain(`not has_function_privilege(\n    'service_role',\n    '${signature}',`);
    }
    for (const signature of [
      "private.fn_apply_course_import_v023_without_insert_guard(text, jsonb)",
      "private.fn_rollback_course_import_v019_without_video_history_guard(text, jsonb)",
      "private.fn_release_course_import_v027_without_global_mutation_lock(text, uuid, uuid, jsonb, text)",
    ]) {
      expect(acceptanceSql).toContain(`has_function_privilege(\n    'service_role',\n    '${signature}',`);
    }
  });

  it("requires a database-observed contention barrier in hosted acceptance", () => {
    expect(providerIntegration).toMatch(
      /lock table public\.programs in row exclusive mode[\s\S]*WRITER_LOCKED[\s\S]*pg_advisory_xact_lock/i,
    );
    expect(providerIntegration).toMatch(
      /pg_catalog\.pg_locks[\s\S]*pg_catalog\.pg_blocking_pids\(blocked\.pid\)/i,
    );
    expect(providerIntegration).toMatch(
      /pg_advisory_unlock[\s\S]*Promise\.all\(\[\s*waitForPsqlExit\(barrier\),\s*waitForPsqlExit\(writer\),\s*replay,?\s*\]\)/i,
    );
    expect(migrateWorkflow).toMatch(
      /TEST_SUPABASE_DB_URL=[\s\S]*npm run test:course-import-provider/i,
    );
  });
});
