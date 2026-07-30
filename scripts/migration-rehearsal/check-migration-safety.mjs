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
//
// This script only inspects and reports. It never runs `supabase db push`,
// `supabase migration repair`, or any writing SQL itself. The single SQL it
// issues is a SELECT (plus a session-local `set statement_timeout`).
//
// ---------------------------------------------------------------------------
// Placeholder baseline (design note -- read this before changing it)
// ---------------------------------------------------------------------------
// `supabase migration repair` writes rows with `statements IS NULL`. Such a row
// records "version X is considered applied" without recording what content was
// applied, so history stops being proof of what is live.
//
// The first version of this gate refused whenever ANY such row existed. That
// self-deadlocks: `print-production-repair-commands.sh` runs
// `migration repair --status applied` immediately before the gate, and BMH
// Institute production ALREADY carries 8 pre-existing placeholder rows (Sandra
// carries 36 of 127). A blanket refusal permanently blocks every migration --
// which in practice means the gate gets bypassed, which is worse than no gate.
//
// Chosen design: an explicit, human-committed acknowledged baseline, keyed by
// target, listing placeholder VERSIONS (never contents -- contents are exactly
// what a placeholder does not have). Default file:
// scripts/migration-rehearsal/placeholder-baseline.json.
//   - A placeholder row whose version IS in the baseline for --target is
//     accepted: a human already reconciled it against the live schema.
//   - A placeholder row whose version is NOT in the baseline REFUSES. New
//     untrustworthy history is exactly the signal we want to stop on.
//   - Adding a version to the baseline is a reviewable commit, not a runtime
//     flag, so automation cannot self-approve its way past this gate. When the
//     gate refuses it prints the exact JSON to add, so the legitimate repair
//     workflow is one reviewed edit away from proceeding.
// Rejected alternatives: (1) accept all placeholders -- reopens the incident
// class; (2) snapshot placeholder contents -- placeholders have no contents;
// (3) auto-record the current placeholder set on first run -- an automated loop
// would record the very row that should have stopped it.
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
// are the same migration (the previous gate compared raw strings for identity
// and BigInt for ordering, so "001" looked pending AND looked not-older -- a
// false pass straight into an out-of-order re-apply).
//
// The Supabase CLI itself orders migrations by version STRING. If our namespace
// ordering ever disagrees with a plain string sort of the same version list
// (e.g. legacy "9" would string-sort AFTER timestamp "2026..."), the gate
// cannot reason about the order the CLI will actually use, so it refuses.
//
// ---------------------------------------------------------------------------
// EXIT PATHS -- complete enumeration. Exactly one path exits 0.
// ---------------------------------------------------------------------------
//   E00  exit 0  Safe: history is trustworthy (or fully acknowledged), and every
//                pending migration is strictly newer than history's high-water
//                mark. Proceed to a reviewed `db push --include-all --dry-run`.
//   E01  exit 1  Unrecognised / malformed command-line argument.
//   E02  exit 1  --target not supplied.
//   E03  exit 1  Missing PG* connection env var(s).
//   E04  exit 1  Baseline file missing, unreadable, or not valid JSON.
//   E05  exit 1  Baseline file has the wrong shape, or --target has no entry in it.
//   E06  exit 1  Baseline entry declares a project_ref that does not match the
//                live PG connection (gate pointed at a different database than
//                the push would be).
//   E07  exit 1  Migrations directory missing, not a directory, or unreadable.
//   E08  exit 1  Migrations directory contains ZERO .sql files (wrong path, or an
//                empty checkout -- previously a silent green light).
//   E09  exit 1  A migration filename does not start with a numeric version.
//   E10  exit 1  A local version string is malformed (non-numeric, or >14 digits).
//   E11  exit 1  Two local migration files normalise to the same version.
//   E12  exit 1  Local file ordering is ambiguous: namespace order disagrees with
//                the string order the Supabase CLI will push in.
//   E13  exit 1  psql binary not found on PATH.
//   E14  exit 1  psql connection or query failed (unreachable host, bad
//                credentials, supabase_migrations.schema_migrations absent,
//                permission denied, SSL failure, ...).
//   E15  exit 1  psql timed out (connect timeout, statement timeout, or the hard
//                wall-clock kill). A blackholed network fails closed here.
//   E16  exit 1  psql returned output that is not the expected JSON payload.
//   E17  exit 1  schema_migrations returned ZERO rows -- no baseline to reason
//                against; refuse rather than guess.
//   E18  exit 1  A remote version string is malformed (non-numeric, or >14 digits).
//   E19  exit 1  Two remote rows normalise to the same version.
//   E20  exit 1  Remote history ordering is ambiguous (as E12, for history).
//   E21  exit 1  Placeholder row(s) present whose version is NOT in the
//                acknowledged baseline for --target.
//   E22  exit 1  Pending migration(s) OLDER than history's high-water mark --
//                the 2026-07-30 incident shape.
//   E23  exit 1  Any unexpected internal error (top-level catch). Fail closed.
//
// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------
//   PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... [PGSSLMODE=require] \
//     node scripts/migration-rehearsal/check-migration-safety.mjs \
//       --target=institute-production \
//       [--migrations-dir=supabase/migrations] \
//       [--baseline=scripts/migration-rehearsal/placeholder-baseline.json] \
//       [--timeout-ms=20000]
//
// Prefer scripts/migration-rehearsal/guarded-db-push.sh, which runs this gate
// and the push against ONE connection definition so they cannot diverge.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASELINE = resolve(HERE, "placeholder-baseline.json");
const KNOWN_ARGS = new Set([
  "target",
  "migrations-dir",
  "baseline",
  "timeout-ms",
]);
const REQUIRED_PG_ENV = [
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
];
const SCHEME_RANK = { legacy: 0, timestamp: 1 };

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
    const match = /^--([a-z0-9-]+)=(.*)$/.exec(arg);
    if (!match) {
      refuse("E01", [
        `Unrecognised argument "${arg}".`,
        `Expected --name=value with name one of: ${[...KNOWN_ARGS].join(", ")}.`,
      ]);
    }
    if (!KNOWN_ARGS.has(match[1])) {
      refuse("E01", [
        `Unknown option "--${match[1]}".`,
        `Known options: ${[...KNOWN_ARGS].join(", ")}.`,
      ]);
    }
    if (match[2].length === 0) {
      refuse("E01", [`Option "--${match[1]}" was given an empty value.`]);
    }
    map[match[1]] = match[2];
  }
  return map;
}

