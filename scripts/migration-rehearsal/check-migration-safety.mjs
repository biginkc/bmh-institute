#!/usr/bin/env node
// Mandatory preflight gate for any `supabase db push --include-all` against a
// linked project (TEST or PRODUCTION).
//
// ---------------------------------------------------------------------------
// Why this exists (2026-07-30 production incident)
// ---------------------------------------------------------------------------
// An automated reconciliation loop treated "this migration version has no row
// in supabase_migrations.schema_migrations" as "this migration's content was
// never applied," and re-ran supabase/migrations/20260728091000_hugo_access_provisioner.sql
// directly against BMH Institute PRODUCTION, out of order, at 11:58:52 UTC.
// That file's body had long since been superseded by later hardening
// migrations. Re-applying it silently reverted 6 hardened Hugo provisioning
// functions and locked a real VA out for hours.
//
// The enabling mechanism is `supabase db push --include-all`: it re-applies
// every migration the remote history does not know about, oldest-first, in
// filename order, regardless of age and with no concept of supersession.
//
// ---------------------------------------------------------------------------
// The property this gate preserves
// ---------------------------------------------------------------------------
//   (a) No migration file older than the newest version already recorded in
//       remote history may be auto-applied. That is the exact shape of the
//       incident.
//   (b) A NEW, unacknowledged untrustworthy history row (a `migration repair`
//       placeholder with statements IS NULL) stops the push, WITHOUT letting a
//       historical repair freeze the repo forever. See "Placeholder baseline".
//   (c) Every indeterminate state fails CLOSED. If this script cannot prove the
//       push is safe, it exits non-zero. It never exits 0 on a shrug.
//   (d) The thing checked is the thing pushed: same directory, same file BYTES,
//       same database, same history. See "Checked == pushed" below.
//
// This script only inspects and reports. It never runs `supabase db push`,
// `supabase migration repair`, or any writing SQL itself. The SQL it issues is
// read-only (SELECT, plus a session-local `set statement_timeout`).
//
// ---------------------------------------------------------------------------
// SAFE BY DEFAULT (round-3 review findings P1-1 and P1-4)
// ---------------------------------------------------------------------------
// Earlier versions were permissive by default and hardened only when
// guarded-db-push.sh passed an opt-in flag, and they shipped an unbound
// `local-rehearsal` target whose null identity fields silently DISABLED every
// identity check -- a bypass committed into the guard's own configuration. Both
// are inverted now:
//
//   * Canonical enforcement is the DEFAULT. With no flags, the gate reads
//     exactly <repo>/supabase/migrations and <repo>/scripts/migration-rehearsal/
//     placeholder-baseline.json. `--repo-root`, `--migrations-dir` and
//     `--baseline` are REFUSED (E25) unless `--test-mode` is given.
//   * A null identity field NEVER opts out. project_ref, database and
//     db_system_identifier must all be present and non-null, or the run refuses
//     (E06), unless `--test-mode` is given.
//   * `--test-mode` exists only for this script's own harness. It relaxes the
//     two rules above and prints a loud banner. guarded-db-push.sh never passes
//     it and has no option that could, so an unbound target is structurally
//     unreachable from anything that can invoke `supabase db push`.
//   * The shipped baseline contains only fully-pinned real targets. There is no
//     unbound target to select.
//
// ---------------------------------------------------------------------------
// Checked == pushed (round-2 P1-1/P1-2/P1-3, round-3 P1-2/P1-3)
// ---------------------------------------------------------------------------
// A gate that inspects a different directory, different bytes, a different
// database, or an older history than the push touches is not a gate.
//
//   Directory. The migrations directory is the canonical repo path by default.
//   A symlinked migrations directory -- or a symlinked component of its path --
//   is refused (E24) in every mode, because lstat/realpath divergence is
//   precisely how "the gate read A, the push read B" happens. A symlinked
//   .sql ENTRY inside an otherwise-canonical directory is refused too (E32):
//   `entry.isFile()` is false for a symlink, so silently filtering on it would
//   drop the entry from the gate's set while `supabase db push` still reads
//   the pathname and follows the link, which is the exact "gate's set and
//   pushed set diverge" failure this whole section exists to prevent.
//
//   CONTENT. Version identity is not enough: swapping the SQL body of an
//   already-authorised version leaves remote history untouched, so a
//   version-level check passes while completely different SQL runs. The
//   fingerprint therefore records a sha256 of every local migration file's
//   BYTES, and that set is re-verified immediately before the push and again
//   during post-push reconciliation (E30).
//
//   Database. Project identity is parsed EXACTLY, never substring-matched: the
//   ref is extracted from PGUSER (`postgres.<ref>`) or PGHOST
//   (`db.<ref>.supabase.co`) by anchored pattern, both must agree when both are
//   present, PGDATABASE must equal the baseline's database, and the LIVE
//   connection is then interrogated -- `current_database()` must match and the
//   cluster must present the pinned pg_control_system() system_identifier.
//
//     Caveat, stated rather than overclaimed: system_identifier identifies a
//     CLUSTER LINEAGE, not a project. A physical restore or a byte-level clone
//     preserves it, and a logical branch of the same project gets a new one. So
//     the pin is a fail-closed operational signal -- it reliably catches "you
//     are pointed at a different database than the one this target was reviewed
//     against" -- and is not, on its own, complete proof of identity. It is one
//     of three independent bindings, not the only one.
//
//   History. `--emit-fingerprint` records a digest of the history the gate
//   approved; `--verify-fingerprint` re-reads history and refuses if it moved
//   (E26). guarded-db-push.sh verifies immediately before the push and
//   reconciles with `--verify-applied` immediately after it -- ALWAYS, including
//   when the push itself failed, so a partially-applied push is detected (E31)
//   rather than silently left in place.
//
//   Concurrency. guarded-db-push.sh holds a session-scoped PostgreSQL advisory
//   lock across gate, verify, push and reconcile, so two sanctioned wrappers
//   cannot interleave. That lock does NOT bind unguarded tools -- a raw
//   `supabase db push` or `migration repair` does not take it -- so the residual
//   window against unsanctioned callers remains, is measured by the harness, and
//   is covered after the fact by reconciliation. See guarded-db-push.sh.
//
// ---------------------------------------------------------------------------
// Exit-code contract, stated precisely
// ---------------------------------------------------------------------------
// This script has exactly ONE success fallthrough per mode (default check,
// --verify-fingerprint, --verify-applied); every other path, including the
// top-level catch, exits non-zero. Sibling scripts are not covered by that
// statement: guarded-db-push.sh has two success paths (dry run, real push) and
// print-production-repair-commands.sh exits 0 after printing.
//
// ---------------------------------------------------------------------------
// Placeholder baseline (design note -- read this before changing it)
// ---------------------------------------------------------------------------
// `supabase migration repair` writes rows with `statements IS NULL`. Such a row
// records "version X is considered applied" without recording what content was
// applied, so history stops being proof of what is live.
//
// The first version of this gate refused whenever ANY such row existed. That
// self-deadlocks: print-production-repair-commands.sh runs
// `migration repair --status applied` immediately before the gate, and BMH
// Institute production ALREADY carries 8 pre-existing placeholder rows (Sandra
// carries 36 of 127). A blanket refusal permanently blocks every migration --
// which in practice means the gate gets bypassed, which is worse than no gate.
//
// Chosen design: an explicit, human-committed acknowledged baseline, keyed by
// target, listing placeholder VERSIONS (never contents -- contents are exactly
// what a placeholder does not have).
//   - A placeholder row whose version IS in the baseline for --target is
//     accepted: a human already reconciled it against the live schema.
//   - A placeholder row whose version is NOT in the baseline REFUSES.
//   - Adding a version is a reviewable commit, not a runtime flag.
//
// BASELINE PROVENANCE (round-2 P1-4). Checking that the baseline path is an
// ordinary in-repo file does not prove the BYTES are the reviewed, tracked blob:
// a hardlink at an in-repo pathname shares an inode with a file anywhere on
// disk, an untracked file passes every filesystem check while never having been
// reviewed, and lstat-then-readFileSync is two steps over a mutable path with a
// swap window between them. So the working tree is never consulted for the
// bytes. The baseline is read straight out of git's content-addressed object
// store at the current commit (`git show HEAD:<path>`), which has no concept of
// inodes, hardlinks, or symlinks, and which fails outright for an untracked or
// merely-staged file. The read IS the check, in one bounded call. This mirrors
// the identical fix in Sandra's guard so the two do not diverge.
//
// ---------------------------------------------------------------------------
// Version comparison (design note)
// ---------------------------------------------------------------------------
// Both BMH Institute and Sandra mix two version schemes: legacy short numeric
// ("001".."052") and 14-digit timestamps ("20260728091000"). These are distinct
// namespaces, not one number line. Ordering rule: every legacy version sorts
// before every timestamp version; within a namespace, compare numerically as
// BigInt. Identity rule: two versions are the SAME migration when their
// namespace and their numeric value match, so remote "1" and local "001_x.sql"
// are the same migration.
//
// The Supabase CLI orders migrations by version STRING. If our namespace
// ordering ever disagrees with a plain string sort of the same version list, the
// gate cannot reason about the order the CLI will actually use, so it refuses.
//
// ---------------------------------------------------------------------------
// EXIT PATHS -- complete enumeration.
// ---------------------------------------------------------------------------
//   E00  exit 0  Safe. One success fallthrough per mode; nothing else exits 0.
//   E01  exit 1  Unrecognised / malformed command-line argument.
//   E02  exit 1  --target not supplied.
//   E03  exit 1  Missing PG* connection env var(s).
//   E04  exit 1  Baseline not readable from git HEAD: outside the repo,
//                untracked, staged-only, invalid JSON, git missing, git hung
//                (bounded timeout), or non-string output.
//   E05  exit 1  Baseline has the wrong shape, or --target has no entry in it.
//   E06  exit 1  Identity not satisfied: an identity field is null/absent
//                outside --test-mode, ref not parseable from PGUSER/PGHOST,
//                PGUSER and PGHOST disagree, ref mismatch, PGDATABASE mismatch.
//   E07  exit 1  Migrations directory missing, not a directory, or unreadable.
//   E08  exit 1  Migrations directory contains ZERO .sql files.
//   E09  exit 1  A migration filename does not start with a numeric version.
//   E10  exit 1  A local version string is malformed (non-numeric, or >14 digits).
//   E11  exit 1  Two local migration files normalise to the same version.
//   E12  exit 1  Local file ordering is ambiguous: namespace order disagrees with
//                the string order the Supabase CLI will push in.
//   E13  exit 1  psql binary not found on PATH.
//   E14  exit 1  psql connection or query failed.
//   E15  exit 1  psql timed out (connect, statement, or hard wall-clock kill).
//   E16  exit 1  psql returned output that is not the expected JSON payload.
//   E17  exit 1  schema_migrations returned ZERO rows.
//   E18  exit 1  A remote version string is malformed.
//   E19  exit 1  Two remote rows normalise to the same version.
//   E20  exit 1  Remote history ordering is ambiguous (as E12, for history).
//   E21  exit 1  Placeholder row(s) not in the acknowledged baseline.
//   E22  exit 1  Pending migration(s) OLDER than history's high-water mark --
//                the 2026-07-30 incident shape.
//   E23  exit 1  Any unexpected internal error (top-level catch). Fail closed.
//   E24  exit 1  Migrations directory, or a component of its path, is a symlink.
//   E25  exit 1  A path override (--repo-root / --migrations-dir / --baseline)
//                was used without --test-mode.
//   E26  exit 1  Remote history changed between the gate and the push.
//   E27  exit 1  Post-push reconciliation failed: unexpected or vanished rows,
//                or a new unacknowledged placeholder.
//   E28  exit 1  Live database identity probe failed, or the live cluster does
//                not present the pinned db_system_identifier / current_database.
//   E29  exit 1  Fingerprint file missing, unreadable, or malformed.
//   E30  exit 1  Local migration CONTENT changed since the fingerprint was taken
//                (added, removed, or byte-modified file).
//   E31  exit 1  Partial application: some but not all authorised migrations
//                landed. Production is altered and incomplete.
//   E32  exit 1  A migration filename in the canonical migrations directory is
//                a symlink.
//
// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------
//   PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... [PGSSLMODE=require] \
//     node scripts/migration-rehearsal/check-migration-safety.mjs \
//       --target=institute-production \
//       [--emit-fingerprint=PATH | --verify-fingerprint=PATH | --verify-applied=PATH] \
//       [--timeout-ms=20000]
//
// Test-harness only (never in CI, never in the runbook, never in the wrapper):
//       --test-mode --repo-root=... --migrations-dir=... --baseline=...
//
// Prefer scripts/migration-rehearsal/guarded-db-push.sh, which chains gate,
// verify, push and reconcile under one advisory lock and one connection.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// This file lives at <repo>/scripts/migration-rehearsal/, so the repo root is two
// levels up. Everything canonical is derived from here, never from cwd.
const REPO_ROOT = resolve(HERE, "../..");
const CANONICAL_MIGRATIONS_DIR = resolve(REPO_ROOT, "supabase/migrations");
const CANONICAL_BASELINE = resolve(HERE, "placeholder-baseline.json");
const GIT_TIMEOUT_MS = 10_000;
const PATH_OVERRIDE_ARGS = ["repo-root", "migrations-dir", "baseline"];
const KNOWN_ARGS = new Set([
  "target",
  "timeout-ms",
  "test-mode",
  "identity-only",
  "emit-fingerprint",
  "verify-fingerprint",
  "verify-applied",
  ...PATH_OVERRIDE_ARGS,
]);
const FLAG_ARGS = new Set(["test-mode", "identity-only"]);
const REQUIRED_PG_ENV = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"];
const SCHEME_RANK = { legacy: 0, timestamp: 1 };
// Supabase project refs are exactly 20 lowercase letters.
const PGUSER_REF = /^postgres\.([a-z]{20})$/;
const PGHOST_REF = /^db\.([a-z]{20})\.supabase\.co$/;

