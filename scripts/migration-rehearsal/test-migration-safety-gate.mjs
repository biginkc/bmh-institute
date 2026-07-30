#!/usr/bin/env node
// Executable proof for scripts/migration-rehearsal/check-migration-safety.mjs.
//
// Spins ONE disposable local PostgreSQL cluster (never a hosted project, never
// production), rewrites supabase_migrations.schema_migrations per scenario, and
// runs the real gate binary as a child process, asserting on its exit code and
// the exit-path id it prints.
//
// The cluster uses LC_ALL=C and a short socket path: without both, fresh local
// clusters on this machine fail to start with "postmaster became multithreaded".
//
// Run: npm run test:migration-gate:postgres

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, "check-migration-safety.mjs");

const bindir = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
const binary = (name) => join(bindir, name);

// Short socket path on purpose: the default tmpdir path is long enough to trip
// the "postmaster became multithreaded" startup flake.
const shortRoot = `/tmp/bmhgate${process.pid}`;
const cluster = join(shortRoot, "pg");
const socket = join(shortRoot, "s");
const port = String(57000 + (process.pid % 900));
const workRoot = mkdtempSync(join(tmpdir(), "bmh-gate-cases-"));

const pgEnv = {
  ...process.env,
  LC_ALL: "C",
  LANG: "C",
  PGHOST: socket,
  PGPORT: port,
  PGDATABASE: "postgres",
  PGUSER: "postgres",
  PGPASSWORD: "unused-trust-auth",
};

const results = [];
let started = false;

function psql(sql) {
  return execFileSync(
    binary("psql"),
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-c", sql],
    { env: pgEnv, encoding: "utf8" },
  );
}

