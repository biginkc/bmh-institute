import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Round-6 Codex review of PR #130, finding 3: the oral-check pilot's forward
// insertion computes prior_catalog_sha256 and replacement_catalog_sha256 via
// fn_course_import_catalog_sha256, which reads the WHOLE managed import graph
// (quizzes, questions, answer_options, assignments, role groups, access rows,
// program_courses) -- but the function only ever locked the subset of tables
// it writes to. A concurrent edit to any unlocked table between the two
// checksum reads corrupts the receipt: prior_catalog_sha256 records a state
// that was already stale, and the rollback (which pins itself to that receipt)
// can never satisfy its own restore assertion, permanently stranding the
// prepared rollback. The fix is to lock every table the checksum reads, in
// SHARE ROW EXCLUSIVE mode, before the first checksum read -- so the two reads
// and the insert observe one consistent, writer-excluded state that the
// receipt provably matches.
//
// This test derives the required table set from the real checksum function
// body rather than a hand-copied list, so extending
// fn_course_import_catalog_sha256 later fails here instead of silently
// reintroducing the race.

const CHECKSUM_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/032_exact_import_reconciliation.sql",
);
const FORWARD_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260728020000_insert_oral_check_pilot_role_play_blocks.sql",
);
const ROLLBACK_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260728030000_rollback_oral_check_pilot_role_play_blocks.sql",
);

function readSql(path: string): string {
  return readFileSync(path, "utf8");
}

// The exact body of the newest fn_course_import_catalog_sha256 definition.
function catalogChecksumFunctionBody(): string {
  const sql = readSql(CHECKSUM_MIGRATION_PATH);
  const start = sql.indexOf(
    "create or replace function public.fn_course_import_catalog_sha256(p_import_id text)",
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("as $$", start);
  expect(bodyStart).toBeGreaterThan(start);
  const bodyEnd = sql.indexOf("$$;", bodyStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return sql.slice(bodyStart, bodyEnd);
}

function tablesReadByCatalogChecksum(): string[] {
  const body = catalogChecksumFunctionBody();
  const names = new Set<string>();
  for (const match of body.matchAll(/\bpublic\.([a-z_]+)\b/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

// The single `lock table a, b, c in share row exclusive mode;` statement
// inside the named function, as an ordered list of bare table names.
function lockedTables(sql: string, functionName: string): string[] {
  const start = sql.indexOf(`create or replace function public.${functionName}()`);
  expect(start).toBeGreaterThanOrEqual(0);
  const lockStart = sql.indexOf("lock table", start);
  expect(lockStart).toBeGreaterThan(start);
  const lockEnd = sql.indexOf("in share row exclusive mode;", lockStart);
  expect(lockEnd).toBeGreaterThan(lockStart);
  return sql
    .slice(lockStart + "lock table".length, lockEnd)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      expect(entry.startsWith("public.")).toBe(true);
      return entry.slice("public.".length);
    });
}

describe("oral-check pilot catalog checksum lock coverage", () => {
  const readTables = tablesReadByCatalogChecksum();

  it("derives a non-trivial read set from the real checksum function", () => {
    // Sanity: if the extraction ever silently returns nothing, every coverage
    // assertion below would pass vacuously.
    expect(readTables.length).toBeGreaterThanOrEqual(10);
    expect(readTables).toContain("quizzes");
    expect(readTables).toContain("questions");
    expect(readTables).toContain("answer_options");
  });

  it("locks every table the forward insertion's checksum reads", () => {
    const locked = lockedTables(
      readSql(FORWARD_MIGRATION_PATH),
      "fn_insert_oral_check_pilot_role_play_blocks",
    );
    const missing = readTables.filter((table) => !locked.includes(table));
    expect(missing).toEqual([]);
  });

  it("locks every table the rollback's checksum reads", () => {
    const locked = lockedTables(
      readSql(ROLLBACK_MIGRATION_PATH),
      "fn_rollback_oral_check_pilot_role_play_blocks",
    );
    const missing = readTables.filter((table) => !locked.includes(table));
    expect(missing).toEqual([]);
  });

  it("acquires the shared locks in the same order in both directions", () => {
    // Two operations that lock an overlapping set in different orders can
    // deadlock against each other. The rollback locks a strict superset (it
    // adds the learner-activity tables), so the shared subset must appear in
    // the same relative order in both.
    const forward = lockedTables(
      readSql(FORWARD_MIGRATION_PATH),
      "fn_insert_oral_check_pilot_role_play_blocks",
    );
    const rollback = lockedTables(
      readSql(ROLLBACK_MIGRATION_PATH),
      "fn_rollback_oral_check_pilot_role_play_blocks",
    );
    expect(rollback.filter((table) => forward.includes(table))).toEqual(
      forward.filter((table) => rollback.includes(table)),
    );
  });

  it("takes the locks before the first checksum read in both directions", () => {
    for (const [path, functionName] of [
      [FORWARD_MIGRATION_PATH, "fn_insert_oral_check_pilot_role_play_blocks"],
      [ROLLBACK_MIGRATION_PATH, "fn_rollback_oral_check_pilot_role_play_blocks"],
    ] as const) {
      const sql = readSql(path);
      const start = sql.indexOf(`create or replace function public.${functionName}()`);
      const lockAt = sql.indexOf("lock table", start);
      const firstChecksumAt = sql.indexOf(
        "public.fn_course_import_catalog_sha256(v_import_id)",
        start,
      );
      expect(lockAt).toBeGreaterThan(start);
      expect(firstChecksumAt).toBeGreaterThan(lockAt);
    }
  });
});