/** Refusal carrying the exit-path id from the enumeration above. */
class Refusal extends Error {
  constructor(code, lines) {
    super(Array.isArray(lines) ? lines[0] : lines);
    this.code = code;
    this.lines = Array.isArray(lines) ? lines : [lines];
  }
}

function refuse(code, lines) {
  throw new Refusal(code, lines);
}

// --- arguments -------------------------------------------------------------

function parseArguments(argv) {
  const map = {};
  for (const arg of argv) {
    const match = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(arg);
    if (!match) {
      refuse("E01", [
        `Unrecognised argument "${arg}".`,
        `Expected --name=value with name one of: ${[...KNOWN_ARGS].join(", ")}.`,
      ]);
    }
    if (!KNOWN_ARGS.has(match[1])) {
      refuse("E01", [`Unknown option "--${match[1]}".`, `Known options: ${[...KNOWN_ARGS].join(", ")}.`]);
    }
    if (FLAG_ARGS.has(match[1])) {
      map[match[1]] = true;
      continue;
    }
    if (match[2] === undefined || match[2].length === 0) {
      refuse("E01", [`Option "--${match[1]}" requires a non-empty value.`]);
    }
    map[match[1]] = match[2];
  }
  return map;
}

// --- versions --------------------------------------------------------------

function parseVersion(raw, origin) {
  const code = origin === "remote" ? "E18" : origin === "baseline" ? "E05" : "E10";
  const label = origin === "remote" ? "History" : origin === "baseline" ? "Baseline" : "Local";
  if (typeof raw !== "string" || raw.length === 0) {
    refuse(code, [`Empty ${origin} migration version. Refusing to guess its order.`]);
  }
  if (!/^\d+$/.test(raw)) {
    refuse(code, [
      `${label} migration version "${raw}" is not purely numeric.`,
      "Refusing to guess its chronological order.",
    ]);
  }
  if (raw.length > 14) {
    refuse(code, [
      `${label} migration version "${raw}" is longer than 14 digits.`,
      "This repo uses legacy short numeric versions and 14-digit timestamps only.",
      "Refusing to classify an unknown version scheme.",
    ]);
  }
  const scheme = raw.length === 14 ? "timestamp" : "legacy";
  const value = BigInt(raw);
  return { raw, scheme, value, id: `${scheme}:${value.toString()}` };
}

