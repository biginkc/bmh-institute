#!/usr/bin/env node
// Executable proof for scripts/migration-rehearsal/check-migration-safety.mjs
// and scripts/migration-rehearsal/guarded-db-push.sh.
//
// Spins ONE disposable local PostgreSQL cluster (never a hosted project, never
// production), rewrites supabase_migrations.schema_migrations per scenario, and
// runs the real gate and the real wrapper as child processes, asserting on exit
// codes and the exit-path ids they print.
//
// Structure:
//   * Most scenarios drive the gate directly inside a disposable scratch git
//     repo (the baseline must be a committed blob), using --test-mode, which is
//     the ONLY way to pass path overrides or use an unbound identity.
//   * A block of scenarios proves that WITHOUT --test-mode those same things
//     fail closed.
//   * The end-to-end block runs guarded-db-push.sh for real against a scratch
//     repo with a FULLY PINNED identity (a `postgres.<20-letter-ref>` superuser
//     role is created in the cluster so the exact ref parse succeeds), with a
//     stub `supabase` on PATH that records the directory it read, whether the
//     advisory lock was held while it ran, and its own start time so the
//     verify-to-first-statement window can be MEASURED.
//
// The cluster uses LC_ALL=C and a short socket path: without both, fresh local
// clusters on this machine fail to start with "postmaster became multithreaded".
//
// Run: npm run test:migration-gate:postgres

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, "check-migration-safety.mjs");
const WRAPPER = resolve(HERE, "guarded-db-push.sh");
const PINNED_REF = "aaaaaaaaaaaaaaaaaaaa"; // 20 lowercase letters, matches the gate's anchored parse

const bindir = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
const binary = (name) => join(bindir, name);

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
const notes = [];
let started = false;
let systemIdentifier = "";

function psqlScalar(sql, env = pgEnv) {
  return execFileSync(binary("psql"), ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env,
    encoding: "utf8",
  }).trim();
}

function psql(sql) {
  return execFileSync(binary("psql"), ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-c", sql], {
    env: pgEnv,
    encoding: "utf8",
  });
}

function startCluster() {
  mkdirSync(shortRoot, { recursive: true });
  execFileSync(binary("initdb"), ["-D", cluster, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8"], {
    env: pgEnv,
    stdio: "ignore",
  });
  mkdirSync(socket, { recursive: true });
  execFileSync(binary("pg_ctl"), ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"], {
    env: pgEnv,
    stdio: "ignore",
  });
  started = true;
  // A role named exactly postgres.<ref> so the end-to-end run satisfies the
  // gate's anchored PGUSER parse without any unbound identity.
  psql(`create role "postgres.${PINNED_REF}" superuser login;`);
  systemIdentifier = psqlScalar("select system_identifier::text from pg_control_system();");
}

function stopCluster() {
  if (started) {
    try {
      execFileSync(binary("pg_ctl"), ["-D", cluster, "-m", "immediate", "-w", "stop"], { env: pgEnv, stdio: "ignore" });
    } catch {}
  }
  rmSync(shortRoot, { recursive: true, force: true });
  rmSync(workRoot, { recursive: true, force: true });
}

function setHistory(rows) {
  psql("drop schema if exists supabase_migrations cascade;");
  if (rows === null) return;
  psql(
    "create schema supabase_migrations; " +
      "create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);" +
      `grant all on schema supabase_migrations to "postgres.${PINNED_REF}"; ` +
      `grant all on supabase_migrations.schema_migrations to "postgres.${PINNED_REF}";`,
  );
  if (rows.length === 0) return;
  insertHistory(rows);
}

function insertHistory(rows) {
  const values = rows
    .map(([version, placeholder]) => `('${version}', ${placeholder ? "null" : "array[]::text[]"}, 'n_${version}')`)
    .join(", ");
  psql(`insert into supabase_migrations.schema_migrations (version, statements, name) values ${values};`);
}

const UNBOUND_TARGET = { project_ref: null, database: null, db_system_identifier: null, placeholder_versions: [] };
const DEFAULT_BASELINE = { targets: { "local-rehearsal": UNBOUND_TARGET } };
const pinnedTarget = (overrides = {}) => ({
  project_ref: PINNED_REF,
  database: "postgres",
  db_system_identifier: systemIdentifier,
  placeholder_versions: [],
  ...overrides,
});

let caseIndex = 0;

function gitInit(repo) {
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], {
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "gate-test",
        GIT_AUTHOR_EMAIL: "gate@test.invalid",
        GIT_COMMITTER_NAME: "gate-test",
        GIT_COMMITTER_EMAIL: "gate@test.invalid",
      },
    });
  return git;
}

function makeScratchRepo({ baseline = DEFAULT_BASELINE, files = [], commitBaseline = true } = {}) {
  caseIndex += 1;
  const repo = join(workRoot, `repo-${caseIndex}`);
  mkdirSync(join(repo, "scripts", "migration-rehearsal"), { recursive: true });
  if (files !== null) {
    mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
    for (const name of files) writeFileSync(join(repo, "supabase", "migrations", name), "select 1;\n");
  }
  const baselinePath = join(repo, "scripts", "migration-rehearsal", "placeholder-baseline.json");
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  const git = gitInit(repo);
  git("init", "-q");
  if (commitBaseline) {
    git("add", "-A");
    git("commit", "-q", "-m", "scratch baseline");
  } else {
    writeFileSync(join(repo, "README.md"), "scratch\n");
    git("add", "README.md");
    git("commit", "-q", "-m", "scratch without baseline");
  }
  return { repo, baselinePath, migrationsDir: join(repo, "supabase", "migrations") };
}

