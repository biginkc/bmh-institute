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
});