function compareVersions(a, b) {
  const rank = SCHEME_RANK[a.scheme] - SCHEME_RANK[b.scheme];
  if (rank !== 0) return rank < 0 ? -1 : 1;
  if (a.value < b.value) return -1;
  if (a.value > b.value) return 1;
  return 0;
}

function compareRaw(a, b) {
  if (a.raw < b.raw) return -1;
  if (a.raw > b.raw) return 1;
  return 0;
}

function assertOrderingIsUnambiguous(versions, label, code) {
  const byGate = [...versions].sort((a, b) => compareVersions(a, b) || compareRaw(a, b));
  const byString = [...versions].sort(compareRaw);
  for (let index = 0; index < byGate.length; index += 1) {
    if (byGate[index].raw !== byString[index].raw) {
      refuse(code, [
        `${label} ordering is ambiguous.`,
        "This gate orders legacy short-numeric versions before 14-digit timestamp versions,",
        "then numerically within each scheme. `supabase db push` orders by version STRING.",
        `Those two orders disagree here (gate: ${byGate[index].raw}, string: ${byString[index].raw}).`,
        "Refusing: the gate cannot predict the order the CLI will apply these in.",
      ]);
    }
  }
}

// --- baseline (read from git's object store, never from the working tree) ---

function gitRelativePath(candidate, repoRoot) {
  const resolved = resolve(candidate);
  const relativePath = relative(repoRoot, resolved);
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    refuse("E04", [
      `Baseline path "${resolved}" resolves outside the repository root "${repoRoot}".`,
      "Refusing: the baseline must be a file committed inside this repo.",
    ]);
  }
  return relativePath.split(sep).join("/");
}

/**
 * Reads the baseline out of git's content-addressed object store at the current
 * commit. The working tree is never consulted for the bytes, so a symlink,
 * hardlink, untracked file, or a swap between validate and open at that path is
 * structurally irrelevant. Bounded: a hung git must refuse, not hang the wrapper
 * (round-3 finding P1-6).
 */