// --- versions --------------------------------------------------------------

function parseVersion(raw, origin) {
  const code = origin === "remote" ? "E18" : origin === "baseline" ? "E05" : "E10";
  if (typeof raw !== "string" || raw.length === 0) {
    refuse(code, [`Empty ${origin} migration version. Refusing to guess its order.`]);
  }
  const label = origin === "remote" ? "History" : origin === "baseline" ? "Baseline" : "Local";
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

/**
 * The Supabase CLI orders by version string. If our namespace ordering ever
 * disagrees with that string ordering, we cannot reason about what the CLI will
 * actually do -- refuse rather than assume.
 */
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

// --- baseline --------------------------------------------------------------

function loadBaseline(baselinePath, target) {
  let text;
  try {
    text = readFileSync(baselinePath, "utf8");
  } catch (error) {
    refuse("E04", [
      `Cannot read the placeholder baseline file at ${baselinePath}.`,
      `${error.code ?? error.name}: ${error.message}`,
      "This gate requires an explicit, committed acknowledgement of which",
      "`migration repair` placeholder rows a human has already reconciled.",
    ]);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    refuse("E04", [
      `The placeholder baseline at ${baselinePath} is not valid JSON.`,
      error.message,
    ]);
  }
  if (parsed === null || typeof parsed !== "object" || typeof parsed.targets !== "object" || parsed.targets === null) {
    refuse("E05", [
      `The placeholder baseline at ${baselinePath} is malformed.`,
      'Expected an object with a "targets" object.',
    ]);
  }
  if (!Object.hasOwn(parsed.targets, target)) {
    refuse("E05", [
      `No baseline entry for target "${target}" in ${baselinePath}.`,
      `Known targets: ${Object.keys(parsed.targets).join(", ") || "(none)"}.`,
      "Refusing: an unrecognised target is either a typo or an unreviewed new",
      "database. Add an explicit entry (project_ref + placeholder_versions) and",
      "commit it before running this gate against that database.",
    ]);
  }
  const entry = parsed.targets[target];
  if (entry === null || typeof entry !== "object") {
    refuse("E05", [`Baseline entry for target "${target}" is not an object.`]);
  }
  if (!Object.hasOwn(entry, "project_ref")) {
    refuse("E05", [
      `Baseline entry for target "${target}" has no "project_ref" key.`,
      'Set it to the Supabase project ref, or to null for a disposable local cluster.',
    ]);
  }
  if (!Array.isArray(entry.placeholder_versions)) {
    refuse("E05", [
      `Baseline entry for target "${target}" has no "placeholder_versions" array.`,
      "Use [] when the target legitimately has no placeholder rows.",
    ]);
  }
  const acknowledged = new Map();
  for (const raw of entry.placeholder_versions) {
    const version = parseVersion(String(raw), "baseline");
    acknowledged.set(version.id, version);
  }
  return { projectRef: entry.project_ref, acknowledged, path: baselinePath };
}

/**
 * Guards the "gate checked TEST, push wrote PRODUCTION" mixup. Supabase pooler
 * connections carry the project ref in PGUSER (postgres.<ref>) and direct
 * connections carry it in PGHOST (db.<ref>.supabase.co).
 */
function assertConnectionMatchesTarget(projectRef, target) {
  if (projectRef === null) return "not bound (baseline project_ref is null)";
  if (typeof projectRef !== "string" || projectRef.length === 0) {
    refuse("E06", [`Baseline project_ref for target "${target}" must be a non-empty string or null.`]);
  }
  const user = process.env.PGUSER ?? "";
  const host = process.env.PGHOST ?? "";
  if (!user.includes(projectRef) && !host.includes(projectRef)) {
    refuse("E06", [
      `Connection does not match target "${target}".`,
      `Baseline expects project ref "${projectRef}", but PGUSER="${user}" and PGHOST="${host}" do not contain it.`,
      "Refusing: running this gate against one database and pushing to another",
      "is the failure mode this binding exists to stop.",
    ]);
  }
  return `bound to project ref ${projectRef}`;
}

// --- local migrations ------------------------------------------------------

function loadLocalMigrations(migrationsDir) {
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
      "Refusing: without the local migration set there is nothing to compare",
      "history against, so no push can be proven safe.",
    ]);
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    refuse("E08", [
      `Migrations directory ${migrationsDir} contains ZERO .sql files.`,
      "Refusing: an empty or wrong migrations path means every check below is",
      "vacuously true. The previous version of this gate printed OK here, which",
      "is a green light manufactured out of nothing.",
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
    migrations.push({ file, version });
  }

  assertOrderingIsUnambiguous(
    migrations.map((entry) => entry.version),
    "Local migration file",
    "E12",
  );

  return migrations;
}