function runGate({
  files = [],
  baseline = DEFAULT_BASELINE,
  target = "local-rehearsal",
  env = {},
  extraArgs = [],
  commitBaseline = true,
  scratch,
  migrationsDir,
  baselinePath,
  testMode = true,
  omitOverrides = false,
} = {}) {
  const built = scratch ?? makeScratchRepo({ baseline, files, commitBaseline });
  const args = [GATE];
  if (target !== null) args.push(`--target=${target}`);
  if (testMode) args.push("--test-mode");
  if (!omitOverrides) {
    args.push(`--repo-root=${built.repo}`);
    args.push(`--migrations-dir=${migrationsDir ?? built.migrationsDir}`);
    args.push(`--baseline=${baselinePath ?? built.baselinePath}`);
  }
  args.push(...extraArgs);
  const result = spawnSync(process.execPath, args, { env: { ...pgEnv, ...env }, encoding: "utf8" });
  return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`, scratch: built };
}

function check(name, { status, out }, expectedStatus, expectedFragments = []) {
  const problems = [];
  if (status !== expectedStatus) problems.push(`exit ${status}, expected ${expectedStatus}`);
  for (const fragment of expectedFragments) {
    if (!out.includes(fragment)) problems.push(`missing output fragment: ${fragment}`);
  }
  results.push({ name, ok: problems.length === 0, problems, out });
  console.log(`${problems.length === 0 ? "PASS" : "FAIL"}  ${name}`);
  if (problems.length > 0) {
    for (const problem of problems) console.log(`      ! ${problem}`);
    console.log(out.split("\n").map((line) => `      | ${line}`).join("\n"));
  }
}

// --------------------------------------------------------------------------

try {
  startCluster();

  // ==== core behaviour (test mode: unbound identity, scratch repos) ========

  setHistory([["001", false], ["002", false], ["20260101000000", false]]);
  check(
    "pass: genuinely newer pending migration exits 0",
    runGate({ files: ["001_a.sql", "002_b.sql", "20260101000000_c.sql", "20260201000000_new.sql"] }),
    0,
    ["Locally pending:           1", "20260201000000_new.sql"],
  );

  setHistory([["20260728113000", false], ["20260729141000", false], ["20260730130000", false]]);
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

  setHistory([["001", false], ["20260101000000", false]]);
  check("empty migrations directory exits 1 (E08)", runGate({ files: [] }), 1, ["REFUSING (E08)", "ZERO .sql files"]);
  check(
    "missing migrations directory exits 1 (E07)",
    runGate({ files: null, migrationsDir: join(workRoot, "absent-dir") }),
    1,
    ["REFUSING (E07)"],
  );

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
  setHistory([["2", false], ["20260101000000", false]]);
  check(
    'formatting collision variant: "001" truly absent from history exits 1 (E22)',
    runGate({ files: ["001_new.sql", "002_b.sql", "20260101000000_c.sql"] }),
    1,
    ["REFUSING (E22)", "001_new.sql"],
  );

  setHistory([["001", false], ["052", false], ["20260721231125", false], ["20260730130000", false]]);
  check(
    "mixed legacy + timestamp schemes: newer timestamp pending exits 0",
    runGate({
      files: ["001_a.sql", "052_b.sql", "20260721231125_c.sql", "20260730130000_d.sql", "20260731000000_e.sql"],
    }),
    0,
    ["Locally pending:           1"],
  );
  check(
    "mixed schemes: a legacy file missing from history is older than the timestamp high-water mark (E22)",
    runGate({
      files: ["001_a.sql", "051_missing.sql", "052_b.sql", "20260721231125_c.sql", "20260730130000_d.sql"],
    }),
    1,
    ["REFUSING (E22)", "051_missing.sql"],
  );

  setHistory([["20260101000000", false]]);
  check(
    "ambiguous ordering (unpadded legacy vs timestamp) exits 1 (E12)",
    runGate({ files: ["9_late.sql", "20260101000000_c.sql"] }),
    1,
    ["REFUSING (E12)"],
  );

  const acknowledged = {
    targets: { "local-rehearsal": { ...UNBOUND_TARGET, placeholder_versions: ["20260722130000", "20260728230000"] } },
  };
  setHistory([["001", false], ["20260722130000", true], ["20260728230000", true], ["20260730130000", false]]);
  check(
    "pre-existing acknowledged placeholders do NOT block the push",
    runGate({
      files: [
        "001_a.sql",
        "20260722130000_b.sql",
        "20260728230000_c.sql",
        "20260730130000_d.sql",
        "20260731000000_new.sql",
      ],
      baseline: acknowledged,
    }),
    0,
    ["2 acknowledged, 0 new", "Locally pending:           1"],
  );
  setHistory([["001", false], ["20260722130000", true], ["20260728230000", true], ["20260730130000", true]]);
  check(
    "a NEW unacknowledged placeholder DOES block the push (E21)",
    runGate({
      files: ["001_a.sql", "20260722130000_b.sql", "20260728230000_c.sql", "20260730130000_d.sql"],
      baseline: acknowledged,
    }),
    1,
    ["REFUSING (E21)", "20260730130000"],
  );
  setHistory([["001", true], ["002", true], ["003", true], ["20260730130000", false]]);
  check(
    "repair-created placeholders, once acknowledged, do not freeze the repo",
    runGate({
      files: ["001_a.sql", "002_b.sql", "003_c.sql", "20260730130000_d.sql", "20260731000000_new.sql"],
      baseline: { targets: { "local-rehearsal": { ...UNBOUND_TARGET, placeholder_versions: ["001", "002", "003"] } } },
    }),
    0,
    ["3 acknowledged, 0 new"],
  );

  setHistory(null);
  check("schema_migrations absent exits 1 (E14)", runGate({ files: ["001_a.sql"] }), 1, ["REFUSING (E14)"]);
  setHistory([]);
  check("schema_migrations with zero rows exits 1 (E17)", runGate({ files: ["001_a.sql"] }), 1, ["REFUSING (E17)"]);

  setHistory([["001", false]]);
  const blackholeStart = Date.now();
  check(
    "blackholed host times out and exits 1 (E15)",
    runGate({ files: ["001_a.sql"], env: { PGHOST: "10.255.255.1", PGPORT: "5432" }, extraArgs: ["--timeout-ms=6000"] }),
    1,
    ["REFUSING (E15)"],
  );
  notes.push(`blackholed host refused in ${Date.now() - blackholeStart} ms`);

  const silentServer = createServer(() => {});
  await new Promise((done) => silentServer.listen(0, "127.0.0.1", done));
  const silentPort = String(silentServer.address().port);
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
  silentServer.close();

  check(
    "refused connection exits 1 (E28 at the identity probe)",
    runGate({ files: ["001_a.sql"], env: { PGHOST: "127.0.0.1", PGPORT: "1" }, extraArgs: ["--timeout-ms=6000"] }),
    1,
    ["REFUSING (E28)"],
  );
  check("missing PGPASSWORD exits 1 (E03)", runGate({ files: ["001_a.sql"], env: { PGPASSWORD: "" } }), 1, [
    "REFUSING (E03)",
  ]);
  check("missing --target exits 1 (E02)", runGate({ files: ["001_a.sql"], target: null }), 1, ["REFUSING (E02)"]);
  check("unknown target exits 1 (E05)", runGate({ files: ["001_a.sql"], target: "nope" }), 1, ["REFUSING (E05)"]);
  check("non-numeric migration filename exits 1 (E09)", runGate({ files: ["001_a.sql", "hotfix_b.sql"] }), 1, [
    "REFUSING (E09)",
  ]);
  check("over-long numeric version exits 1 (E10)", runGate({ files: ["001_a.sql", "202607301300001234_b.sql"] }), 1, [
    "REFUSING (E10)",
  ]);
  check("two local files normalising to the same version exits 1 (E11)", runGate({ files: ["001_a.sql", "1_b.sql"] }), 1, [
    "REFUSING (E11)",
  ]);
  setHistory([["001", false], ["draft-x", false]]);
  check("malformed history version exits 1 (E18)", runGate({ files: ["001_a.sql"] }), 1, ["REFUSING (E18)"]);
  setHistory([["001", false]]);
  check("unknown CLI option exits 1 (E01)", runGate({ files: ["001_a.sql"], extraArgs: ["--force"] }), 1, [
    "REFUSING (E01)",
  ]);

  // ==== baseline provenance (round-2 P1-4) ================================

  setHistory([["001", false], ["20260730130000", true]]);
  check(
    "an UNTRACKED baseline cannot acknowledge a placeholder (E04)",
    runGate({
      baseline: { targets: { "local-rehearsal": { ...UNBOUND_TARGET, placeholder_versions: ["20260730130000"] } } },
      files: ["001_a.sql", "20260730130000_d.sql"],
      commitBaseline: false,
    }),
    1,
    ["REFUSING (E04)", "COMMITTED at the current HEAD"],
  );

  {
    const symlinked = makeScratchRepo({ files: ["001_a.sql", "20260730130000_d.sql"], commitBaseline: false });
    const evil = join(workRoot, `evil-baseline-${caseIndex}.json`);
    writeFileSync(
      evil,
      JSON.stringify({
        targets: { "local-rehearsal": { ...UNBOUND_TARGET, placeholder_versions: ["20260730130000"] } },
      }),
    );
    rmSync(symlinked.baselinePath, { force: true });
    symlinkSync(evil, symlinked.baselinePath);
    check("a SYMLINKED baseline cannot acknowledge a placeholder (E04)", runGate({ scratch: symlinked }), 1, [
      "REFUSING (E04)",
    ]);
  }

  {
    const swapped = makeScratchRepo({ files: ["001_a.sql", "20260730130000_d.sql"] });
    writeFileSync(
      swapped.baselinePath,
      JSON.stringify({
        targets: { "local-rehearsal": { ...UNBOUND_TARGET, placeholder_versions: ["20260730130000"] } },
      }),
    );
    check("a working-tree edit to the baseline has NO effect; git HEAD wins (E21)", runGate({ scratch: swapped }), 1, [
      "REFUSING (E21)",
    ]);
  }

  check(
    "a COMMITTED acknowledgement is accepted (the workflow still works)",
    runGate({
      baseline: { targets: { "local-rehearsal": { ...UNBOUND_TARGET, placeholder_versions: ["20260730130000"] } } },
      files: ["001_a.sql", "20260730130000_d.sql", "20260731000000_new.sql"],
    }),
    0,
    ["1 acknowledged, 0 new"],
  );
  check(
    "a baseline outside the repo root is refused (E04)",
    runGate({ files: ["001_a.sql"], baselinePath: join(workRoot, "outside-baseline.json") }),
    1,
    ["REFUSING (E04)", "outside the repository root"],
  );
  check(
    "a baseline missing an identity key is refused, not silently defaulted (E05)",
    runGate({
      baseline: { targets: { "local-rehearsal": { project_ref: null, database: null, placeholder_versions: [] } } },
      files: ["001_a.sql"],
    }),
    1,
    ["REFUSING (E05)", "db_system_identifier"],
  );

  {
    // Round-3 P1-6: a hung `git` must refuse, not hang.
    const hungGitBin = join(workRoot, "hung-git-bin");
    mkdirSync(hungGitBin, { recursive: true });
    writeFileSync(join(hungGitBin, "git"), "#!/usr/bin/env bash\nsleep 60\n");
    execFileSync("chmod", ["+x", join(hungGitBin, "git")]);
    const hungStart = Date.now();
    check(
      "P1-6: a hung `git show` refuses within the bounded timeout (E04)",
      runGate({ files: ["001_a.sql"], env: { PATH: `${hungGitBin}:${process.env.PATH}` } }),
      1,
      ["REFUSING (E04)", "was killed"],
    );
    notes.push(`hung git refused in ${Date.now() - hungStart} ms (bound is 10000 ms)`);
  }

  // ==== identity (round-2 P1-2) ===========================================

  setHistory([["001", false]]);
  check(
    "a hostname that merely CONTAINS the project ref is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: { targets: { "local-rehearsal": pinnedTarget({ db_system_identifier: systemIdentifier }) } },
      env: { PGHOST: `db.${PINNED_REF}.supabase.co.attacker.example`, PGUSER: "postgres" },
    }),
    1,
    ["REFUSING (E06)", "never inferred from a substring"],
  );
  check(
    "a username that merely CONTAINS the project ref is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: { targets: { "local-rehearsal": pinnedTarget() } },
      env: { PGUSER: `postgres.${PINNED_REF}x` },
    }),
    1,
    ["REFUSING (E06)"],
  );
  check(
    "PGUSER and PGHOST declaring DIFFERENT refs is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: { targets: { "local-rehearsal": pinnedTarget() } },
      env: { PGUSER: `postgres.${PINNED_REF}`, PGHOST: "db.jvaabkchkihkjllehmft.supabase.co" },
    }),
    1,
    ["REFUSING (E06)"],
  );
  check(
    "PGDATABASE not matching the target is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: { targets: { "local-rehearsal": { ...UNBOUND_TARGET, database: "app_production" } } },
    }),
    1,
    ["REFUSING (E06)", "PGDATABASE"],
  );
  check(
    "a pinned cluster system_identifier that MATCHES the live cluster passes",
    runGate({
      files: ["001_a.sql"],
      baseline: { targets: { "local-rehearsal": { ...UNBOUND_TARGET, db_system_identifier: systemIdentifier } } },
    }),
    0,
    ["(pinned, matched)"],
  );
  check(
    "a pinned cluster system_identifier that does NOT match is refused (E28)",
    runGate({
      files: ["001_a.sql"],
      baseline: { targets: { "local-rehearsal": { ...UNBOUND_TARGET, db_system_identifier: "1234567890123456789" } } },
    }),
    1,
    ["REFUSING (E28)", "not the cluster this target was reviewed against"],
  );
  check(
    "identity-only cannot inherit test-mode path and identity bypasses",
    runGate({
      files: ["001_a.sql"],
      extraArgs: ["--identity-only"],
    }),
    1,
    ["REFUSING (E01)", "cannot be combined with --test-mode"],
  );
  check(
    "identity-only cannot masquerade as a fingerprint-producing push approval",
    runGate({
      files: ["001_a.sql"],
      extraArgs: ["--identity-only", `--emit-fingerprint=${join(workRoot, "must-not-exist.json")}`],
    }),
    1,
    ["REFUSING (E01)", "cannot be combined"],
  );

  // ==== round-3 P1-1 and P1-4: safe by default ============================

  check(
    "P1-4: path overrides WITHOUT --test-mode are refused (E25)",
    runGate({ files: ["001_a.sql"], testMode: false }),
    1,
    ["REFUSING (E25)", "require --test-mode"],
  );
  check(
    "P1-4: with no overrides and no --test-mode the gate uses the REAL repo paths",
    runGate({ files: ["001_a.sql"], testMode: false, omitOverrides: true, target: "institute-production" }),
    1,
    // The real committed baseline pins production's ref; a local socket cannot
    // satisfy it, so this refuses at the identity binding rather than proceeding.
    ["REFUSING (E06)"],
  );
  check(
    "P1-1: an UNBOUND identity target fails closed without --test-mode (E06)",
    runGate({
      files: ["001_a.sql"],
      testMode: false,
      omitOverrides: true,
      target: "institute-production",
      env: { PGUSER: "postgres.dhvfsyteqsxagokoerrx" },
    }),
    1,
    ["REFUSING (E28)"],
  );
  {
    const unboundRepo = makeScratchRepo({ files: ["001_a.sql"] });
    check(
      "P1-1: a null identity field REFUSES rather than skipping the check (E06)",
      runGate({ scratch: unboundRepo, testMode: true, extraArgs: [], target: "local-rehearsal" }),
      0,
      ["UNBOUND (test mode only)"],
    );
    const result = spawnSync(
      process.execPath,
      [GATE, "--target=local-rehearsal", `--repo-root=${unboundRepo.repo}`],
      { env: pgEnv, encoding: "utf8" },
    );
    check(
      "P1-1: the same unbound target without --test-mode is refused (E25/E06)",
      { status: result.status, out: `${result.stdout}${result.stderr}` },
      1,
      ["REFUSING (E25)"],
    );
  }

  {
    const real = makeScratchRepo({ files: ["001_a.sql", "20260101000000_c.sql"] });
    const linkDir = join(real.repo, "supabase", "migrations-link");
    symlinkSync(real.migrationsDir, linkDir);
    setHistory([["001", false], ["20260101000000", false]]);
    check("a symlinked migrations directory is refused (E24)", runGate({ scratch: real, migrationsDir: linkDir }), 1, [
      "REFUSING (E24)",
    ]);
  }

  // ==== round-4 finding 1: a symlinked .sql ENTRY is refused, not skipped ==

  {
    // The target of the symlink lives OUTSIDE the migrations directory
    // entirely, proving the gate cannot simply "follow the link and
    // fingerprint the target" as a silent alternative -- there is nothing
    // canonical to fingerprint, and `supabase db push` would read whatever
    // this pathname currently resolves to, which the gate does not control.
    const withSymlinkedEntry = makeScratchRepo({ files: ["001_a.sql", "20260101000000_c.sql"] });
    const outsideTarget = join(workRoot, `symlink-target-${caseIndex}.sql`);
    writeFileSync(outsideTarget, "select 1;\n");
    const linkedEntryPath = join(withSymlinkedEntry.migrationsDir, "20260201000000_evil.sql");
    symlinkSync(outsideTarget, linkedEntryPath);
    setHistory([["001", false], ["20260101000000", false]]);
    check(
      "a symlinked .sql ENTRY inside an otherwise-canonical directory is refused, not silently omitted (E32)",
      runGate({ scratch: withSymlinkedEntry }),
      1,
      ["REFUSING (E32)", "20260201000000_evil.sql"],
    );
  }

  {
    // The failure mode this closes: entry.isFile() is false for a symlink,
    // so a version-blind filter would have dropped this file from the
    // gate's set entirely and printed a clean "Locally pending: 0" -- exit
    // 0 -- while `supabase db push` would still apply it. Confirm E32 fires
    // even though the symlink's TARGET content is fully legitimate and its
    // version would otherwise have been reported safe.
    const withSymlinkedEntry = makeScratchRepo({ files: ["001_a.sql", "20260101000000_c.sql"] });
    const outsideTarget = join(workRoot, `symlink-target-benign-${caseIndex}.sql`);
    writeFileSync(outsideTarget, "select 1;\n");
    symlinkSync(outsideTarget, join(withSymlinkedEntry.migrationsDir, "20260301000000_benign.sql"));
    setHistory([["001", false], ["20260101000000", false]]);
    check(
      "E32 fires even when the symlink's target content is otherwise unremarkable (no silent 'exit 0, pending 0')",
      runGate({ scratch: withSymlinkedEntry }),
      1,
      ["REFUSING (E32)"],
    );
  }

  // ==== round-3 P1-2: fingerprints bind CONTENT ===========================

  setHistory([["001", false], ["20260101000000", false]]);
  const fp = join(workRoot, "fingerprint.json");
  const fpScratch = makeScratchRepo({ files: ["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"] });
  check("the gate emits a fingerprint covering history AND content", runGate({ scratch: fpScratch, extraArgs: [`--emit-fingerprint=${fp}`] }), 0, [
    "Local content digest:",
    "Fingerprint written:",
  ]);
  check("re-verifying an UNCHANGED history and content passes", runGate({ scratch: fpScratch, extraArgs: [`--verify-fingerprint=${fp}`] }), 0, [
    "Local content digest:",
  ]);

  writeFileSync(join(fpScratch.migrationsDir, "20260201000000_new.sql"), "drop schema public cascade;\n");
  check(
    "P1-2: swapping the SQL BODY of an authorised version is refused before the push (E30)",
    runGate({ scratch: fpScratch, extraArgs: [`--verify-fingerprint=${fp}`] }),
    1,
    ["REFUSING (E30)", "Modified bytes: 20260201000000_new.sql"],
  );
  check(
    "P1-2: the same content swap is caught by post-push reconciliation (E30)",
    runGate({ scratch: fpScratch, extraArgs: [`--verify-applied=${fp}`] }),
    1,
    ["REFUSING (E30)", "a version number is not the migration"],
  );
  writeFileSync(join(fpScratch.migrationsDir, "20260201000000_new.sql"), "select 1;\n");

  insertHistory([["20260115000000", false]]);
  check(
    "history CHANGED between gate and push is refused (E26)",
    runGate({ scratch: fpScratch, extraArgs: [`--verify-fingerprint=${fp}`] }),
    1,
    ["REFUSING (E26)"],
  );
  check(
    "a missing fingerprint file is refused (E29)",
    runGate({ scratch: fpScratch, extraArgs: [`--verify-fingerprint=${join(workRoot, "nope.json")}`] }),
    1,
    ["REFUSING (E29)"],
  );

  // ==== round-3 P1-3: partial application =================================

  setHistory([["001", false], ["20260101000000", false]]);
  const partialFp = join(workRoot, "partial.json");
  const partialScratch = makeScratchRepo({
    files: ["001_a.sql", "20260101000000_c.sql", "20260201000000_one.sql", "20260202000000_two.sql"],
  });
  runGate({ scratch: partialScratch, extraArgs: [`--emit-fingerprint=${partialFp}`] });
  insertHistory([["20260201000000", false]]); // only the FIRST authorised migration landed
  check(
    "P1-3: a partially applied push is reported specifically (E31)",
    runGate({ scratch: partialScratch, extraArgs: [`--verify-applied=${partialFp}`] }),
    1,
    ["REFUSING (E31)", "PARTIAL APPLICATION", "Applied (1)", "NOT applied (1)"],
  );
  insertHistory([["20260202000000", false]]);
  check(
    "P1-3: reconciliation passes once the whole authorised set landed",
    runGate({ scratch: partialScratch, extraArgs: [`--verify-applied=${partialFp}`] }),
    0,
    ["post-push history matches exactly"],
  );
  psql("delete from supabase_migrations.schema_migrations where version in ('20260201000000','20260202000000');");
  check(
    "P1-3: a push that applied NOTHING reconciles cleanly and defers to the push status",
    runGate({ scratch: partialScratch, extraArgs: [`--verify-applied=${partialFp}`] }),
    0,
    ["None of the 2 authorised migration(s) were applied"],
  );
  insertHistory([["20260909000000", false]]);
  check(
    "P1-3: an unauthorised version appearing is refused (E27)",
    runGate({ scratch: partialScratch, extraArgs: [`--verify-applied=${partialFp}`] }),
    1,
    ["REFUSING (E27)", "Unexpected versions now present"],
  );

  // ==== end-to-end: guarded-db-push.sh, fully pinned identity =============

  const wrapperEnv = { ...pgEnv, PGUSER: `postgres.${PINNED_REF}` };

  function makeWrapperRepo(files, stubMode, { target = "institute-e2e", configureOrigin = false } = {}) {
    caseIndex += 1;
    const repo = join(workRoot, `wrapper-${caseIndex}`);
    mkdirSync(join(repo, "scripts", "migration-rehearsal"), { recursive: true });
    mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
    mkdirSync(join(repo, "stub-bin"), { recursive: true });
    for (const name of files) writeFileSync(join(repo, "supabase", "migrations", name), "select 1;\n");
    copyFileSync(GATE, join(repo, "scripts", "migration-rehearsal", "check-migration-safety.mjs"));
    copyFileSync(WRAPPER, join(repo, "scripts", "migration-rehearsal", "guarded-db-push.sh"));
    writeFileSync(
      join(repo, "scripts", "migration-rehearsal", "placeholder-baseline.json"),
      JSON.stringify({ targets: { [target]: pinnedTarget() } }, null, 2),
    );
    const log = join(repo, "supabase-stub.log");
    const psqlBin = binary("psql");
    // The stub emulates `db push --include-all`, and additionally records the
    // moment it starts (to MEASURE the verify-to-first-statement window) and
    // whether the wrapper's advisory lock is held while it runs.
    const applyExtra =
      stubMode === "extra"
        ? `  "${psqlBin}" -X -q -v ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations (version, statements, name) values ('20260909000000', array[]::text[], 'sneaky') on conflict (version) do nothing;"\n`
        : "";
    const swapContent =
      stubMode === "swap"
        ? `  echo "drop schema public cascade;" > "$(ls supabase/migrations/*.sql | tail -n 1)"\n`
        : "";
    const partialExit = stubMode === "partial" ? `  exit 3\n` : "";
    // Round-4 finding 2: after a genuinely successful push, kill the SAME
    // backend that holds the wrapper's advisory lock (found via pg_locks,
    // exactly how the wrapper itself identifies its own lock holder) and
    // exit 0. The push "succeeded"; the question is whether reconciliation
    // then blindly trusts that this run still has exclusive access, or
    // notices the lock is gone and refuses.
    const killLock =
      stubMode === "kill-lock"
        ? `  BACKEND_PID="\$("${psqlBin}" -X -q -t -A -c "select pid from pg_locks where locktype='advisory' and classid=778533 and objid=20260730 and objsubid=2 and granted limit 1")"\n` +
          `  "${psqlBin}" -X -q -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(\${BACKEND_PID})" >/dev/null\n` +
          `  for _ in 1 2 3 4 5 6 7 8 9 10; do\n` +
          `    STILL="\$("${psqlBin}" -X -q -t -A -c "select count(*) from pg_locks where locktype='advisory' and classid=778533 and objid=20260730 and objsubid=2 and granted and pid=\${BACKEND_PID}" 2>/dev/null || echo 0)"\n` +
          `    [ "\$STILL" = "0" ] && break\n` +
          `    sleep 0.2\n` +
          `  done\n`
        : "";
    const applyLoop =
      stubMode === "partial"
        ? `  for f in $(ls supabase/migrations/*.sql | head -n 3); do\n`
        : `  for f in supabase/migrations/*.sql; do\n`;
    writeFileSync(
      join(repo, "stub-bin", "supabase"),
      `#!/usr/bin/env bash
set -uo pipefail
{
  echo "argv=$*"
  echo "cwd=$PWD"
  echo "pgpassword-present=$([ -n "\${PGPASSWORD:-}" ] && echo yes || echo no)"
  echo "supabase-db-password-present=$([ -n "\${SUPABASE_DB_PASSWORD:-}" ] && echo yes || echo no)"
  echo "passwords-match=$([ "\${PGPASSWORD:-}" = "\${SUPABASE_DB_PASSWORD:-}" ] && echo yes || echo no)"
  if [ -n "\${PGPASSWORD:-}" ] && [[ "$*" == *"$PGPASSWORD"* ]]; then
    echo "password-in-argv=yes"
  else
    echo "password-in-argv=no"
  fi
  echo "stub-start-ms=$(node -e 'process.stdout.write(String(Date.now()))')"
  echo "lock-held=$("${psqlBin}" -X -q -t -A -c "select count(*) from pg_locks where locktype='advisory' and classid=778533 and objid=20260730 and objsubid=2 and granted" 2>/dev/null || echo ERR)"
  ls supabase/migrations
} >> "${log}"
if [ "\${1:-}" = "db" ] && [ "\${2:-}" = "push" ]; then
${applyLoop}    v="\$(basename "\$f" | cut -d_ -f1)"
    "${psqlBin}" -X -q -v ON_ERROR_STOP=1 -c \\
      "insert into supabase_migrations.schema_migrations (version, statements, name) \\
       values ('\$v', array[]::text[], 'stub') on conflict (version) do nothing;"
  done
${applyExtra}${swapContent}${killLock}${partialExit}fi
`,
    );
    execFileSync("chmod", ["+x", join(repo, "stub-bin", "supabase")]);
    const git = gitInit(repo);
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "wrapper scratch");
    const headSha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    let remote = null;
    if (configureOrigin) {
      remote = join(workRoot, `wrapper-origin-${caseIndex}.git`);
      execFileSync("git", ["init", "--bare", "-q", remote]);
      git("remote", "add", "origin", remote);
      git("push", "-q", "origin", "HEAD:refs/heads/main");
    }
    return { repo, log, git, headSha, remote };
  }

  function runWrapper(repo, args, extraEnv = {}) {
    const result = spawnSync("bash", [join(repo, "scripts", "migration-rehearsal", "guarded-db-push.sh"), ...args], {
      env: { ...wrapperEnv, PATH: `${join(repo, "stub-bin")}:${process.env.PATH}`, ...extraEnv },
      encoding: "utf8",
    });
    return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }

  function productionWrapper(files = ["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"]) {
    return makeWrapperRepo(files, "normal", {
      target: "institute-production",
      configureOrigin: true,
    });
  }

  function productionEnv(expectedSha) {
    return {
      GUARDED_PUSH_EXPECTED_GIT_SHA: expectedSha,
      PGPASSWORD: "synthetic-password-sentinel",
      SUPABASE_DB_PASSWORD: "synthetic-password-sentinel",
    };
  }

  function stubLogOrEmpty(wrapper) {
    return existsSync(wrapper.log) ? readFileSync(wrapper.log, "utf8") : "";
  }

  function assertProductionRefusal(
    label,
    wrapper,
    messages,
    { expectedSha = wrapper.headSha, extraEnv = {}, expectedStatus = 75 } = {},
  ) {
    const run = runWrapper(
      wrapper.repo,
      ["--target=institute-production"],
      { ...productionEnv(expectedSha), ...extraEnv },
    );
    check(`production E2E: ${label} refuses before invoking Supabase`, run, expectedStatus, messages);
    const stubLog = stubLogOrEmpty(wrapper);
    check(`production E2E: ${label} never invokes Supabase`, {
      status: stubLog === "" ? 0 : 1,
      out: stubLog,
    }, 0);
  }

  function assertHiddenTrackedMigrationRefuses(indexFlag, label) {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    const path = "supabase/migrations/20260201000000_new.sql";
    wrapper.git("update-index", indexFlag, path);
    writeFileSync(join(wrapper.repo, path), "select 999;\n");
    assertProductionRefusal(label, wrapper, [
      "REFUSING (E33)",
      "On-disk migration filenames or bytes differ from the reviewed git HEAD tree",
    ], { expectedStatus: 1 });
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    const run = runWrapper(
      wrapper.repo,
      ["--target=institute-production"],
      { ...productionEnv(wrapper.headSha), SUPABASE_DB_PASSWORD: "conflicting-ambient-password" },
    );
    check("production E2E: matching local, expected, and remote SHAs reach the guarded push", run, 0, [
      "tested SHA is still the exact current origin/main",
      "post-push history matches exactly",
    ]);
    const stubLog = stubLogOrEmpty(wrapper);
    check(
      "production E2E: push argv is password-free and the CLI password is rebound to the gate password",
      {
        status:
          stubLog.includes("password-in-argv=no") &&
          stubLog.includes("pgpassword-present=yes") &&
          stubLog.includes("supabase-db-password-present=yes") &&
          stubLog.includes("passwords-match=yes") &&
          !stubLog.includes("synthetic-password-sentinel") &&
          /argv=db push --include-all --db-url postgresql:\/\/postgres\.[a-z]+@[^\s]+\/postgres --yes/.test(stubLog)
            ? 0
            : 1,
        out: stubLog,
      },
      0,
    );
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    writeFileSync(join(wrapper.repo, "supabase", "migrations", "20260201000000_new.sql"), "select 999;\n");
    assertProductionRefusal("dirty tracked migration", wrapper, [
      "REFUSING (E33)",
      "On-disk migration filenames or bytes differ from the reviewed git HEAD tree",
    ], { expectedStatus: 1 });
  }

  assertHiddenTrackedMigrationRefuses("--assume-unchanged", "assume-unchanged tracked migration");
  assertHiddenTrackedMigrationRefuses("--skip-worktree", "skip-worktree tracked migration");

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    writeFileSync(join(wrapper.repo, "supabase", "migrations", "20260301000000_untracked.sql"), "select 999;\n");
    assertProductionRefusal("ordinary untracked migration", wrapper, [
      "REFUSING (E33)",
      "On-disk migration filenames or bytes differ from the reviewed git HEAD tree",
    ], { expectedStatus: 1 });
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    const ignoredName = "20260301000000_ignored.sql";
    writeFileSync(join(wrapper.repo, ".git", "info", "exclude"), `supabase/migrations/${ignoredName}\n`);
    writeFileSync(join(wrapper.repo, "supabase", "migrations", ignoredName), "select 999;\n");
    assertProductionRefusal(".git/info/exclude migration", wrapper, [
      "REFUSING (E33)",
      "On-disk migration filenames or bytes differ from the reviewed git HEAD tree",
    ], { expectedStatus: 1 });
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    const ignoredName = "20260401000000_global_ignored.sql";
    const globalExcludes = join(workRoot, `global-excludes-${caseIndex}`);
    const globalConfig = join(workRoot, `global-config-${caseIndex}`);
    writeFileSync(globalExcludes, `supabase/migrations/${ignoredName}\n`);
    writeFileSync(globalConfig, `[core]\n\texcludesfile = ${globalExcludes}\n`);
    writeFileSync(join(wrapper.repo, "supabase", "migrations", ignoredName), "select 999;\n");
    assertProductionRefusal("global-ignore migration", wrapper, [
      "REFUSING (E33)",
      "On-disk migration filenames or bytes differ from the reviewed git HEAD tree",
    ], { extraEnv: { GIT_CONFIG_GLOBAL: globalConfig }, expectedStatus: 1 });
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    writeFileSync(join(wrapper.repo, "remote-advance.txt"), "new main\n");
    wrapper.git("add", "remote-advance.txt");
    wrapper.git("commit", "-q", "-m", "advance remote main");
    wrapper.git("push", "-q", "origin", "HEAD:refs/heads/main");
    wrapper.git("checkout", "-q", "--detach", wrapper.headSha);
    assertProductionRefusal("stale remote main", wrapper, [
      "tested SHA is no longer the exact current origin/main",
    ]);
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    writeFileSync(join(wrapper.repo, "local-only.txt"), "wrong local\n");
    wrapper.git("add", "local-only.txt");
    wrapper.git("commit", "-q", "-m", "advance local only");
    assertProductionRefusal("wrong local HEAD", wrapper, [
      "tested SHA is no longer the exact current origin/main",
    ]);
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = productionWrapper();
    assertProductionRefusal("wrong expected SHA", wrapper, [
      "tested SHA is no longer the exact current origin/main",
    ], { expectedSha: "0000000000000000000000000000000000000000" });
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"], "normal");
    const run = runWrapper(wrapper.repo, ["--target=institute-e2e"]);
    check("E2E: gate -> verify -> push -> reconcile with fully pinned identity exits 0", run, 0, [
      "advisory lock held by backend pid",
      "running the migration safety gate before any write",
      "re-verifying history and migration bytes immediately before the push",
      "reconciling post-push history against what the gate authorised",
      "post-push history matches exactly",
      "(pinned, matched)",
    ]);
    const stubLog = readFileSync(wrapper.log, "utf8");
    check(
      "E2E: the push read the SAME canonical migrations directory the gate approved",
      { status: stubLog.includes(`cwd=${wrapper.repo}`) && stubLog.includes("20260201000000_new.sql") ? 0 : 1, out: stubLog },
      0,
    );
    check(
      "E2E: the advisory lock was HELD while the push ran",
      { status: /lock-held=1/.test(stubLog) ? 0 : 1, out: stubLog },
      0,
    );
    const verifyMs = Number(/verify complete at (\d+) ms/.exec(run.out)?.[1] ?? 0);
    const stubMs = Number(/stub-start-ms=(\d+)/.exec(stubLog)?.[1] ?? 0);
    if (verifyMs && stubMs) {
      notes.push(
        `MEASURED verify-to-first-statement window: ${stubMs - verifyMs} ms ` +
          "(local stub; a real Supabase CLI over the network will be larger)",
      );
    }
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"], "extra");
    check(
      "E2E: an unauthorised version applied during the push fails the run (E27)",
      runWrapper(wrapper.repo, ["--target=institute-e2e"]),
      1,
      ["REFUSING (E27)", "20260909000000"],
    );
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(
      ["001_a.sql", "20260101000000_c.sql", "20260201000000_one.sql", "20260202000000_two.sql"],
      "partial",
    );
    const run = runWrapper(wrapper.repo, ["--target=institute-e2e"]);
    check(
      "E2E P1-3: a push that applies part of the set and FAILS still reconciles, and reports E31",
      run,
      1,
      ["the push FAILED with status 3", "Reconciling anyway", "REFUSING (E31)", "PARTIAL APPLICATION"],
    );
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"], "swap");
    check(
      "E2E P1-2: migration bytes rewritten DURING the push are caught by reconciliation (E33)",
      runWrapper(wrapper.repo, ["--target=institute-e2e"]),
      1,
      ["REFUSING (E33)"],
    );
  }

  {
    // Round-4 finding 2: the lock-holding connection drops DURING the push
    // (killed backend, network blip, idle timeout -- indistinguishable to
    // the wrapper from any other cause). The push itself completes and the
    // stub exits 0. Before this fix, the wrapper would proceed straight to
    // reconciliation trusting the one-time lock confirmation from minutes
    // earlier; a competing sanctioned wrapper could already be racing it.
    // Assert the wrapper instead notices, immediately before reconciliation,
    // that its own backend pid no longer holds the lock, and fails closed
    // (exit 75) rather than reconciling on a stale belief.
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"], "kill-lock");
    const run = runWrapper(wrapper.repo, ["--target=institute-e2e"]);
    check(
      "E2E round-4 finding 2: the lock dropping DURING the push is detected before reconciliation and fails closed",
      run,
      75,
      [
        "advisory lock held by backend pid",
        "the advisory lock held by backend pid",
        "is GONE,",
        "checked immediately before reconciliation",
        "Refusing rather than proceeding",
        "unprotected on a stale belief that the lock is still ours.",
      ],
    );
    // The push itself must have actually run (proving this is a genuine
    // post-push detection, not a pre-push short-circuit that never reached
    // the stub at all).
    const stubLog = readFileSync(wrapper.log, "utf8");
    check("E2E round-4 finding 2: the push genuinely ran before the lock loss was detected", {
      status: stubLog.includes("20260201000000_new.sql") ? 0 : 1,
      out: stubLog,
    }, 0);
    // And reconciliation's own gate call (--verify-applied) must NEVER have
    // run: the wrapper must refuse before invoking it, not merely fail
    // inside it.
    check(
      "E2E round-4 finding 2: the gate's own reconciliation step never ran (refused before it, not inside it)",
      { status: run.out.includes("reconciling post-push history against what the gate authorised") ? 1 : 0, out: run.out },
      0,
    );
  }

  {
    // Round-3 P1-5: prove the advisory lock actually serialises sanctioned runs.
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"], "normal");
    const holder = spawn(
      binary("psql"),
      ["-X", "-q", "-t", "-A", "-c", "select pg_advisory_lock(778533, 20260730)", "-f", "-"],
      { env: pgEnv, stdio: ["pipe", "ignore", "ignore"] },
    );
    // Wait until the competing holder really has it.
    let holderHasLock = false;
    for (let attempt = 0; attempt < 40 && !holderHasLock; attempt += 1) {
      await new Promise((done) => setTimeout(done, 100));
      holderHasLock =
        psqlScalar(
          "select count(*) from pg_locks where locktype='advisory' and classid=778533 and objid=20260730 and objsubid=2 and granted",
        ) === "1";
    }
    const blockedStart = Date.now();
    const blocked = runWrapper(wrapper.repo, ["--target=institute-e2e"], { GUARDED_PUSH_LOCK_WAIT_SECONDS: "4" });
    check(
      "E2E P1-5: a second sanctioned wrapper REFUSES rather than racing a held lock",
      blocked,
      75,
      ["could not confirm the advisory lock", "Another sanctioned migration run is probably in progress"],
    );
    notes.push(
      `competing wrapper refused after ${Date.now() - blockedStart} ms (lock wait bound 4s); ` +
        `holder had the lock: ${holderHasLock}`,
    );
    holder.stdin.end();
    holder.kill();
    await new Promise((done) => setTimeout(done, 500));
    const after = runWrapper(wrapper.repo, ["--target=institute-e2e"]);
    check("E2E P1-5: the same wrapper succeeds once the lock is released", after, 0, [
      "advisory lock held by backend pid",
      "post-push history matches exactly",
    ]);
  }

  {
    const wrapper = makeWrapperRepo(["001_a.sql"], "normal");
    check(
      "P1-1: the wrapper has no migrations-directory / baseline / test-mode option",
      runWrapper(wrapper.repo, ["--target=institute-e2e", "--migrations-dir=/tmp/elsewhere"]),
      64,
      ["unrecognised argument", "no migrations-directory, baseline, repo-root or test-mode"],
    );
    check(
      "P1-1: the wrapper rejects --test-mode outright",
      runWrapper(wrapper.repo, ["--target=institute-e2e", "--test-mode"]),
      64,
      ["unrecognised argument"],
    );
  }

  {
    // The bypass that used to ship: an unbound target selected through the wrapper.
    caseIndex += 1;
    const repo = join(workRoot, `wrapper-unbound-${caseIndex}`);
    mkdirSync(join(repo, "scripts", "migration-rehearsal"), { recursive: true });
    mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
    mkdirSync(join(repo, "stub-bin"), { recursive: true });
    writeFileSync(join(repo, "supabase", "migrations", "001_a.sql"), "select 1;\n");
    copyFileSync(GATE, join(repo, "scripts", "migration-rehearsal", "check-migration-safety.mjs"));
    copyFileSync(WRAPPER, join(repo, "scripts", "migration-rehearsal", "guarded-db-push.sh"));
    writeFileSync(
      join(repo, "scripts", "migration-rehearsal", "placeholder-baseline.json"),
      JSON.stringify({ targets: { "local-rehearsal": UNBOUND_TARGET } }, null, 2),
    );
    writeFileSync(join(repo, "stub-bin", "supabase"), "#!/usr/bin/env bash\necho STUB-PUSH-RAN\n");
    execFileSync("chmod", ["+x", join(repo, "stub-bin", "supabase")]);
    const git = gitInit(repo);
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "unbound target");
    setHistory([["001", false]]);
    const run = runWrapper(repo, ["--target=local-rehearsal"]);
    const neverPushed = !run.out.includes("STUB-PUSH-RAN");
    check(
      "P1-1: the wrapper CANNOT use an unbound-identity target (E06, and the push never ran)",
      { status: run.status === 0 || !neverPushed ? 1 : run.status, out: run.out },
      1,
      ["REFUSING (E06)", "does NOT disable the identity check"],
    );
  }
} finally {
  stopCluster();
}

const failed = results.filter((entry) => !entry.ok);
console.log("");
for (const note of notes) console.log(`NOTE  ${note}`);
console.log("");
console.log(`${results.length - failed.length}/${results.length} gate scenarios passed.`);
if (failed.length > 0) {
  console.log("FAILED:");
  for (const entry of failed) console.log(`  - ${entry.name}`);
  process.exit(1);
}
