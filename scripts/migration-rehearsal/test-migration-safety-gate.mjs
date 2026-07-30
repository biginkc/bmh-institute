#!/usr/bin/env node
// Executable proof for scripts/migration-rehearsal/check-migration-safety.mjs
// and scripts/migration-rehearsal/guarded-db-push.sh.
//
// Spins ONE disposable local PostgreSQL cluster (never a hosted project, never
// production), rewrites supabase_migrations.schema_migrations per scenario, and
// runs the real gate as a child process, asserting on its exit code and the
// exit-path id it prints.
//
// Because the gate now reads its baseline out of git's object store rather than
// the filesystem, every scenario builds a disposable scratch git repo holding a
// committed baseline plus a migrations directory, and points the gate at it with
// the test-only --repo-root override.
//
// The final block is a true end-to-end run of guarded-db-push.sh inside a
// scratch repo, with a stub `supabase` on PATH that records which directory it
// read and emulates `db push --include-all` against the same cluster. That is
// what proves the gate and the push cannot target different directories.
//
// The cluster uses LC_ALL=C and a short socket path: without both, fresh local
// clusters on this machine fail to start with "postmaster became multithreaded".
//
// Run: npm run test:migration-gate:postgres

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, "check-migration-safety.mjs");
const WRAPPER = resolve(HERE, "guarded-db-push.sh");

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
  insertHistory(rows);
}

function insertHistory(rows) {
  const values = rows
    .map(([version, placeholder]) =>
      `('${version}', ${placeholder ? "null" : "array[]::text[]"}, 'n_${version}')`,
    )
    .join(", ");
  psql(
    `insert into supabase_migrations.schema_migrations (version, statements, name) values ${values};`,
  );
}

const LOCAL_TARGET = {
  project_ref: null,
  database: null,
  db_system_identifier: null,
  placeholder_versions: [],
};
const DEFAULT_BASELINE = { targets: { "local-rehearsal": LOCAL_TARGET } };

let caseIndex = 0;

/**
 * Builds a disposable git repo containing a committed baseline and a migrations
 * directory, mirroring the real repo layout the gate derives its canonical paths
 * from.
 */