function startCluster() {
  mkdirSync(shortRoot, { recursive: true });
  execFileSync(
    binary("initdb"),
    ["-D", cluster, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8"],
    { env: pgEnv, stdio: "ignore" },
  );
  mkdirSync(socket, { recursive: true });
  execFileSync(
    binary("pg_ctl"),
    ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"],
    { env: pgEnv, stdio: "ignore" },
  );
  started = true;
}

function stopCluster() {
  if (started) {
    try {
      execFileSync(binary("pg_ctl"), ["-D", cluster, "-m", "immediate", "-w", "stop"], {
        env: pgEnv,
        stdio: "ignore",
      });
    } catch {}
  }
  rmSync(shortRoot, { recursive: true, force: true });
  rmSync(workRoot, { recursive: true, force: true });
}

/** rows: [version, isPlaceholder]. `null` drops the table entirely. */
function setHistory(rows) {
  psql("drop schema if exists supabase_migrations cascade;");
  if (rows === null) return;
  psql(
    "create schema supabase_migrations; " +
      "create table supabase_migrations.schema_migrations (" +
      "version text primary key, statements text[], name text);",
  );
  if (rows.length === 0) return;
  const values = rows
    .map(([version, placeholder]) =>
      `('${version}', ${placeholder ? "null" : "array[]::text[]"}, 'n_${version}')`,
    )
    .join(", ");
  psql(
    `insert into supabase_migrations.schema_migrations (version, statements, name) values ${values};`,
  );
}

let caseIndex = 0;
function makeMigrationsDir(files) {
  caseIndex += 1;
  const dir = join(workRoot, `migrations-${caseIndex}`);
  if (files === null) return join(workRoot, `absent-${caseIndex}`);
  mkdirSync(dir, { recursive: true });
  for (const name of files) writeFileSync(join(dir, name), "select 1;\n");
  return dir;
}

function makeBaseline(spec) {
  caseIndex += 1;
  const path = join(workRoot, `baseline-${caseIndex}.json`);
  writeFileSync(path, JSON.stringify(spec, null, 2));
  return path;
}

const DEFAULT_BASELINE = {
  targets: {
    "local-rehearsal": { project_ref: null, placeholder_versions: [] },
  },
};

function runGate({ files, baseline = DEFAULT_BASELINE, target = "local-rehearsal", env = {}, extraArgs = [], baselinePath }) {
  const dir = makeMigrationsDir(files);
  const args = [GATE];
  if (target !== null) args.push(`--target=${target}`);
  args.push(`--migrations-dir=${dir}`);
  args.push(`--baseline=${baselinePath ?? makeBaseline(baseline)}`);
  args.push(...extraArgs);
  const result = spawnSync(process.execPath, args, {
    env: { ...pgEnv, ...env },
    encoding: "utf8",
  });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function check(name, { status, out }, expectedStatus, expectedFragments = []) {
  const problems = [];
  if (status !== expectedStatus) problems.push(`exit ${status}, expected ${expectedStatus}`);
  for (const fragment of expectedFragments) {
    if (!out.includes(fragment)) problems.push(`missing output fragment: ${fragment}`);
  }
  results.push({ name, ok: problems.length === 0, problems, out });
  const mark = problems.length === 0 ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}`);
  if (problems.length > 0) {
    for (const problem of problems) console.log(`      ! ${problem}`);
    console.log(out.split("\n").map((line) => `      | ${line}`).join("\n"));
  }
}

// --------------------------------------------------------------------------

try {
  startCluster();

  // 1. Pass case: a genuinely newer pending migration.
  setHistory([
    ["001", false],
    ["002", false],
    ["20260101000000", false],
  ]);
  check(
    "pass: genuinely newer pending migration exits 0",
    runGate({ files: ["001_a.sql", "002_b.sql", "20260101000000_c.sql", "20260201000000_new.sql"] }),
    0,
    ["Locally pending:           1", "20260201000000_new.sql"],
  );

  // 2. The 2026-07-30 incident replay: old file, no history row, newer history present.
  setHistory([
    ["20260728113000", false],
    ["20260729141000", false],
    ["20260730130000", false],
  ]);
  check(
    "incident replay: old superseded file missing from history exits 1 (E22)",
    runGate({
      files: [
        "20260728091000_hugo_access_provisioner.sql",
        "20260728113000_x.sql",
        "20260729141000_y.sql",
        "20260730130000_z.sql",
      ],
    }),
    1,
    ["REFUSING (E22)", "20260728091000_hugo_access_provisioner.sql", "2026-07-30"],
  );

  // 3. Empty migrations directory must fail closed (previously exited 0 "OK").
  setHistory([["001", false], ["20260101000000", false]]);
  check(
    "empty migrations directory exits 1 (E08)",
    runGate({ files: [] }),
    1,
    ["REFUSING (E08)", "ZERO .sql files"],
  );

  // 4. Missing migrations directory.
  check(
    "missing migrations directory exits 1 (E07)",
    runGate({ files: null }),
    1,
    ["REFUSING (E07)"],
  );

  // 5. Formatting collision: history "1", local "001_new.sql".
  //    Old behaviour: "001" !== "1" so it looked pending, and BigInt("001") <
  //    BigInt("1") is false so it passed -- a false green light onto an
  //    out-of-order re-apply. Correct verdict: same migration, not pending.
  setHistory([["1", false], ["2", false], ["20260101000000", false]]);
  check(
    'formatting collision "001" vs "1": already applied, not pending',
    runGate({ files: ["001_new.sql", "002_b.sql", "20260101000000_c.sql"] }),
    0,
    ["Locally pending:           0"],
  );

  // 5a. The exact minimal shape from the review finding. Verified against the
  //     previous gate on the same fixture: it exited 0 and listed 001_new.sql as
  //     "safe to include in a reviewed dry-run" -- i.e. it green-lit re-applying
  //     a migration that was already applied as "1".
  setHistory([["1", false]]);
  check(
    'finding-4 minimal: history ["1"], local 001_new.sql -> pending 0, no false pass',
    runGate({ files: ["001_new.sql"] }),
    0,
    ["Locally pending:           0"],
  );
  setHistory([["001", false]]);
  check(
    'finding-4 variant: history ["001"], local 0001_a.sql -> pending 0, no false pass',
    runGate({ files: ["0001_a.sql"] }),
    0,
    ["Locally pending:           0"],
  );

  // 5b. Same collision, but the colliding file really is older than the
  //     high-water mark AND genuinely absent from history -> must refuse.
  setHistory([["2", false], ["20260101000000", false]]);
  check(
    'formatting collision variant: "001" truly absent from history exits 1 (E22)',
    runGate({ files: ["001_new.sql", "002_b.sql", "20260101000000_c.sql"] }),
    1,
    ["REFUSING (E22)", "001_new.sql"],
  );

  // 6. "0001" vs "001".
  setHistory([["0001", false], ["20260101000000", false]]);
  check(
    'formatting collision "0001" vs "001": already applied, not pending',
    runGate({ files: ["001_a.sql", "20260101000000_c.sql"] }),
    0,
    ["Locally pending:           0"],
  );

  // 7. Mixed legacy-vs-timestamp namespaces, Institute's real shape.
  setHistory([
    ["001", false],
    ["052", false],
    ["20260721231125", false],
    ["20260730130000", false],
  ]);
  check(
    "mixed legacy + timestamp schemes: newer timestamp pending exits 0",
    runGate({
      files: ["001_a.sql", "052_b.sql", "20260721231125_c.sql", "20260730130000_d.sql", "20260731000000_e.sql"],
    }),
    0,
    ["Locally pending:           1", "20260731000000_e.sql"],
  );
  check(
    "mixed schemes: a legacy file missing from history is older than the timestamp high-water mark (E22)",
    runGate({
      files: ["001_a.sql", "051_missing.sql", "052_b.sql", "20260721231125_c.sql", "20260730130000_d.sql"],
    }),
    1,
    ["REFUSING (E22)", "051_missing.sql"],
  );

  // 8. Ordering the Supabase CLI would disagree with: legacy "9" string-sorts
  //    AFTER "2026...". The gate refuses rather than assume an order.
  setHistory([["20260101000000", false]]);
  check(
    "ambiguous ordering (unpadded legacy vs timestamp) exits 1 (E12)",
    runGate({ files: ["9_late.sql", "20260101000000_c.sql"] }),
    1,
    ["REFUSING (E12)"],
  );

  // 9. Placeholder baseline: acknowledged placeholders do NOT block.
  setHistory([
    ["001", false],
    ["20260722130000", true],
    ["20260728230000", true],
    ["20260730130000", false],
  ]);
  const acknowledged = {
    targets: {
      "local-rehearsal": {
        project_ref: null,
        placeholder_versions: ["20260722130000", "20260728230000"],
      },
    },
  };
  check(
    "pre-existing acknowledged placeholders do NOT block the push",
    runGate({
      files: ["001_a.sql", "20260722130000_b.sql", "20260728230000_c.sql", "20260730130000_d.sql", "20260731000000_new.sql"],
      baseline: acknowledged,
    }),
    0,
    ["2 acknowledged, 0 new", "Locally pending:           1"],
  );

  // 9b. A NEW placeholder that is not in the baseline DOES block.
  setHistory([
    ["001", false],
    ["20260722130000", true],
    ["20260728230000", true],
    ["20260730130000", true],
  ]);
  check(
    "a NEW unacknowledged placeholder DOES block the push (E21)",
    runGate({
      files: ["001_a.sql", "20260722130000_b.sql", "20260728230000_c.sql", "20260730130000_d.sql"],
      baseline: acknowledged,
    }),
    1,
    ["REFUSING (E21)", "20260730130000"],
  );

  // 9c. Self-deadlock regression: the repair workflow's own placeholders, once
  //     acknowledged, must not permanently freeze migrations.
  setHistory([
    ["001", true],
    ["002", true],
    ["003", true],
    ["20260730130000", false],
  ]);
  check(
    "repair-created placeholders, once acknowledged, do not freeze the repo",
    runGate({
      files: ["001_a.sql", "002_b.sql", "003_c.sql", "20260730130000_d.sql", "20260731000000_new.sql"],
      baseline: {
        targets: {
          "local-rehearsal": { project_ref: null, placeholder_versions: ["001", "002", "003"] },
        },
      },
    }),
    0,
    ["3 acknowledged, 0 new", "Locally pending:           1"],
  );

  // 10. schema_migrations absent entirely.
  setHistory(null);
  check(
    "schema_migrations absent exits 1 (E14)",
    runGate({ files: ["001_a.sql"] }),
    1,
    ["REFUSING (E14)"],
  );

  // 11. schema_migrations present but empty.
  setHistory([]);
  check(
    "schema_migrations with zero rows exits 1 (E17)",
    runGate({ files: ["001_a.sql"] }),
    1,
    ["REFUSING (E17)", "ZERO rows"],
  );

  // 12. Unreachable / blackholed host must time out non-zero, not hang.
  setHistory([["001", false]]);
  const blackholeStart = Date.now();
  check(
    "blackholed host times out and exits 1 (E15)",
    runGate({
      files: ["001_a.sql"],
      env: { PGHOST: "10.255.255.1", PGPORT: "5432" },
      extraArgs: ["--timeout-ms=6000"],
    }),
    1,
    ["REFUSING (E15)"],
  );
  console.log(`      (blackhole case returned in ${Date.now() - blackholeStart} ms)`);

  // 12b. Server accepts the TCP connection and then never speaks -- the shape a
  //      half-dead pooler or a silently dropping proxy produces. Must not hang.
  const silentServer = createServer(() => {});
  await new Promise((done) => silentServer.listen(0, "127.0.0.1", done));
  const silentPort = String(silentServer.address().port);
  const silentStart = Date.now();
  check(
    "server that accepts but never answers exits 1 (E15)",
    runGate({
      files: ["001_a.sql"],
      env: { PGHOST: "127.0.0.1", PGPORT: silentPort },
      extraArgs: ["--timeout-ms=6000"],
    }),
    1,
    ["REFUSING (E15)"],
  );
  console.log(`      (silent-server case returned in ${Date.now() - silentStart} ms)`);
  silentServer.close();

  // 13. Connection refused (host reachable, nothing listening).
  check(
    "refused connection exits 1 (E14)",
    runGate({
      files: ["001_a.sql"],
      env: { PGHOST: "127.0.0.1", PGPORT: "1" },
      extraArgs: ["--timeout-ms=6000"],
    }),
    1,
    ["REFUSING (E14)"],
  );

  // 14. Missing credentials.
  check(
    "missing PGPASSWORD exits 1 (E03)",
    runGate({ files: ["001_a.sql"], env: { PGPASSWORD: "" } }),
    1,
    ["REFUSING (E03)", "PGPASSWORD"],
  );

  // 15. Missing --target.
  check(
    "missing --target exits 1 (E02)",
    runGate({ files: ["001_a.sql"], target: null }),
    1,
    ["REFUSING (E02)"],
  );

  // 16. Baseline file missing.
  check(
    "missing baseline file exits 1 (E04)",
    runGate({ files: ["001_a.sql"], baselinePath: join(workRoot, "no-such-baseline.json") }),
    1,
    ["REFUSING (E04)"],
  );

  // 17. Unknown target.
  check(
    "unknown target exits 1 (E05)",
    runGate({ files: ["001_a.sql"], target: "not-a-real-target" }),
    1,
    ["REFUSING (E05)"],
  );

  // 18. project_ref bound in the baseline but not matched by the connection.
  check(
    "project_ref mismatch between gate connection and target exits 1 (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: {
        targets: { "local-rehearsal": { project_ref: "dhvfsyteqsxagokoerrx", placeholder_versions: [] } },
      },
    }),
    1,
    ["REFUSING (E06)"],
  );

  // 19. Malformed local version strings.
  check(
    "non-numeric migration filename exits 1 (E09)",
    runGate({ files: ["001_a.sql", "hotfix_b.sql"] }),
    1,
    ["REFUSING (E09)"],
  );
  check(
    "over-long numeric version exits 1 (E10)",
    runGate({ files: ["001_a.sql", "202607301300001234_b.sql"] }),
    1,
    ["REFUSING (E10)"],
  );
  check(
    "two local files normalising to the same version exits 1 (E11)",
    runGate({ files: ["001_a.sql", "1_b.sql"] }),
    1,
    ["REFUSING (E11)"],
  );

  // 20. Malformed remote version string.
  setHistory([["001", false], ["draft-x", false]]);
  check(
    "malformed history version exits 1 (E18)",
    runGate({ files: ["001_a.sql"] }),
    1,
    ["REFUSING (E18)"],
  );

  // 21. Unrecognised CLI argument.
  setHistory([["001", false]]);
  check(
    "unknown CLI option exits 1 (E01)",
    runGate({ files: ["001_a.sql"], extraArgs: ["--force"] }),
    1,
    ["REFUSING (E01)"],
  );
} finally {
  stopCluster();
}

const failed = results.filter((entry) => !entry.ok);
console.log("");
console.log(`${results.length - failed.length}/${results.length} gate scenarios passed.`);
if (failed.length > 0) {
  console.log("FAILED:");
  for (const entry of failed) console.log(`  - ${entry.name}`);
  process.exit(1);
}
