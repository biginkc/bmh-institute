import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Executable coverage for `supabase/migrations/20260730260000_forward_security_boundaries.sql`'s
 * drift guards — the SQL that this migration exists to protect: the
 * `is_admin` body/volatility/ACL pin, the `content_blocks` trigger
 * `tgqual IS NULL` check, and `bmh_authored_content_is_safe`'s video-source
 * NULL handling.
 *
 * `authored-content-security-migration.test.ts` only regex-matches the SQL
 * text of the *historical* migration — it can't catch a regression in a
 * guard's actual runtime behavior, and it doesn't cover this (forward)
 * migration at all. This file instead extracts the exact guard SQL from
 * the real migration file at test time (never a hand-copied duplicate that
 * could silently drift from what's actually shipped) and runs it against a
 * disposable local Postgres cluster, proving each guard both REFUSES the
 * drift case it exists to catch and ACCEPTS the legitimate case.
 *
 * Host-only, like `scripts/migration-rehearsal/`: needs `pg_config`,
 * `initdb`, `pg_ctl`, and `psql` on PATH. Skips cleanly (not a failure)
 * when they're unavailable rather than breaking commits on machines
 * without local Postgres tooling.
 *
 * Known flake (see MEMORY.md): a fresh local cluster fails "postmaster
 * became multithreaded" without `LC_ALL=C`, and the Unix socket path must
 * stay under 103 bytes — hence the short `/tmp/...` socket dir below
 * rather than a nested project-scratch path.
 */

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260730260000_forward_security_boundaries.sql",
);
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

function extractBetween(startMarker: string, endMarker: string, label: string): string {
  const start = migrationSql.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker not found in migration file`);
  const end = migrationSql.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label}: end marker not found in migration file`);
  return migrationSql.slice(start, end).trimEnd();
}

function extractBlock(startMarker: string, label: string): string {
  const start = migrationSql.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker not found in migration file`);
  const end = migrationSql.indexOf("\n$$;\n", start);
  if (end < 0) throw new Error(`${label}: end marker not found in migration file`);
  return migrationSql.slice(start, end + 4).trimEnd();
}

// The baseline-relations/RLS/is_admin/ACL/four-function-fingerprint DO block.
const BASELINE_GATES_SQL = extractBetween(
  "do $$\ndeclare\n  v_table text;",
  "\ncreate or replace function public.fn_admin_preview_deletion_v1",
  "BASELINE_GATES_SQL",
);

// The content_blocks trigger-ownership DO block (creates the trigger if
// absent, refuses if a same-name trigger exists with a foreign definition).
const TRIGGER_GATE_SQL = extractBlock(
  "do $$\ndeclare\n  v_trigger record;",
  "TRIGGER_GATE_SQL",
);

// The self-contained bmh_authored_content_is_safe(text, jsonb) function —
// no table dependencies, so it can be loaded and called directly.
const AUTHORED_CONTENT_SAFE_FN_SQL = extractBlock(
  "create or replace function public.bmh_authored_content_is_safe",
  "AUTHORED_CONTENT_SAFE_FN_SQL",
);

// bmh_validate_authored_content_trigger's real body — must be loaded
// exactly as shipped (not a hand-stubbed equivalent) so its md5(prosrc)
// matches BASELINE_GATES_SQL's pinned expected_body_md5 for it; otherwise
// the v_fn fingerprint loop refuses it as "foreign" the moment it exists,
// which would make every baseline-gate test below fail for the wrong
// reason (a fixture mismatch, not real drift).
const VALIDATE_TRIGGER_FN_SQL = extractBlock(
  "create or replace function public.bmh_validate_authored_content_trigger",
  "VALIDATE_TRIGGER_FN_SQL",
);

let pgBindir: string | null = null;
try {
  pgBindir = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
} catch {
  pgBindir = null;
}

const CLUSTER_DIR = join(
  tmpdir(),
  `bmhi-fwsec-migration-test-${process.pid}-${Date.now()}`,
);
// Postgres refuses a Unix socket path over 103 bytes. tmpdir() nested paths
// can get close to that limit, so the socket lives at a short, fixed /tmp
// path instead of inside CLUSTER_DIR.
const SOCKET_DIR = `/tmp/bmhi-fwsec-sock-${process.pid}`;
const PORT = String(55300 + (process.pid % 700));

function binary(name: string): string {
  if (!pgBindir) throw new Error("pg_config --bindir unavailable");
  return join(pgBindir, name);
}

const PG_ENV = {
  ...process.env,
  LC_ALL: "C",
  LANG: "C",
};

function psql(sql: string, role = "postgres"): string {
  return execFileSync(
    binary("psql"),
    ["-h", SOCKET_DIR, "-p", PORT, "-U", role, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: PG_ENV, encoding: "utf8" },
  );
}

/** Runs `sql` and returns the thrown error's stderr text, or null if it didn't throw. */
function captureRefusal(sql: string, role = "postgres"): string | null {
  try {
    psql(sql, role);
    return null;
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr;
    return typeof stderr === "string" ? stderr : String(err);
  }
}

const BASE_SCHEMA_SQL = `
create role authenticated;
create role service_role;
create role anon;
create role delegate login;
create role canary;

create table public.courses (id uuid primary key);
create table public.programs (id uuid primary key);
create table public.modules (id uuid primary key);
create table public.lessons (id uuid primary key);
create table public.content_blocks (id uuid primary key, block_type text, content jsonb);
create table public.quizzes (id uuid primary key);
create table public.assignments (id uuid primary key);
create table public.questions (id uuid primary key);
create table public.answer_options (id uuid primary key);
create table public.role_groups (id uuid primary key);
create table public.program_access (id uuid primary key);
create table public.course_access (id uuid primary key);
create table public.user_role_groups (id uuid primary key);
create table public.user_lesson_completions (id uuid primary key);
create table public.assignment_submissions (id uuid primary key);
create table public.user_quiz_attempts (id uuid primary key);
create table public.user_block_progress (id uuid primary key);
create table public.user_video_progress (id uuid primary key);
create table public.role_play_results (id uuid primary key);
create table public.user_video_completion_history (id uuid primary key);
create table public.user_course_resume (id uuid primary key);

alter table public.content_blocks enable row level security;

create table public.profiles (id uuid primary key, system_role text);
create function public.fn_hugo_access_is_active(p_user_id uuid) returns boolean
language sql stable as $$ select true $$;

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.system_role in ('owner', 'admin')
      and public.fn_hugo_access_is_active(p.id)
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, postgres, service_role;
`;

// Legit is_admin body — must reproduce the migration's pinned
// md5(prosrc) = 8c24fdbe889abae1a40654566ea36041 exactly (verified against
// production, read-only, project dhvfsyteqsxagokoerrx).
const LEGIT_IS_ADMIN_SQL = `
create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.system_role in ('owner', 'admin')
      and public.fn_hugo_access_is_active(p.id)
  );