function makeScratchRepo({ baseline = DEFAULT_BASELINE, files = [], commitBaseline = true, extraFiles = [] } = {}) {
  caseIndex += 1;
  const repo = join(workRoot, `repo-${caseIndex}`);
  mkdirSync(join(repo, "scripts", "migration-rehearsal"), { recursive: true });
  if (files !== null) {
    mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
    for (const name of files) writeFileSync(join(repo, "supabase", "migrations", name), "select 1;\n");
  }
  const baselinePath = join(repo, "scripts", "migration-rehearsal", "placeholder-baseline.json");
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  for (const [relPath, content] of extraFiles) {
    mkdirSync(dirname(join(repo, relPath)), { recursive: true });
    writeFileSync(join(repo, relPath), content);
  }
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
  git("init", "-q");
  if (commitBaseline) {
    git("add", "-A");
    git("commit", "-q", "-m", "scratch baseline");
  } else {
    // Commit something so HEAD exists, but leave the baseline untracked.
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
  omitRepoRoot = false,
} = {}) {
  const built = scratch ?? makeScratchRepo({ baseline, files, commitBaseline });
  const args = [GATE];
  if (target !== null) args.push(`--target=${target}`);
  if (!omitRepoRoot) args.push(`--repo-root=${built.repo}`);
  args.push(`--migrations-dir=${migrationsDir ?? built.migrationsDir}`);
  args.push(`--baseline=${baselinePath ?? built.baselinePath}`);
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

  // 1. Pass case: a genuinely newer pending migration.
  setHistory([["001", false], ["002", false], ["20260101000000", false]]);
  check(
    "pass: genuinely newer pending migration exits 0",
    runGate({ files: ["001_a.sql", "002_b.sql", "20260101000000_c.sql", "20260201000000_new.sql"] }),
    0,
    ["Locally pending:           1", "20260201000000_new.sql"],
  );

  // 2. The 2026-07-30 incident replay.
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

  // 3/4. Empty and missing migrations directories.
  setHistory([["001", false], ["20260101000000", false]]);
  check("empty migrations directory exits 1 (E08)", runGate({ files: [] }), 1, ["REFUSING (E08)", "ZERO .sql files"]);
  check(
    "missing migrations directory exits 1 (E07)",
    runGate({ files: null, migrationsDir: join(workRoot, "absent-dir") }),
    1,
    ["REFUSING (E07)"],
  );

  // 5. Formatting collisions.
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
  setHistory([["1", false], ["2", false], ["20260101000000", false]]);
  check(
    'formatting collision "001" vs "1": already applied, not pending',
    runGate({ files: ["001_new.sql", "002_b.sql", "20260101000000_c.sql"] }),
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

  // 6. Mixed legacy/timestamp namespaces.
  setHistory([["001", false], ["052", false], ["20260721231125", false], ["20260730130000", false]]);
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

  setHistory([["20260101000000", false]]);
  check(
    "ambiguous ordering (unpadded legacy vs timestamp) exits 1 (E12)",
    runGate({ files: ["9_late.sql", "20260101000000_c.sql"] }),
    1,
    ["REFUSING (E12)"],
  );

  // 7. Placeholder baseline behaviour.
  const acknowledged = {
    targets: {
      "local-rehearsal": {
        ...LOCAL_TARGET,
        placeholder_versions: ["20260722130000", "20260728230000"],
      },
    },
  };
  setHistory([
    ["001", false],
    ["20260722130000", true],
    ["20260728230000", true],
    ["20260730130000", false],
  ]);
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

  setHistory([["001", true], ["002", true], ["003", true], ["20260730130000", false]]);
  check(
    "repair-created placeholders, once acknowledged, do not freeze the repo",
    runGate({
      files: ["001_a.sql", "002_b.sql", "003_c.sql", "20260730130000_d.sql", "20260731000000_new.sql"],
      baseline: {
        targets: { "local-rehearsal": { ...LOCAL_TARGET, placeholder_versions: ["001", "002", "003"] } },
      },
    }),
    0,
    ["3 acknowledged, 0 new", "Locally pending:           1"],
  );

  // 8. Remote-state failure modes.
  setHistory(null);
  check("schema_migrations absent exits 1 (E14)", runGate({ files: ["001_a.sql"] }), 1, ["REFUSING (E14)"]);
  setHistory([]);
  check("schema_migrations with zero rows exits 1 (E17)", runGate({ files: ["001_a.sql"] }), 1, [
    "REFUSING (E17)",
    "ZERO rows",
  ]);

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

  check(
    "refused connection exits 1 (E14 or E28 at the identity probe)",
    runGate({
      files: ["001_a.sql"],
      env: { PGHOST: "127.0.0.1", PGPORT: "1" },
      extraArgs: ["--timeout-ms=6000"],
    }),
    1,
    ["REFUSING (E28)"],
  );

  check("missing PGPASSWORD exits 1 (E03)", runGate({ files: ["001_a.sql"], env: { PGPASSWORD: "" } }), 1, [
    "REFUSING (E03)",
    "PGPASSWORD",
  ]);
  check("missing --target exits 1 (E02)", runGate({ files: ["001_a.sql"], target: null }), 1, ["REFUSING (E02)"]);
  check("unknown target exits 1 (E05)", runGate({ files: ["001_a.sql"], target: "not-a-real-target" }), 1, [
    "REFUSING (E05)",
  ]);

  // 9. Malformed inputs.
  check("non-numeric migration filename exits 1 (E09)", runGate({ files: ["001_a.sql", "hotfix_b.sql"] }), 1, [
    "REFUSING (E09)",
  ]);
  check(
    "over-long numeric version exits 1 (E10)",
    runGate({ files: ["001_a.sql", "202607301300001234_b.sql"] }),
    1,
    ["REFUSING (E10)"],
  );
  check("two local files normalising to the same version exits 1 (E11)", runGate({ files: ["001_a.sql", "1_b.sql"] }), 1, [
    "REFUSING (E11)",
  ]);
  setHistory([["001", false], ["draft-x", false]]);
  check("malformed history version exits 1 (E18)", runGate({ files: ["001_a.sql"] }), 1, ["REFUSING (E18)"]);
  setHistory([["001", false]]);
  check("unknown CLI option exits 1 (E01)", runGate({ files: ["001_a.sql"], extraArgs: ["--force"] }), 1, [
    "REFUSING (E01)",
  ]);

  // ==== round-2 findings ==================================================

  // P1-4: baseline provenance. The bytes must be the committed blob.
  setHistory([["001", false], ["20260730130000", true]]);
  const untracked = makeScratchRepo({
    baseline: { targets: { "local-rehearsal": { ...LOCAL_TARGET, placeholder_versions: ["20260730130000"] } } },
    files: ["001_a.sql", "20260730130000_d.sql"],
    commitBaseline: false,
  });
  check(
    "P1-4: an UNTRACKED baseline cannot acknowledge a placeholder (E04)",
    runGate({ scratch: untracked }),
    1,
    ["REFUSING (E04)", "COMMITTED at the current HEAD"],
  );

  const symlinked = makeScratchRepo({ files: ["001_a.sql", "20260730130000_d.sql"], commitBaseline: false });
  {
    // A symlink at the baseline path pointing at an attacker-controlled file.
    const evil = join(workRoot, `evil-baseline-${caseIndex}.json`);
    writeFileSync(
      evil,
      JSON.stringify({
        targets: { "local-rehearsal": { ...LOCAL_TARGET, placeholder_versions: ["20260730130000"] } },
      }),
    );
    rmSync(symlinked.baselinePath, { force: true });
    symlinkSync(evil, symlinked.baselinePath);
  }
  check(
    "P1-4: a SYMLINKED baseline cannot acknowledge a placeholder (E04)",
    runGate({ scratch: symlinked }),
    1,
    ["REFUSING (E04)"],
  );

  {
    // Committed baseline acknowledges nothing; the WORKING TREE copy is then
    // rewritten to acknowledge the new placeholder. The gate must ignore it.
    const swapped = makeScratchRepo({ files: ["001_a.sql", "20260730130000_d.sql"] });
    writeFileSync(
      swapped.baselinePath,
      JSON.stringify({
        targets: { "local-rehearsal": { ...LOCAL_TARGET, placeholder_versions: ["20260730130000"] } },
      }),
    );
    check(
      "P1-4: a working-tree edit to the baseline has NO effect; git HEAD wins (E21)",
      runGate({ scratch: swapped }),
      1,
      ["REFUSING (E21)", "20260730130000"],
    );
  }

  {
    // Same repo, but the acknowledgement is COMMITTED -> accepted.
    const committed = makeScratchRepo({
      baseline: { targets: { "local-rehearsal": { ...LOCAL_TARGET, placeholder_versions: ["20260730130000"] } } },
      files: ["001_a.sql", "20260730130000_d.sql", "20260731000000_new.sql"],
    });
    check(
      "P1-4: a COMMITTED acknowledgement is accepted (the workflow still works)",
      runGate({ scratch: committed }),
      0,
      ["1 acknowledged, 0 new"],
    );
  }

  {
    const outside = makeScratchRepo({ files: ["001_a.sql"] });
    check(
      "P1-4: a baseline outside the repo root is refused (E04)",
      runGate({ scratch: outside, baselinePath: join(workRoot, "outside-baseline.json") }),
      1,
      ["REFUSING (E04)", "outside the repository root"],
    );
  }

  {
    const missingKey = makeScratchRepo({
      baseline: {
        targets: { "local-rehearsal": { project_ref: null, database: null, placeholder_versions: [] } },
      },
      files: ["001_a.sql"],
    });
    check(
      "P1-4: a baseline missing an identity key is refused, not silently defaulted (E05)",
      runGate({ scratch: missingKey }),
      1,
      ["REFUSING (E05)", "db_system_identifier"],
    );
  }

  // P1-2: identity is parsed exactly, never substring-matched.
  setHistory([["001", false]]);
  const pinnedRef = "dhvfsyteqsxagokoerrx";
  const pinnedBaseline = (overrides = {}) => ({
    targets: {
      "local-rehearsal": {
        project_ref: pinnedRef,
        database: "postgres",
        db_system_identifier: null,
        placeholder_versions: [],
        ...overrides,
      },
    },
  });
  check(
    "P1-2: a hostname that merely CONTAINS the project ref is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: pinnedBaseline(),
      env: { PGHOST: `db.${pinnedRef}.supabase.co.attacker.example`, PGUSER: "postgres" },
    }),
    1,
    ["REFUSING (E06)", "never inferred from a substring"],
  );
  check(
    "P1-2: a username that merely CONTAINS the project ref is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: pinnedBaseline(),
      env: { PGUSER: `postgres.${pinnedRef}x` },
    }),
    1,
    ["REFUSING (E06)"],
  );
  check(
    "P1-2: PGUSER and PGHOST declaring DIFFERENT refs is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: pinnedBaseline(),
      env: { PGUSER: `postgres.${pinnedRef}`, PGHOST: "db.jvaabkchkihkjllehmft.supabase.co" },
    }),
    1,
    ["REFUSING (E06)"],
  );
  check(
    "P1-2: PGDATABASE not matching the target is refused (E06)",
    runGate({
      files: ["001_a.sql"],
      baseline: { targets: { "local-rehearsal": { ...LOCAL_TARGET, database: "app_production" } } },
    }),
    1,
    ["REFUSING (E06)", "PGDATABASE"],
  );

  // P1-2: the LIVE cluster identity is interrogated, not merely declared.
  const liveSystemIdentifier = execFileSync(
    binary("psql"),
    ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", "select system_identifier::text from pg_control_system();"],
    { env: pgEnv, encoding: "utf8" },
  ).trim();
  check(
    "P1-2: a pinned cluster system_identifier that MATCHES the live cluster passes",
    runGate({
      files: ["001_a.sql"],
      baseline: {
        targets: { "local-rehearsal": { ...LOCAL_TARGET, db_system_identifier: liveSystemIdentifier } },
      },
    }),
    0,
    ["(pinned, matched)"],
  );
  check(
    "P1-2: a pinned cluster system_identifier that does NOT match is refused (E28)",
    runGate({
      files: ["001_a.sql"],
      baseline: {
        targets: { "local-rehearsal": { ...LOCAL_TARGET, db_system_identifier: "1234567890123456789" } },
      },
    }),
    1,
    ["REFUSING (E28)", "not the physical database"],
  );

  // P1-1: canonical-path enforcement.
  check(
    "P1-1: --enforce-canonical-paths rejects a non-canonical migrations directory (E25)",
    runGate({
      files: ["001_a.sql"],
      extraArgs: ["--enforce-canonical-paths"],
      omitRepoRoot: true,
    }),
    1,
    ["REFUSING (E25)", "canonical migrations directory"],
  );
  check(
    "P1-1: --enforce-canonical-paths refuses to accept the test-only --repo-root override (E25)",
    runGate({ files: ["001_a.sql"], extraArgs: ["--enforce-canonical-paths"] }),
    1,
    ["REFUSING (E25)", "--repo-root"],
  );

  {
    // A symlinked migrations directory: the gate would inspect one directory
    // while `supabase db push` reads whatever the repository path really holds.
    const real = makeScratchRepo({ files: ["001_a.sql", "20260101000000_c.sql"] });
    const linkDir = join(real.repo, "supabase", "migrations-link");
    symlinkSync(real.migrationsDir, linkDir);
    setHistory([["001", false], ["20260101000000", false]]);
    check(
      "P1-1: a symlinked migrations directory is refused (E24)",
      runGate({ scratch: real, migrationsDir: linkDir }),
      1,
      ["REFUSING (E24)", "symlink"],
    );
  }

  // P1-3: history fingerprints.
  setHistory([["001", false], ["20260101000000", false]]);
  const fingerprintPath = join(workRoot, "fingerprint.json");
  const emitScratch = makeScratchRepo({ files: ["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"] });
  check(
    "P1-3: the gate emits a history fingerprint",
    runGate({ scratch: emitScratch, extraArgs: [`--emit-fingerprint=${fingerprintPath}`] }),
    0,
    ["Fingerprint written:"],
  );
  check(
    "P1-3: re-verifying an UNCHANGED history passes",
    runGate({ scratch: emitScratch, extraArgs: [`--verify-fingerprint=${fingerprintPath}`] }),
    0,
    ["History digest:"],
  );
  insertHistory([["20260115000000", false]]);
  check(
    "P1-3: history CHANGED between gate and push is refused (E26)",
    runGate({ scratch: emitScratch, extraArgs: [`--verify-fingerprint=${fingerprintPath}`] }),
    1,
    ["REFUSING (E26)", "CHANGED between the safety gate and the push"],
  );
  check(
    "P1-3: a missing fingerprint file is refused (E29)",
    runGate({ scratch: emitScratch, extraArgs: [`--verify-fingerprint=${join(workRoot, "nope.json")}`] }),
    1,
    ["REFUSING (E29)"],
  );

  // P1-3: post-push reconciliation.
  setHistory([["001", false], ["20260101000000", false]]);
  const reconcilePath = join(workRoot, "reconcile.json");
  const reconcileScratch = makeScratchRepo({
    files: ["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"],
  });
  runGate({ scratch: reconcileScratch, extraArgs: [`--emit-fingerprint=${reconcilePath}`] });
  insertHistory([["20260201000000", false]]); // exactly what the gate authorised
  check(
    "P1-3: post-push reconciliation passes when only the authorised set was applied",
    runGate({ scratch: reconcileScratch, extraArgs: [`--verify-applied=${reconcilePath}`] }),
    0,
    ["post-push history matches exactly"],
  );
  insertHistory([["20260202000000", false]]); // something else changed history
  check(
    "P1-3: post-push reconciliation catches an unauthorised history change (E27)",
    runGate({ scratch: reconcileScratch, extraArgs: [`--verify-applied=${reconcilePath}`] }),
    1,
    ["REFUSING (E27)", "Unexpected versions now present"],
  );

  // ==== end-to-end: guarded-db-push.sh ====================================
  // Proves the chain gate -> verify -> push -> reconcile actually runs, and that
  // the push reads the SAME directory the gate approved. A stub `supabase` on
  // PATH records its working directory and the migrations it saw, then emulates
  // `db push --include-all` against this cluster.

  function makeWrapperRepo(files, stubMode) {
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
      JSON.stringify(DEFAULT_BASELINE, null, 2),
    );
    const log = join(repo, "supabase-stub.log");
    // The stub emulates `db push --include-all`: insert every local version that
    // history does not already have. `extra` additionally applies a version the
    // gate never authorised, to prove post-push reconciliation catches it.
    writeFileSync(
      join(repo, "stub-bin", "supabase"),
      `#!/usr/bin/env bash
set -euo pipefail
{ echo "argv=$*"; echo "cwd=$PWD"; ls supabase/migrations; } >> "${log}"
if [ "\${1:-}" = "db" ] && [ "\${2:-}" = "push" ]; then
  for f in supabase/migrations/*.sql; do
    v="\$(basename "\$f" | cut -d_ -f1)"
    "${binary("psql")}" -X -q -v ON_ERROR_STOP=1 -c \\
      "insert into supabase_migrations.schema_migrations (version, statements, name) \\
       values ('\$v', array[]::text[], 'stub') on conflict (version) do nothing;"
  done
${
  stubMode === "extra"
    ? `  "${binary("psql")}" -X -q -v ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations (version, statements, name) values ('20260909000000', array[]::text[], 'sneaky') on conflict (version) do nothing;"\n`
    : ""
}fi
`,
    );
    execFileSync("chmod", ["+x", join(repo, "stub-bin", "supabase")]);
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
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "wrapper scratch");
    return { repo, log };
  }

  function runWrapper(repo, args) {
    const result = spawnSync("bash", [join(repo, "scripts", "migration-rehearsal", "guarded-db-push.sh"), ...args], {
      env: { ...pgEnv, PATH: `${join(repo, "stub-bin")}:${process.env.PATH}` },
      encoding: "utf8",
    });
    return { status: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"], "normal");
    const run = runWrapper(wrapper.repo, ["--target=local-rehearsal"]);
    check("E2E: guarded-db-push runs gate -> verify -> push -> reconcile and exits 0", run, 0, [
      "running the migration safety gate before any write",
      "re-verifying history immediately before the push",
      "reconciling post-push history against what the gate authorised",
      "post-push history matches exactly",
    ]);
    const stubLog = execFileSync("cat", [wrapper.log], { encoding: "utf8" });
    const sawCanonicalDir = stubLog.includes(`cwd=${wrapper.repo}`) && stubLog.includes("20260201000000_new.sql");
    check(
      "E2E: the push read the SAME canonical migrations directory the gate approved",
      { status: sawCanonicalDir ? 0 : 1, out: stubLog },
      0,
      [],
    );
  }

  {
    setHistory([["001", false], ["20260101000000", false]]);
    const wrapper = makeWrapperRepo(["001_a.sql", "20260101000000_c.sql", "20260201000000_new.sql"], "extra");
    const run = runWrapper(wrapper.repo, ["--target=local-rehearsal"]);
    check(
      "E2E: an unauthorised version applied during the push fails the run (E27)",
      run,
      1,
      ["REFUSING (E27)", "20260909000000"],
    );
  }

  {
    const wrapper = makeWrapperRepo(["001_a.sql"], "normal");
    check(
      "P1-1 E2E: the wrapper has no migrations-directory option at all",
      runWrapper(wrapper.repo, ["--target=local-rehearsal", "--migrations-dir=/tmp/elsewhere"]),
      64,
      ["unrecognised argument", "must", "read the same directory"],
    );
  }
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