// --- remote history --------------------------------------------------------

const HISTORY_SQL =
  "set statement_timeout = '__TIMEOUT_MS__'; " +
  "select coalesce(" +
  "json_agg(json_build_object('version', version, 'placeholder', statements is null) order by version)::text, " +
  "'[]') from supabase_migrations.schema_migrations;";

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

function loadRemoteHistory(timeoutMs) {
  // Two independent timeouts, both failing closed:
  //   PGCONNECT_TIMEOUT  -> a blackholed / unroutable host gives up instead of hanging
  //   statement_timeout  -> a server that accepts but never answers gives up
  // plus a hard wall-clock kill on the child process as the backstop.
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
        HISTORY_SQL.replace("__TIMEOUT_MS__", String(statementTimeoutMs)),
      ],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PGCONNECT_TIMEOUT: String(connectSeconds),
        },
      },
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      refuse("E13", [
        "psql was not found on PATH.",
        "Install the PostgreSQL client before running this gate. Refusing: with no",
        "way to read remote history, nothing about the push can be verified.",
      ]);
    }
    if (error.code === "ETIMEDOUT" || error.signal === "SIGKILL" || error.signal === "SIGTERM") {
      refuse("E15", [
        `psql did not answer within ${timeoutMs} ms and was killed.`,
        "Refusing: an unreachable or blackholed database must fail closed, never",
        "hang and never pass.",
      ]);
    }
    const stderr = String(error.stderr ?? "").trim();
    if (/statement timeout|canceling statement due to/i.test(stderr) || /timeout expired/i.test(stderr)) {
      refuse("E15", [`psql timed out reading schema_migrations.`, stderr]);
    }
    refuse("E14", [
      "psql could not read supabase_migrations.schema_migrations.",
      stderr || `${error.code ?? error.name}: ${error.message}`,
      "Causes include: host unreachable, wrong or missing credentials, SSL",
      "rejected, the supabase_migrations schema or schema_migrations table",
      "absent, or permission denied. All of them are indeterminate, so refuse.",
    ]);
  }

  const payload = String(stdout).trim();
  let rows;
  try {
    rows = JSON.parse(payload);
  } catch {
    refuse("E16", [
      "psql returned output that is not the expected JSON history payload.",
      `Received: ${payload.slice(0, 400)}`,
    ]);
  }
  if (!Array.isArray(rows)) {
    refuse("E16", ["History query did not return a JSON array."]);
  }
  if (rows.length === 0) {
    refuse("E17", [
      "supabase_migrations.schema_migrations returned ZERO rows.",
      "Refusing to guess a baseline. An empty history makes every local migration",
      "look pending, which is precisely when a blind --include-all does the most",
      "damage. A human must confirm this database's real state first.",
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

  assertOrderingIsUnambiguous(
    history.map((entry) => entry.version),
    "Remote history",
    "E20",
  );

  return history;
}

// --- main ------------------------------------------------------------------

function main() {
  const args = parseArguments(process.argv.slice(2));

  const target = args.target;
  if (!target) {
    refuse("E02", [
      "--target=<label> is required.",
      "It selects which acknowledged placeholder baseline applies and binds this",
      "run to an expected Supabase project ref, so a gate run against TEST cannot",
      "be quietly reused to authorise a PRODUCTION push.",
      "See scripts/migration-rehearsal/placeholder-baseline.json for valid labels.",
    ]);
  }

  const timeoutMs = Number.parseInt(args["timeout-ms"] ?? "20000", 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    refuse("E01", [`--timeout-ms must be a positive integer, got "${args["timeout-ms"]}".`]);
  }

  const migrationsDir = resolve(args["migrations-dir"] ?? "supabase/migrations");
  const baselinePath = resolve(args.baseline ?? DEFAULT_BASELINE);

  console.log("== Migration safety gate ==");
  console.log(`Target:               ${target}`);
  console.log(`Migrations directory: ${migrationsDir}`);
  console.log(`Placeholder baseline: ${baselinePath}`);

  assertConnectionEnvPresent();
  const baseline = loadBaseline(baselinePath, target);
  console.log(`Connection identity:  ${assertConnectionMatchesTarget(baseline.projectRef, target)}`);

  const local = loadLocalMigrations(migrationsDir);
  const history = loadRemoteHistory(timeoutMs);

  console.log(`Local migration files: ${local.length}`);
  console.log(`History rows:          ${history.length}`);

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
      "considered applied without recording what content was applied, so history is not",
      "proof of what is live at that version.",
      "",
      "If these repairs were intentional, confirm the live schema directly (e.g.",
      "pg_get_functiondef on the objects they touch), then add them to",
      `${baseline.path} under targets["${target}"].placeholder_versions and commit that`,
      "change. Adding them is a reviewable edit on purpose: automation must not be able",
      "to acknowledge its own repair rows. Paste-ready:",
      "",
      JSON.stringify(
        [...new Set([...baseline.acknowledged.values()].map((v) => v.raw).concat(unacknowledged.map((r) => r.version.raw)))].sort(),
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

  console.log("");
  console.log(
    "OK: history carries no unacknowledged placeholder rows, and every pending migration is",
  );
  console.log("newer than history's high-water mark.");
  if (pending.length > 0) {
    console.log("Pending migrations (safe to include in a reviewed dry-run):");
    for (const entry of pending) {
      console.log(`  - ${entry.file}`);
    }
  }
  console.log("");
  console.log(
    "This gate does not replace review. Run `supabase db push --include-all --dry-run` next and",
  );
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
  console.error("No SQL was executed by this gate beyond a read-only SELECT. Do not proceed.");
  process.exit(1);
}