$$;
-- Full reset, not just "from public, delegate, canary": a WITH GRANT
-- OPTION or non-owner-grantor entry on authenticated/postgres/service_role
-- itself (the drift cases below) is a union with the legit grant, not
-- something a plain re-GRANT clears — it must be revoked explicitly.
revoke all on function public.is_admin(uuid) from public, authenticated, postgres, service_role, delegate, canary cascade;
grant execute on function public.is_admin(uuid) to authenticated, postgres, service_role;
`;

const LEGIT_TRIGGER_SQL = `
drop trigger if exists content_blocks_validate_authored_content on public.content_blocks;
create trigger content_blocks_validate_authored_content
  before insert or update of block_type, content on public.content_blocks
  for each row execute function public.bmh_validate_authored_content_trigger();
`;

describe.skipIf(pgBindir === null)(
  "forward security boundaries migration (20260730260000) — drift guards",
  () => {
    beforeAll(() => {
      mkdirSync(CLUSTER_DIR, { recursive: true });
      mkdirSync(SOCKET_DIR, { recursive: true });
      execFileSync(
        binary("initdb"),
        ["-D", CLUSTER_DIR, "-U", "postgres", "--auth=trust", "-E", "UTF8"],
        { env: PG_ENV, stdio: "ignore" },
      );
      execFileSync(
        binary("pg_ctl"),
        [
          "-D",
          CLUSTER_DIR,
          "-o",
          `-k ${SOCKET_DIR} -p ${PORT} -c listen_addresses=`,
          "-w",
          "start",
        ],
        { env: PG_ENV, stdio: "ignore" },
      );
      psql(BASE_SCHEMA_SQL);
      psql(AUTHORED_CONTENT_SAFE_FN_SQL);
      psql(VALIDATE_TRIGGER_FN_SQL);
    }, 30000);

    afterAll(() => {
      if (pgBindir === null) return;
      try {
        execFileSync(binary("pg_ctl"), ["-D", CLUSTER_DIR, "-m", "fast", "stop"], {
          env: PG_ENV,
          stdio: "ignore",
        });
      } catch {
        // best-effort teardown
      }
      rmSync(CLUSTER_DIR, { recursive: true, force: true });
      rmSync(SOCKET_DIR, { recursive: true, force: true });
    }, 15000);

    describe("is_admin baseline gate", () => {
      it("accepts the legitimate is_admin body/volatility/search_path/ACL", () => {
        psql(LEGIT_IS_ADMIN_SQL);
        expect(() => psql(BASELINE_GATES_SQL)).not.toThrow();
      });

      it("refuses a same-signature `select true` impostor body", () => {
        psql(LEGIT_IS_ADMIN_SQL);
        psql(`
          create or replace function public.is_admin(p_user_id uuid)
          returns boolean
          language sql
          stable
          security definer
          set search_path = public
          as $$ select true $$;
        `);
        const stderr = captureRefusal(BASELINE_GATES_SQL);
        expect(stderr).toMatch(/is_admin\(uuid\) definition\/security baseline mismatch/);
        // Restore for subsequent tests.
        psql(LEGIT_IS_ADMIN_SQL);
      });

      it("refuses an EXECUTE grant from a non-owner grantor (WITH GRANT OPTION delegate)", () => {
        psql(LEGIT_IS_ADMIN_SQL);
        psql("grant execute on function public.is_admin(uuid) to delegate with grant option;");
        psql("grant execute on function public.is_admin(uuid) to canary;", "delegate");
        const stderr = captureRefusal(BASELINE_GATES_SQL);
        expect(stderr).toMatch(/is_admin\(uuid\) ACL baseline mismatch/);
        // Restore: revoking cascades the delegate's downstream grant to canary too.
        psql("revoke all on function public.is_admin(uuid) from delegate, canary cascade;");
        psql(LEGIT_IS_ADMIN_SQL);
      });

      it("refuses a WITH GRANT OPTION entry even to an already-expected grantee", () => {
        psql(LEGIT_IS_ADMIN_SQL);
        psql("grant execute on function public.is_admin(uuid) to authenticated with grant option;");
        const stderr = captureRefusal(BASELINE_GATES_SQL);
        expect(stderr).toMatch(/is_admin\(uuid\) ACL baseline mismatch/);
        psql(LEGIT_IS_ADMIN_SQL);
      });

      it("accepts the legitimate state again after each drift case is reverted", () => {
        expect(() => psql(BASELINE_GATES_SQL)).not.toThrow();
      });
    });

    describe("content_blocks trigger-ownership gate", () => {
      it("creates the trigger when none exists, then accepts it on rerun", () => {
        psql("drop trigger if exists content_blocks_validate_authored_content on public.content_blocks;");
        expect(() => psql(TRIGGER_GATE_SQL)).not.toThrow();
        expect(() => psql(TRIGGER_GATE_SQL)).not.toThrow();
      });

      it("refuses a same-name trigger neutered with WHEN (false)", () => {
        psql(LEGIT_TRIGGER_SQL);
        psql(`
          drop trigger content_blocks_validate_authored_content on public.content_blocks;
          create trigger content_blocks_validate_authored_content
            before insert or update of block_type, content on public.content_blocks
            for each row when (false) execute function public.bmh_validate_authored_content_trigger();
        `);
        const stderr = captureRefusal(TRIGGER_GATE_SQL);
        expect(stderr).toMatch(/foreign trigger definition/);
        // Restore for subsequent tests.
        psql(LEGIT_TRIGGER_SQL);
      });

      it("accepts the legitimate trigger again after the WHEN(false) case is reverted", () => {
        expect(() => psql(TRIGGER_GATE_SQL)).not.toThrow();
      });
    });

    describe("bmh_authored_content_is_safe — video source validation", () => {
      function isSafe(blockType: string, content: object): boolean {
        const out = psql(
          `select public.bmh_authored_content_is_safe('${blockType}', '${JSON.stringify(content).replace(/'/g, "''")}'::jsonb);`,
        );
        return out.trim().split("\n").slice(2)[0]?.trim() === "t";
      }

      it("refuses a javascript: scheme when source is missing (NULL-source bypass)", () => {
        expect(isSafe("video", { url: "javascript:alert(1)" })).toBe(false);
      });

      it("accepts a plain https URL from an unlisted source", () => {
        expect(isSafe("video", { url: "https://example-cdn.com/v.mp4" })).toBe(true);
      });

      it("accepts legitimate youtube/vimeo/loom sources", () => {
        expect(
          isSafe("video", { url: "https://www.youtube.com/watch?v=abc", source: "youtube" }),
        ).toBe(true);
        expect(isSafe("video", { url: "https://vimeo.com/123", source: "vimeo" })).toBe(true);
        expect(isSafe("video", { url: "https://loom.com/share/abc", source: "loom" })).toBe(true);
      });

      it("refuses a source claiming youtube with a non-matching URL", () => {
        expect(
          isSafe("video", { url: "https://not-youtube.example.com/x", source: "youtube" }),
        ).toBe(false);
      });

      it("accepts content with no url at all", () => {
        expect(isSafe("video", {})).toBe(true);
      });
    });
  },
);