function readGitTrackedBaseline(baselinePath, repoRoot) {
  const relativePath = gitRelativePath(baselinePath, repoRoot);
  let output;
  try {
    output = execFileSync("git", ["-C", repoRoot, "show", `HEAD:${relativePath}`], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const timedOut =
      error.code === "ETIMEDOUT" || error.signal === "SIGKILL" || error.signal === "SIGTERM";
    refuse("E04", [
      timedOut
        ? `git did not return the baseline "${relativePath}" within ${GIT_TIMEOUT_MS} ms and was killed.`
        : `Baseline "${relativePath}" could not be read from git HEAD in "${repoRoot}".`,
      "It must be COMMITTED at the current HEAD for this gate to treat it as reviewed.",
      "Untracked, merely staged, symlinked, hardlinked, or working-tree-only content is",
      "refused on purpose: the allowlist of acknowledged placeholder rows is the single",
      "highest-value thing to substitute, so it is read from git's object store, never",
      "from the filesystem. A hung or missing git is equally indeterminate, so it refuses.",
      stderr || `${error.code ?? error.name}: ${error.message}`,
    ]);
  }
  if (typeof output !== "string" || output.length === 0) {
    refuse("E04", [`git returned no usable content for baseline "${relativePath}". Refusing.`]);
  }
  return output;
}

function loadBaseline(baselinePath, repoRoot, target, testMode) {
  const text = readGitTrackedBaseline(baselinePath, repoRoot);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    refuse("E04", [`The baseline blob at ${baselinePath} is not valid JSON.`, error.message]);
  }
  if (parsed === null || typeof parsed !== "object" || typeof parsed.targets !== "object" || parsed.targets === null) {
    refuse("E05", [`The baseline at ${baselinePath} is malformed.`, 'Expected an object with a "targets" object.']);
  }
  if (!Object.hasOwn(parsed.targets, target)) {
    refuse("E05", [
      `No baseline entry for target "${target}" in ${baselinePath}.`,
      `Known targets: ${Object.keys(parsed.targets).join(", ") || "(none)"}.`,
      "Refusing: an unrecognised target is either a typo or an unreviewed new database.",
    ]);
  }
  const entry = parsed.targets[target];
  if (entry === null || typeof entry !== "object") {
    refuse("E05", [`Baseline entry for target "${target}" is not an object.`]);
  }
  for (const key of ["project_ref", "database", "db_system_identifier", "placeholder_versions"]) {
    if (!Object.hasOwn(entry, key)) {
      refuse("E05", [
        `Baseline entry for target "${target}" has no "${key}" key.`,
        "Every identity key must be present explicitly; an absent key would be an",
        "accidental opt-out.",
      ]);
    }
  }
  if (!Array.isArray(entry.placeholder_versions)) {
    refuse("E05", [
      `Baseline entry for target "${target}" has a non-array "placeholder_versions".`,
      "Use [] when the target legitimately has no placeholder rows.",
    ]);
  }

  // Round-3 P1-1: a null identity field must FAIL CLOSED, never opt out.
  if (!testMode) {
    const unbound = ["project_ref", "database", "db_system_identifier"].filter(
      (key) => entry[key] === null || entry[key] === undefined || entry[key] === "",
    );
    if (unbound.length > 0) {
      refuse("E06", [
        `Baseline target "${target}" leaves ${unbound.join(", ")} unbound.`,
        "Refusing: an unbound identity field does NOT disable the identity check, it fails",
        "closed. A target that cannot state which database it means must never be usable",
        "for a push. Unbound targets exist only for this script's own harness and are",
        "reachable only under --test-mode, which guarded-db-push.sh cannot pass.",
      ]);
    }
  }

  const acknowledged = new Map();
  for (const raw of entry.placeholder_versions) {
    if (typeof raw !== "string") {
      refuse("E05", [
        `Baseline entry for target "${target}" contains a non-string version ${JSON.stringify(raw)}.`,
        "Numeric literals lose leading zeros; versions must be quoted strings.",
      ]);
    }
    const version = parseVersion(raw, "baseline");
    if (acknowledged.has(version.id)) {
      refuse("E05", [
        `Baseline entry for target "${target}" lists version ${version.id} twice.`,
        "Refusing: an unvalidated control file is how a widened allowlist slips past review.",
      ]);
    }
    acknowledged.set(version.id, version);
  }
  return {
    projectRef: entry.project_ref ?? null,
    database: entry.database ?? null,
    systemIdentifier: entry.db_system_identifier ?? null,
    acknowledged,
    path: baselinePath,
  };
}

// --- declared connection identity (exact, never substring) -----------------

function assertConnectionEnvPresent() {
  const missing = REQUIRED_PG_ENV.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
  if (missing.length > 0) {
    refuse("E03", [
      `Missing required psql connection env var(s): ${missing.join(", ")}.`,
      "Export PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD (and PGSSLMODE for hosted",
      "projects) before running this gate. Refusing rather than connecting to a",
      "libpq default such as a local socket.",
    ]);
  }
}

function assertDeclaredIdentity(baseline, target) {
  const user = process.env.PGUSER ?? "";
  const host = process.env.PGHOST ?? "";
  const database = process.env.PGDATABASE ?? "";

  if (baseline.database !== null && database !== baseline.database) {
    refuse("E06", [`PGDATABASE is "${database}" but target "${target}" expects "${baseline.database}".`]);
  }
  if (baseline.projectRef === null) {
    return "UNBOUND (test mode only)";
  }
  if (typeof baseline.projectRef !== "string" || !/^[a-z]{20}$/.test(baseline.projectRef)) {
    refuse("E06", [`Baseline project_ref for target "${target}" is not a 20-lowercase-letter Supabase ref.`]);
  }

  const fromUser = PGUSER_REF.exec(user)?.[1] ?? null;
  const fromHost = PGHOST_REF.exec(host)?.[1] ?? null;
  if (fromUser === null && fromHost === null) {
    refuse("E06", [
      `Cannot parse a Supabase project ref from this connection for target "${target}".`,
      `PGUSER="${user}" must match postgres.<ref>, or PGHOST="${host}" must match db.<ref>.supabase.co.`,
      "Refusing: identity is parsed exactly, never inferred from a substring, so that a",
      "hostname or username that merely contains the ref cannot authorise a push.",
    ]);
  }
  if (fromUser !== null && fromHost !== null && fromUser !== fromHost) {
    refuse("E06", [`PGUSER declares project ref "${fromUser}" but PGHOST declares "${fromHost}". Refusing.`]);
  }
  const declared = fromUser ?? fromHost;
  if (declared !== baseline.projectRef) {
    refuse("E06", [
      `Connection declares project ref "${declared}" but target "${target}" expects "${baseline.projectRef}".`,
      "Refusing: running this gate against one database and pushing to another is the",
      "failure mode this binding exists to stop.",
    ]);
  }
  return `declared ref ${declared} (exact match)`;
}

// --- local migrations ------------------------------------------------------

function assertNoSymlinkInPath(target, repoRoot) {
  const rest = relative(repoRoot, target);
  const inside = rest !== "" && !rest.startsWith("..") && !isAbsolute(rest);
  const chain = [];
  if (inside) {
    let current = repoRoot;
    for (const part of rest.split(sep).filter(Boolean)) {
      current = resolve(current, part);
      chain.push(current);
    }
  } else {
    chain.push(target);
  }
  for (const candidate of chain) {
    let info;
    try {
      info = lstatSync(candidate);
    } catch {
      continue; // absence is reported by the caller's statSync as E07
    }
    if (info.isSymbolicLink()) {
      refuse("E24", [
        `Migrations path component "${candidate}" is a symlink.`,
        "Refusing: `supabase db push` reads the repository path directly, so a symlink lets",
        "the gate inspect one directory while the push applies another.",
      ]);
    }
  }
}

