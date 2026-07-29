import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Round-4 Codex review, finding 1: fn_insert_oral_check_pilot_role_play_blocks()
// must never be self-invoked before the rollback capability is guaranteed to
// exist, because Supabase applies each migration file as its own
// transactional batch -- a self-invoking insert could commit the 3 live
// required blocks before a later migration installing the rollback capability
// ever ran. This is a static/structural check (it reads real, unmodified
// migration file text and filenames, no database needed) that complements
// supabase/tests/058_oral_check_pilot_apply_ordering_gate.sql's behavioral
// rehearsal of the same guarantee against a live database.
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const INSERT_MIGRATION = "20260728020000_insert_oral_check_pilot_role_play_blocks.sql";
const ROLLBACK_MIGRATION = "20260728030000_rollback_oral_check_pilot_role_play_blocks.sql";
const APPLY_MIGRATION = "20260728050000_apply_oral_check_pilot_role_play_blocks.sql";

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), "utf8");
}

describe("oral-check pilot migration ordering (PR #130 round-4 review, finding 1)", () => {
  it("the insert, rollback, and apply migrations all exist as separate files", () => {
    const files = new Set(readdirSync(MIGRATIONS_DIR));
    expect(files.has(INSERT_MIGRATION)).toBe(true);
    expect(files.has(ROLLBACK_MIGRATION)).toBe(true);
    expect(files.has(APPLY_MIGRATION)).toBe(true);
  });

  it("the insert migration installs fn_insert_oral_check_pilot_role_play_blocks() but never self-invokes it -- the live catalog mutation lives only in the later apply migration", () => {
    const sql = readMigration(INSERT_MIGRATION);
    expect(sql).toMatch(
      /create or replace function public\.fn_insert_oral_check_pilot_role_play_blocks\(\)/,
    );
    // The migration must not itself contain a `perform
    // public.fn_insert_oral_check_pilot_role_play_blocks()` call -- that
    // self-invocation was moved out to the apply migration specifically so
    // this file alone can never commit a live insertion.
    expect(sql).not.toMatch(
      /perform public\.fn_insert_oral_check_pilot_role_play_blocks\(\)/,
    );
  });

  it("the rollback capability migration sorts before the apply migration by filename", () => {
    // Migration application order is filename sort order (see
    // scripts/fixture-boundary/run-controller-gate-pr-harness.mjs and the
    // real Supabase CLI). The rollback migration must be guaranteed to have
    // already applied by the time the apply migration can run at all.
    expect(ROLLBACK_MIGRATION.localeCompare(APPLY_MIGRATION)).toBeLessThan(0);
    expect(INSERT_MIGRATION.localeCompare(ROLLBACK_MIGRATION)).toBeLessThan(0);
  });

  it("the apply migration asserts BOTH the rollback function and its evidence table exist before ever invoking the insert function", () => {
    const sql = readMigration(APPLY_MIGRATION);

    const rollbackFunctionCheckIndex = sql.indexOf(
      "to_regprocedure('public.fn_rollback_oral_check_pilot_role_play_blocks()')",
    );
    const rollbackTableCheckIndex = sql.indexOf(
      "to_regclass('public.content_import_oral_check_pilot_role_play_rollback_records')",
    );
    const insertInvocationIndex = sql.indexOf(
      "perform public.fn_insert_oral_check_pilot_role_play_blocks();",
    );

    expect(rollbackFunctionCheckIndex).toBeGreaterThan(-1);
    expect(rollbackTableCheckIndex).toBeGreaterThan(-1);
    expect(insertInvocationIndex).toBeGreaterThan(-1);

    // Both preflight checks must appear TEXTUALLY BEFORE the actual
    // invocation, and the migration must raise on failure (SQLSTATE 55000)
    // rather than proceeding.
    expect(rollbackFunctionCheckIndex).toBeLessThan(insertInvocationIndex);
    expect(rollbackTableCheckIndex).toBeLessThan(insertInvocationIndex);
    expect(sql).toMatch(/raise exception[\s\S]*rollback capability[\s\S]*using errcode = '55000'/);
  });

  it("the rollback migration makes no live catalog changes of its own (defines the capability only)", () => {
    const sql = readMigration(ROLLBACK_MIGRATION);
    expect(sql).toMatch(
      /create or replace function public\.fn_rollback_oral_check_pilot_role_play_blocks\(\)/,
    );
    expect(sql).not.toMatch(
      /perform public\.fn_rollback_oral_check_pilot_role_play_blocks\(\)/,
    );
  });

  it("the apply migration fails CLOSED on an unreleased catalog but stays replay-safe on a clean database (round-5 finding 1, as amended by round-6 finding 2)", () => {
    const sql = readMigration(APPLY_MIGRATION);
    // Round-5 replaced a silent no-op with an unconditional raise whenever
    // the release record was absent. Round-6 found that raise also aborts
    // every clean-database replay of the migration history (supabase db
    // reset, CI, a fresh preview or test project), since a clean database
    // has no release record by definition. The migration now separates the
    // two: it raises when this database HOLDS the catalog without a
    // release, and skips with a NOTICE only when there is no catalog here
    // at all.
    expect(sql).toMatch(
      /select exists \([\s\S]*public\.programs where content_import_id = v_import_id[\s\S]*public\.courses where content_import_id = v_import_id[\s\S]*public\.lessons where content_import_id = v_import_id[\s\S]*\) into v_has_catalog/,
    );
    expect(sql).toMatch(
      /if v_has_catalog then\s*\n\s*raise exception[\s\S]*using errcode = '55000'/,
    );
    // The clean-database path must be an explicit, announced skip that
    // returns before any invocation -- never a fallthrough.
    expect(sql).toMatch(/raise notice 'Oral-check pilot forward apply skipped/);

    const catalogCheckIndex = sql.indexOf("into v_has_catalog");
    const unreleasedRaiseIndex = sql.indexOf("if v_has_catalog then");
    const skipReturnIndex = sql.indexOf(
      "raise notice 'Oral-check pilot forward apply skipped",
    );
    const insertInvocationIndex = sql.indexOf(
      "perform public.fn_insert_oral_check_pilot_role_play_blocks();",
    );
    expect(catalogCheckIndex).toBeGreaterThan(-1);
    expect(insertInvocationIndex).toBeGreaterThan(-1);
    expect(catalogCheckIndex).toBeLessThan(unreleasedRaiseIndex);
    expect(unreleasedRaiseIndex).toBeLessThan(skipReturnIndex);
    expect(skipReturnIndex).toBeLessThan(insertInvocationIndex);
    // The skip must return rather than fall through to the invocation.
    expect(sql.slice(skipReturnIndex, insertInvocationIndex)).toMatch(
      /\n\s*return;\n/,
    );
  });

  it("the apply migration is replayed in the controller-gate harness's normal migration sweep, with no special case (round-6 review, finding 2)", () => {
    const harnessSql = readFileSync(
      resolve(process.cwd(), "scripts/fixture-boundary/run-controller-gate-pr-harness.mjs"),
      "utf8",
    );
    // The round-5 version of the apply migration could not survive the
    // harness's fresh-cluster sweep, so the harness skipped it by name --
    // which meant the harness stopped replaying the real migration set the
    // way an actual environment does, hiding the breakage instead of
    // fixing it. The migration is replay-safe now, so that special case
    // must be gone: the sweep passing on a byte-fresh cluster is what
    // proves the replay safety.
    expect(harnessSql).not.toMatch(
      /migration === "20260728050000_apply_oral_check_pilot_role_play_blocks\.sql"/,
    );
  });

  it("the insertion function itself (not just the apply wrapper) asserts the rollback capability exists before mutating the catalog -- closes the direct-RPC bypass (round-5 review, finding 2)", () => {
    const sql = readMigration(INSERT_MIGRATION);
    const rollbackFunctionCheckIndex = sql.indexOf(
      "to_regprocedure('public.fn_rollback_oral_check_pilot_role_play_blocks()')",
    );
    const rollbackTableCheckIndex = sql.indexOf(
      "to_regclass('public.content_import_oral_check_pilot_role_play_rollback_records')",
    );
    // Must appear inside fn_insert_oral_check_pilot_role_play_blocks()'s own
    // body -- i.e. after that function's `create or replace function`
    // header, not merely somewhere in the file (e.g. only in the trigger
    // guard higher up).
    const functionHeaderIndex = sql.indexOf(
      "create or replace function public.fn_insert_oral_check_pilot_role_play_blocks()",
    );
    expect(functionHeaderIndex).toBeGreaterThan(-1);
    expect(rollbackFunctionCheckIndex).toBeGreaterThan(functionHeaderIndex);
    expect(rollbackTableCheckIndex).toBeGreaterThan(functionHeaderIndex);
  });

  it("EXECUTE on the insertion function is deliberately NOT granted to service_role until the rollback migration installs it (defense in depth)", () => {
    const insertSql = readMigration(INSERT_MIGRATION);
    const rollbackSql = readMigration(ROLLBACK_MIGRATION);
    expect(insertSql).toMatch(
      /revoke all on function public\.fn_insert_oral_check_pilot_role_play_blocks\(\)\s*\n\s*from public, anon, authenticated, service_role;/,
    );
    expect(insertSql).not.toMatch(
      /grant execute on function public\.fn_insert_oral_check_pilot_role_play_blocks\(\)/,
    );
    expect(rollbackSql).toMatch(
      /grant execute on function public\.fn_insert_oral_check_pilot_role_play_blocks\(\)\s*\n\s*to service_role;/,
    );
  });

  it("the rollback function sets its own function-level lock_timeout -- the migration-level SET only covers the installation session, not a later incident invocation (round-5 review, finding 3)", () => {
    const sql = readMigration(ROLLBACK_MIGRATION);
    const functionHeaderIndex = sql.indexOf(
      "create or replace function public.fn_rollback_oral_check_pilot_role_play_blocks()",
    );
    const functionLockTimeoutIndex = sql.indexOf(
      "set lock_timeout = '10s'",
      functionHeaderIndex,
    );
    const bodyStartIndex = sql.indexOf("as $$", functionHeaderIndex);
    expect(functionHeaderIndex).toBeGreaterThan(-1);
    expect(functionLockTimeoutIndex).toBeGreaterThan(functionHeaderIndex);
    expect(bodyStartIndex).toBeGreaterThan(-1);
    expect(functionLockTimeoutIndex).toBeLessThan(bodyStartIndex);
  });
});
