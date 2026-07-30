import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = import.meta.dirname;
const read = (name) => readFileSync(resolve(root, name), "utf8");

test("the equivalence map binds the exact ten legacy and numbered versions", () => {
  const mappings = JSON.parse(read("legacy-map.json"));
  assert.deepEqual(
    mappings.map(({ legacy_version, numbered_version }) => [
      legacy_version,
      numbered_version,
    ]),
    [
      ["20260423204031", "001"],
      ["20260423204130", "002"],
      ["20260423204205", "003"],
      ["20260423204222", "004"],
      ["20260423204234", "005"],
      ["20260423224651", "006"],
      ["20260423231622", "007"],
      ["20260501012728", "008"],
      ["20260501020518", "009"],
      ["20260501020537", "010"],
    ],
  );
});

test("the SQL repair records numbered versions before deleting legacy versions", () => {
  const sql = read("repair-history.sql");
  const insert = sql.indexOf(
    "insert into supabase_migrations.schema_migrations",
  );
  const deleteLegacy = sql.indexOf(
    "delete from supabase_migrations.schema_migrations",
  );
  assert.ok(insert >= 0);
  assert.ok(deleteLegacy > insert);
  assert.match(sql, /repaired history is not exactly 001 through 014/);
});

test("the host harness uses C locale, proves both history states, and dumps schema", () => {
  const harness = read("run-rehearsal.mjs");
  assert.match(harness, /LC_ALL: "C"/);
  assert.match(harness, /numberedMigrations\(1, 14\)/);
  assert.match(harness, /repair-history\.sql/);
  // The harness applies and records 015-047 and asserts a final history of
  // 001-047. This expectation said 39 and had been failing on origin/main since
  // the harness was extended past 039; it was stale, not a real defect. Verified
  // against the harness itself rather than assumed.
  assert.match(harness, /numberedMigrations\(15, 47\)/);
  assert.match(harness, /assertVersions\(numberedVersions\(1, 47\)/);
  assert.match(harness, /dumpSchema\("schema-full\.sql"/);
  assert.match(harness, /dumpSchema\("schema-app\.sql"/);
});

test("the printed production sequence gates push behind repair and dry run", () => {
  const commands = read("print-production-repair-commands.sh");
  const applyNumbered = commands.indexOf("--status applied --linked --yes");
  const removeLegacy = commands.indexOf("--status reverted --linked --yes");
  const gate = commands.indexOf("check-migration-safety.mjs --target=institute-production");
  const dryRun = commands.indexOf("guarded-db-push.sh --target=institute-production --dry-run");
  const push = commands.indexOf(
    "guarded-db-push.sh --target=institute-production\n",
    dryRun,
  );
  assert.ok(applyNumbered >= 0);
  assert.ok(removeLegacy > applyNumbered);
  assert.ok(gate > removeLegacy);
  assert.ok(dryRun > gate);
  assert.ok(push > dryRun);
});

test("the printed production sequence never prints an ungated db push", () => {
  // The 2026-07-30 incident's enabling command. It must not appear anywhere in
  // the printed block: the only push line is guarded-db-push.sh, which runs the
  // safety gate itself and aborts on a non-zero exit. A gate printed *next to* a
  // bare push is not a gate -- it is a suggestion.
  const commands = read("print-production-repair-commands.sh");
  for (const line of commands.split("\n")) {
    const code = line.split("#")[0];
    if (!code.includes("supabase db push")) continue;
    assert.ok(
      !code.includes("--include-all"),
      `print-production-repair-commands.sh must not emit a direct --include-all push: ${line}`,
    );
  }
});

test("guarded-db-push runs the safety gate before the push, with no escape hatch", () => {
  const wrapper = read("guarded-db-push.sh");
  const strictMode = wrapper.indexOf("set -euo pipefail");
  const gate = wrapper.indexOf("node scripts/migration-rehearsal/check-migration-safety.mjs");
  const push = wrapper.indexOf("supabase db push --include-all", gate);
  assert.ok(strictMode >= 0, "wrapper must abort on any non-zero exit");
  assert.ok(gate > strictMode);
  assert.ok(push > gate, "the push must come after the gate");
  assert.doesNotMatch(wrapper, /set \+e/);
  assert.doesNotMatch(wrapper, /continue-on-error/);
  // The two PRE-push gate calls must be unsuppressed: a non-zero exit has to end
  // the run before anything is written. The POST-push reconciliation is
  // deliberately status-captured instead, so that it always runs (see the
  // partial-push test below) -- that is the only permitted `||` on a gate call.
  const suppressed = [...wrapper.matchAll(/^\s*"\$\{GATE\[@\]\}"[^\n]*\|\|[^\n]*$/gm)].map((m) => m[0]);
  assert.equal(suppressed.length, 1, "exactly one gate call may capture its status");
  assert.match(suppressed[0], /--verify-applied/);
});

test("guarded-db-push exposes no path, baseline or test-mode option", () => {
  // Round-2 P1-1 and round-3 P1-1/P1-4: a caller-supplied migrations directory
  // let the gate approve directory A while the push applied directory B, and a
  // test-only relaxation must never be reachable from something that can push.
  const wrapper = read("guarded-db-push.sh");
  const options = [...wrapper.matchAll(/^\s{4}(--[a-z-]+)[=)]/gm)].map((match) => match[1]);
  assert.deepEqual(options.sort(), ["--dry-run", "--target", "--timeout-ms"]);
  // Comments discuss these flags by name on purpose; only executable lines matter.
  const code = wrapper
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  for (const forbidden of ["--test-mode", "--migrations-dir=", "--baseline=", "--repo-root="]) {
    assert.ok(!code.includes(forbidden), `wrapper must never pass ${forbidden}`);
  }
});

test("guarded-db-push holds an advisory lock across the whole run", () => {
  // Round-3 P1-5: the lock serialises sanctioned wrappers against each other. It
  // is confirmed by backend pid, not merely requested, and it is released by the
  // EXIT trap so a crash cannot leak it.
  const wrapper = read("guarded-db-push.sh");
  const acquire = wrapper.indexOf("pg_advisory_lock(");
  const confirm = wrapper.indexOf("from pg_locks where locktype='advisory'", acquire);
  const gate = wrapper.indexOf('"${GATE[@]}" "--emit-fingerprint=', confirm);
  assert.ok(acquire >= 0, "wrapper must take an advisory lock");
  assert.ok(confirm > acquire, "wrapper must confirm the lock is actually granted to its own backend");
  assert.ok(gate > confirm, "the gate must run only after the lock is confirmed");
  assert.match(wrapper, /trap cleanup EXIT/);
});

test("guarded-db-push always reconciles, even when the push fails", () => {
  // Round-3 P1-3: under a naive `set -e` a failed push would abort the script
  // before reconciliation, leaving a partially applied database unexamined.
  const wrapper = read("guarded-db-push.sh");
  assert.match(wrapper, /PUSH_STATUS=0\n\s*supabase db push[^\n]*\|\| PUSH_STATUS=\$\?/);
  const pushStatus = wrapper.indexOf("|| PUSH_STATUS=$?");
  const reconcile = wrapper.indexOf('"--verify-applied=$FINGERPRINT"', pushStatus);
  assert.ok(reconcile > pushStatus, "reconciliation must run after a captured push failure");
  assert.match(wrapper, /RECONCILE_STATUS/);
});

test("guarded-db-push verifies history before the push and reconciles after it", () => {
  // Round-2 finding P1-3.
  const wrapper = read("guarded-db-push.sh");
  const emit = wrapper.indexOf("--emit-fingerprint=");
  const verify = wrapper.indexOf("--verify-fingerprint=", emit);
  const push = wrapper.indexOf("supabase db push --include-all --db-url \"$DB_URL\" --yes", verify);
  const reconcile = wrapper.indexOf("--verify-applied=", push);
  assert.ok(emit >= 0, "gate must emit a history fingerprint");
  assert.ok(verify > emit, "history must be re-verified after the initial gate");
  assert.ok(push > verify, "the push must come after the re-verification");
  assert.ok(reconcile > push, "post-push reconciliation must come after the push");
});

test("the TEST migration workflow pushes only through the guarded wrapper", () => {
  const workflow = readFileSync(
    resolve(root, "../../.github/workflows/db-migrate-test.yml"),
    "utf8",
  );
  assert.match(workflow, /guarded-db-push\.sh --target=institute-test/);
  assert.ok(
    !/supabase db push[^\n]*--include-all/.test(workflow),
    "CI must not invoke a bare --include-all push outside the guarded wrapper",
  );
});