function loadLocalMigrations(migrationsDir, repoRoot) {
  assertNoSymlinkInPath(migrationsDir, repoRoot);
  let entries;
  try {
    const info = statSync(migrationsDir);
    if (!info.isDirectory()) {
      refuse("E07", [`Migrations path ${migrationsDir} exists but is not a directory.`]);
    }
    entries = readdirSync(migrationsDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Refusal) throw error;
    refuse("E07", [
      `Cannot read the migrations directory at ${migrationsDir}.`,
      `${error.code ?? error.name}: ${error.message}`,
      "Refusing: without the local migration set there is nothing to compare history",
      "against, so no push can be proven safe.",
    ]);
  }

  const sqlNamedEntries = entries.filter((entry) => entry.name.endsWith(".sql"));

  // Round-4 finding 1: a symlinked .sql entry must be REFUSED, not silently
  // omitted. `entry.isFile()` below is false for a symlink (even one that
  // resolves to a regular file), so filtering on it alone would drop the
  // entry from the gate's set entirely -- no error, no mention, just absent.
  // `supabase db push` does not do that: it reads directory entries by name
  // and follows the link, so it would still apply that file's content. That
  // is precisely the "the gate inspected one set, the push applied another"
  // divergence this whole design exists to prevent (see "Checked == pushed"
  // above), so it is refused explicitly rather than merely skipped.
  const symlinkedSqlEntries = sqlNamedEntries.filter((entry) => entry.isSymbolicLink());
  if (symlinkedSqlEntries.length > 0) {
    refuse("E32", [
      "The migrations directory contains symlinked .sql entries:",
      ...symlinkedSqlEntries.map((entry) => `  - ${entry.name}`),
      "",
      "Refusing: `supabase db push` reads this directory by pathname and follows symlinks, so",
      "a symlinked migration file lets the gate's inspected set and the pushed set diverge --",
      "the pushed file's real content is whatever the link currently points at, which can",
      "change independently of anything this gate fingerprinted. A symlink is never a valid",
      "migration file; replace it with a regular file committed at that path.",
    ]);
  }

  const files = sqlNamedEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    refuse("E08", [
      `Migrations directory ${migrationsDir} contains ZERO .sql files.`,
      "Refusing: an empty or wrong migrations path means every check below is vacuously",
      "true. An early version of this gate printed OK here, which is a green light",
      "manufactured out of nothing.",
    ]);
  }

  const migrations = [];
  const seen = new Map();
  for (const file of files) {
    const match = /^(\d+)_/.exec(file);
    if (!match) {
      refuse("E09", [
        `Migration file "${file}" does not start with a numeric version prefix.`,
        "Refusing: its position in the apply order is undefined.",
      ]);
    }
    const version = parseVersion(match[1], "local");
    if (seen.has(version.id)) {
      refuse("E11", [
        `Two local migration files normalise to the same version ${version.id}:`,
        `  - ${seen.get(version.id)}`,
        `  - ${file}`,
        "Refusing: which one is applied, and in what order, is undefined.",
      ]);
    }
    seen.set(version.id, file);
    // Round-3 P1-2: bind the BYTES, not just the version. Swapping the SQL body
    // of an authorised version leaves remote history untouched, so a
    // version-level fingerprint would pass while different SQL ran.
    let sha256;
    try {
      sha256 = createHash("sha256").update(readFileSync(join(migrationsDir, file))).digest("hex");
    } catch (error) {
      refuse("E07", [`Cannot read migration file "${file}": ${error.code ?? error.message}`]);
    }
    migrations.push({ file, version, sha256 });
  }

  assertOrderingIsUnambiguous(migrations.map((entry) => entry.version), "Local migration file", "E12");
  return migrations;
}

// --- remote reads ----------------------------------------------------------

const HISTORY_SQL =
  "set statement_timeout = '__TIMEOUT_MS__'; " +
  "select json_build_object(" +
  "'database', current_database(), " +
  "'rows', coalesce(json_agg(json_build_object('version', version, 'placeholder', statements is null) " +
  "order by version), '[]'::json))::text " +
  "from supabase_migrations.schema_migrations;";

const IDENTITY_SQL =
  "set statement_timeout = '__TIMEOUT_MS__'; " +
  "select json_build_object('database', current_database(), " +
  "'system_identifier', (select system_identifier::text from pg_control_system()))::text;";

function runPsqlJson(sql, timeoutMs, codes) {
  const connectSeconds = Math.max(1, Math.ceil(timeoutMs / 2000));
  // Kept strictly below the hard kill so a server that accepts but never answers
  // produces a readable cancellation instead of a bare SIGKILL.
  const statementTimeoutMs = Math.max(1, Math.floor(timeoutMs * 0.8));
  let stdout;
  try {
    stdout = execFileSync(
      "psql",
      [
        "--no-psqlrc",
        "--quiet",
        "--no-align",
        "--tuples-only",
        "--set",
        "ON_ERROR_STOP=1",
        "-c",
        sql.replace("__TIMEOUT_MS__", String(statementTimeoutMs)),
      ],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PGCONNECT_TIMEOUT: String(connectSeconds) },
      },
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      refuse("E13", [
        "psql was not found on PATH.",
        "Install the PostgreSQL client before running this gate. Refusing: with no way to",
        "read remote state, nothing about the push can be verified.",
      ]);
    }
    if (error.code === "ETIMEDOUT" || error.signal === "SIGKILL" || error.signal === "SIGTERM") {
      refuse(codes.timeout, [
        `psql did not answer within ${timeoutMs} ms and was killed.`,
        "Refusing: an unreachable or blackholed database must fail closed, never hang and",
        "never pass.",
      ]);
    }
    const stderr = String(error.stderr ?? "").trim();
    if (/statement timeout|canceling statement due to|timeout expired/i.test(stderr)) {
      refuse(codes.timeout, ["psql timed out reading remote state.", stderr]);
    }
    refuse(codes.failure, [
      "psql could not read the remote database.",
      stderr || `${error.code ?? error.name}: ${error.message}`,
      "Causes include: host unreachable, wrong or missing credentials, SSL rejected, the",
      "supabase_migrations schema or schema_migrations table absent, permission denied, or",
      "an unreadable pg_control_system(). All are indeterminate, so refuse.",
    ]);
  }

  const payload = String(stdout).trim();
  try {
    return JSON.parse(payload);
  } catch {
    refuse("E16", [
      "psql returned output that is not the expected JSON payload.",
      `Received: ${payload.slice(0, 400)}`,
    ]);
  }
}

function assertLiveIdentity(baseline, target, timeoutMs) {
  const observed = runPsqlJson(IDENTITY_SQL, timeoutMs, { failure: "E28", timeout: "E15" });
  if (baseline.database !== null && observed.database !== baseline.database) {
    refuse("E28", [
      `Live connection reports current_database() = "${observed.database}" but target "${target}"`,
      `expects "${baseline.database}". Refusing.`,
    ]);
  }
  if (baseline.systemIdentifier === null) {
    return `live database "${observed.database}", cluster ${observed.system_identifier} (UNPINNED, test mode)`;
  }
  if (String(observed.system_identifier) !== String(baseline.systemIdentifier)) {
    refuse("E28", [
      `Live cluster system_identifier is ${observed.system_identifier} but target "${target}" is`,
      `pinned to ${baseline.systemIdentifier}.`,
      "Refusing: this connection is not the cluster this target was reviewed against.",
      "(system_identifier identifies a cluster lineage: a physical restore or byte clone",
      "preserves it and a logical branch gets a new one, so this is a fail-closed",
      "operational signal rather than complete identity proof. It is one of three",
      "independent bindings, alongside the exact ref parse and current_database().)",
    ]);
  }
  return `live database "${observed.database}", cluster ${observed.system_identifier} (pinned, matched)`;
}

function loadRemoteHistory(timeoutMs) {
  const payload = runPsqlJson(HISTORY_SQL, timeoutMs, { failure: "E14", timeout: "E15" });
  const rows = payload?.rows;
  if (!Array.isArray(rows)) {
    refuse("E16", ["History query did not return a JSON array of rows."]);
  }
  if (rows.length === 0) {
    refuse("E17", [
      "supabase_migrations.schema_migrations returned ZERO rows.",
      "Refusing to guess a baseline. An empty history makes every local migration look",
      "pending, which is precisely when a blind --include-all does the most damage.",
    ]);
  }

  const history = [];
  const seen = new Map();
  for (const row of rows) {
    if (row === null || typeof row !== "object") {
      refuse("E16", ["History query returned a non-object row."]);
    }
    const version = parseVersion(String(row.version), "remote");
    if (seen.has(version.id)) {
      refuse("E19", [
        `Two history rows normalise to the same version ${version.id}: "${seen.get(version.id)}" and "${version.raw}".`,
        "Refusing: the applied set is ambiguous.",
      ]);
    }
    seen.set(version.id, version.raw);
    history.push({ version, isPlaceholder: row.placeholder === true });
  }

  assertOrderingIsUnambiguous(history.map((entry) => entry.version), "Remote history", "E20");
  return history;
}

// --- fingerprints ----------------------------------------------------------

function historyDigest(history) {
  const canonical = history
    .map((row) => `${row.version.id}:${row.isPlaceholder ? 1 : 0}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

/** Binds filenames AND bytes, so a post-approval content swap is detectable. */
function localDigest(local) {
  const canonical = local
    .map((entry) => `${entry.file}:${entry.version.id}:${entry.sha256}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function readFingerprint(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    refuse("E29", [
      `Cannot read the history fingerprint at ${path}.`,
      `${error.code ?? error.name}: ${error.message}`,
      "Refusing: without the fingerprint there is no proof the history and the migration",
      "content are still the ones the gate approved.",
    ]);
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof parsed.digest !== "string" ||
    typeof parsed.localDigest !== "string" ||
    typeof parsed.target !== "string" ||
    !Array.isArray(parsed.historyIds) ||
    !Array.isArray(parsed.authorizedPendingIds) ||
    !Array.isArray(parsed.localFiles)
  ) {
    refuse("E29", [`The history fingerprint at ${path} is malformed.`]);
  }
  return parsed;
}

/** Round-3 P1-2: the authorised BYTES must still be the bytes on disk. */
function assertLocalContentUnchanged(fingerprint, local) {
  const current = localDigest(local);
  if (current === fingerprint.localDigest) return;
  const before = new Map(fingerprint.localFiles.map((entry) => [entry.file, entry.sha256]));
  const after = new Map(local.map((entry) => [entry.file, entry.sha256]));
  const changed = [...after].filter(([file, hash]) => before.has(file) && before.get(file) !== hash).map(([f]) => f);
  const added = [...after.keys()].filter((file) => !before.has(file));
  const removed = [...before.keys()].filter((file) => !after.has(file));
  refuse("E30", [
    "Local migration CONTENT changed since the gate approved it.",
    ...(changed.length > 0 ? [`  Modified bytes: ${changed.join(", ")}`] : []),
    ...(added.length > 0 ? [`  Added files: ${added.join(", ")}`] : []),
    ...(removed.length > 0 ? [`  Removed files: ${removed.join(", ")}`] : []),
    "",
    "Refusing: a version number is not the migration. Rewriting the SQL body of an",
    "already-authorised version leaves remote history untouched, so a version-level check",
    "would pass while entirely different SQL ran against the database.",
  ]);
}

// --- main ------------------------------------------------------------------

function main() {
  const args = parseArguments(process.argv.slice(2));

  if (
    args["identity-only"] &&
    (args["emit-fingerprint"] || args["verify-fingerprint"] || args["verify-applied"])
  ) {
    refuse("E01", [
      "--identity-only cannot be combined with fingerprint emission or verification modes.",
      "Identity-only is a read-only preflight for the history-repair sequence, not a push approval.",
    ]);
  }
  if (args["identity-only"] && args["test-mode"]) {
    refuse("E01", [
      "--identity-only cannot be combined with --test-mode.",
      "History repair requires the canonical committed target identity and baseline.",
    ]);
  }

  const target = args.target;
  if (!target) {
    refuse("E02", [
      "--target=<label> is required.",
      "It selects which acknowledged placeholder baseline applies and binds this run to an",
      "expected Supabase project ref, database and cluster.",
    ]);
  }

  const testMode = args["test-mode"] === true;
  const overrides = PATH_OVERRIDE_ARGS.filter((name) => args[name] !== undefined);
  if (!testMode && overrides.length > 0) {
    // Round-3 P1-4: canonical enforcement is the DEFAULT, not an opt-in.
    refuse("E25", [
      `Path override(s) ${overrides.map((name) => `--${name}`).join(", ")} require --test-mode.`,
      "Refusing: by default this gate reads exactly the repository's own",
      "supabase/migrations and scripts/migration-rehearsal/placeholder-baseline.json.",
      "Allowing an alternate directory would let the gate approve directory A while",
      "`supabase db push` applies directory B; allowing an alternate baseline would let a",
      "committed test fixture supply a wider allowlist.",
    ]);
  }

  const repoRoot = args["repo-root"] ? resolve(args["repo-root"]) : REPO_ROOT;
  const timeoutMs = Number.parseInt(args["timeout-ms"] ?? "20000", 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    refuse("E01", [`--timeout-ms must be a positive integer, got "${args["timeout-ms"]}".`]);
  }

  const migrationsDir = resolve(args["migrations-dir"] ?? resolve(repoRoot, "supabase/migrations"));
  const baselinePath = resolve(
    args.baseline ?? resolve(repoRoot, "scripts/migration-rehearsal/placeholder-baseline.json"),
  );

  if (!testMode) {
    if (migrationsDir !== CANONICAL_MIGRATIONS_DIR || baselinePath !== CANONICAL_BASELINE) {
      refuse("E25", [
        "Resolved paths are not the canonical repository paths.",
        `  migrations: ${migrationsDir} (required ${CANONICAL_MIGRATIONS_DIR})`,
        `  baseline:   ${baselinePath} (required ${CANONICAL_BASELINE})`,
      ]);
    }
    let realDir;
    try {
      realDir = realpathSync(migrationsDir);
    } catch (error) {
      refuse("E07", [`Cannot resolve ${migrationsDir}: ${error.code ?? error.message}`]);
    }
    if (realDir !== realpathSync(CANONICAL_MIGRATIONS_DIR)) {
      refuse("E25", [`${migrationsDir} resolves to ${realDir}, not the canonical migrations directory.`]);
    }
  }

  const mode = args["identity-only"]
    ? "identity-only"
    : args["verify-applied"]
    ? "verify-applied"
    : args["verify-fingerprint"]
      ? "verify-fingerprint"
      : "check";

  console.log("== Migration safety gate ==");
  if (testMode) {
    console.log("*** TEST MODE: path overrides and unbound identity permitted. ***");
    console.log("*** Nothing that can invoke `supabase db push` is able to pass this flag. ***");
  }
  console.log(`Mode:                 ${mode}`);
  console.log(`Target:               ${target}`);
  console.log(`Migrations directory: ${migrationsDir}`);
  console.log(`Placeholder baseline: ${baselinePath} (read from git HEAD in ${repoRoot})`);

  assertConnectionEnvPresent();
  const baseline = loadBaseline(baselinePath, repoRoot, target, testMode);
  console.log(`Declared identity:    ${assertDeclaredIdentity(baseline, target)}`);
  console.log(`Live identity:        ${assertLiveIdentity(baseline, target, timeoutMs)}`);

  // History repair has to establish the same three-part target binding as a
  // push before it changes schema_migrations. It cannot run the full safety
  // gate yet because the repair deliberately creates placeholder rows that
  // are acknowledged only in the next reviewed commit. This mode performs
  // only read-only identity checks and returns before reading migration
  // history, giving the repair sequence a fail-closed pre-write admission
  // check without weakening the full push gate.
  if (mode === "identity-only") {
    console.log("");
    console.log("OK: declared project, database, and live cluster identity all match.");
    return;
  }

  // --- post-push reconciliation mode ---------------------------------------
  if (mode === "verify-applied") {
    const fingerprint = readFingerprint(args["verify-applied"]);
    if (fingerprint.target !== target) {
      refuse("E29", [`Fingerprint was taken for target "${fingerprint.target}" but this run is "${target}".`]);
    }
    const local = loadLocalMigrations(migrationsDir, repoRoot);
    assertLocalContentUnchanged(fingerprint, local);

    const history = loadRemoteHistory(timeoutMs);
    const priorIds = new Set(fingerprint.historyIds);
    const authorized = fingerprint.authorizedPendingIds;
    const actual = new Set(history.map((row) => row.version.id));
    const expected = new Set([...priorIds, ...authorized]);
    const unexpected = [...actual].filter((id) => !expected.has(id));
    const vanished = [...priorIds].filter((id) => !actual.has(id));
    const applied = authorized.filter((id) => actual.has(id));
    const notApplied = authorized.filter((id) => !actual.has(id));
    const newPlaceholders = history
      .filter((row) => row.isPlaceholder && !baseline.acknowledged.has(row.version.id))
      .map((row) => row.version.raw);

    if (unexpected.length > 0 || vanished.length > 0 || newPlaceholders.length > 0) {
      refuse("E27", [
        "Post-push reconciliation FAILED. History contains changes this push never authorised.",
        ...(unexpected.length > 0 ? [`  Unexpected versions now present: ${unexpected.join(", ")}`] : []),
        ...(vanished.length > 0 ? [`  Previously-present versions now absent: ${vanished.join(", ")}`] : []),
        ...(newPlaceholders.length > 0 ? [`  New unacknowledged placeholder rows: ${newPlaceholders.join(", ")}`] : []),
        "",
        "Something other than this push changed history. On 2026-07-30 the damage went",
        "unnoticed for hours; this check exists so it cannot go unnoticed again. Inspect the",
        "live schema before running anything else against this database.",
      ]);
    }

    // Round-3 P1-3: a push that applies some migrations and then fails leaves the
    // database altered and incomplete. That must be called out specifically.
    if (applied.length > 0 && notApplied.length > 0) {
      refuse("E31", [
        "PARTIAL APPLICATION. The push applied some of the authorised migrations and then",
        "stopped. The database is altered and incomplete.",
        `  Applied (${applied.length}): ${applied.join(", ")}`,
        `  NOT applied (${notApplied.length}): ${notApplied.join(", ")}`,
        "",
        "Do not re-run the push to 'finish the job' until a human has confirmed the live",
        "schema matches what the applied migrations were supposed to produce. A partially",
        "applied set is exactly the state in which a blind re-run does further damage.",
      ]);
    }

    console.log("");
    if (authorized.length > 0 && applied.length === 0) {
      console.log(
        `OK: history is unchanged and untouched by anything else. None of the ${authorized.length} ` +
          "authorised migration(s) were applied,",
      );
      console.log("so the push made no changes. The push command's own exit status is the signal here.");
      return;
    }
    console.log("OK: post-push history matches exactly the approved history plus the authorised set,");
    console.log("and every authorised migration file still has the exact bytes the gate approved.");
    return;
  }

  const local = loadLocalMigrations(migrationsDir, repoRoot);
  const history = loadRemoteHistory(timeoutMs);
  const digest = historyDigest(history);
  const contentDigest = localDigest(local);

  console.log(`Local migration files: ${local.length}`);
  console.log(`History rows:          ${history.length}`);
  console.log(`History digest:        ${digest.slice(0, 16)}...`);
  console.log(`Local content digest:  ${contentDigest.slice(0, 16)}...`);

  if (mode === "verify-fingerprint") {
    const fingerprint = readFingerprint(args["verify-fingerprint"]);
    if (fingerprint.target !== target) {
      refuse("E29", [`Fingerprint was taken for target "${fingerprint.target}" but this run is "${target}".`]);
    }
    assertLocalContentUnchanged(fingerprint, local);
    if (fingerprint.digest !== digest) {
      refuse("E26", [
        "Remote history CHANGED between the safety gate and the push.",
        `  approved digest: ${fingerprint.digest}`,
        `  current digest:  ${digest}`,
        "Refusing: a `supabase migration repair` or a competing push landed in between, so the",
        "state this push was authorised against no longer exists.",
      ]);
    }
  }

  // --- check 1: no unacknowledged placeholder rows -------------------------
  const placeholders = history.filter((row) => row.isPlaceholder);
  const unacknowledged = placeholders.filter((row) => !baseline.acknowledged.has(row.version.id));
  const acknowledgedPresent = placeholders.filter((row) => baseline.acknowledged.has(row.version.id));
  const staleBaseline = [...baseline.acknowledged.values()].filter(
    (version) => !placeholders.some((row) => row.version.id === version.id),
  );

  console.log(
    `Placeholder rows:      ${placeholders.length} ` +
      `(${acknowledgedPresent.length} acknowledged, ${unacknowledged.length} new)`,
  );
  if (staleBaseline.length > 0) {
    console.log(
      `Note: ${staleBaseline.length} baseline version(s) are no longer placeholders ` +
        `(${staleBaseline.map((v) => v.raw).join(", ")}). Harmless; prune when convenient.`,
    );
  }

  if (unacknowledged.length > 0) {
    refuse("E21", [
      "schema_migrations contains placeholder row(s) (statements IS NULL) that are NOT in the",
      `acknowledged baseline for target "${target}":`,
      ...unacknowledged.map((row) => `  - ${row.version.raw}`),
      "",
      "These rows come from `supabase migration repair`. They record that a version is",
      "considered applied without recording what content was applied, so history is not proof",
      "of what is live at that version.",
      "",
      "If these repairs were intentional, confirm the live schema directly (e.g.",
      "pg_get_functiondef on the objects they touch), then add them to",
      `${baseline.path} under targets["${target}"].placeholder_versions, COMMIT that change,`,
      "and re-run. The gate reads the baseline from git HEAD, so an uncommitted edit will not",
      "take effect -- acknowledgement is a reviewed commit by construction. Paste-ready:",
      "",
      JSON.stringify(
        [
          ...new Set(
            [...baseline.acknowledged.values()].map((v) => v.raw).concat(unacknowledged.map((r) => r.version.raw)),
          ),
        ].sort(),
        null,
        2,
      ),
    ]);
  }

  // --- check 2: nothing pending is older than history's high-water mark ----
  const maxApplied = history
    .map((row) => row.version)
    .reduce((max, current) => (compareVersions(current, max) > 0 ? current : max));

  const appliedIds = new Set(history.map((row) => row.version.id));
  const pending = local.filter((entry) => !appliedIds.has(entry.version.id));

  console.log(`Newest version in history: ${maxApplied.raw}`);
  console.log(`Locally pending:           ${pending.length}`);

  const unsafePending = pending.filter((entry) => compareVersions(entry.version, maxApplied) < 0);

  if (unsafePending.length > 0) {
    refuse("E22", [
      "The following pending migration(s) are OLDER than the newest version already recorded",
      "in schema_migrations. This is exactly the out-of-order re-apply pattern that reverted 6",
      "hardened Hugo functions on 2026-07-30. `--include-all` cannot tell whether a later",
      "migration already supersedes this file's content, so it must never be assumed safe:",
      ...unsafePending.map((entry) => `  - ${entry.file} (version ${entry.version.raw} < ${maxApplied.raw})`),
      "",
      "Before applying any of these, a human must confirm (by reading the live function/table",
      "definitions, not just history) whether a later migration already changed the same",
      "objects. If it does, that later migration is authoritative and this file must NOT be",
      "re-run. Record the decision; do not repair history to make this gate pass.",
    ]);
  }

  if (args["emit-fingerprint"]) {
    writeFileSync(
      resolve(args["emit-fingerprint"]),
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          target,
          digest,
          localDigest: contentDigest,
          historyIds: history.map((row) => row.version.id).sort(),
          authorizedPendingIds: pending.map((entry) => entry.version.id).sort(),
          authorizedPendingFiles: pending.map((entry) => entry.file),
          localFiles: local.map((entry) => ({ file: entry.file, version: entry.version.id, sha256: entry.sha256 })),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Fingerprint written:       ${resolve(args["emit-fingerprint"])}`);
  }

  console.log("");
  console.log("OK: history carries no unacknowledged placeholder rows, and every pending migration is");
  console.log("newer than history's high-water mark.");
  if (pending.length > 0) {
    console.log("Pending migrations (safe to include in a reviewed dry-run):");
    for (const entry of pending) {
      console.log(`  - ${entry.file}`);
    }
  }
  console.log("");
  console.log("This gate does not replace review. Run `supabase db push --include-all --dry-run` next and");
  console.log("confirm the printed list matches exactly what you expect before running it for real.");
}

try {
  main();
} catch (error) {
  console.error("");
  if (error instanceof Refusal) {
    console.error(`REFUSING (${error.code}):`);
    for (const line of error.lines) console.error(line);
  } else {
    // E23: anything unforeseen still fails closed.
    console.error("REFUSING (E23): unexpected internal error in the migration safety gate.");
    console.error(error?.stack ?? String(error));
  }
  console.error("");
  console.error("No SQL was executed by this gate beyond read-only SELECTs. Do not proceed.");
  process.exit(1);
}
