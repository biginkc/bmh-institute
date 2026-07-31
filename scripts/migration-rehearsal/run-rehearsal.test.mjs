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
  // Round-5 finding 2: the confirm query moved into a shared
  // lock_still_held_query() helper (defined once, called from the initial
  // confirm loop, assert_lock_still_held, and run_push_watched) so it can
  // pair backend pid with backend_start everywhere consistently. The helper
  // is defined before acquisition for bash function-definition ordering, but
  // it must still be CALLED only after the lock is actually requested, and
  // the gate must run only after that call confirms it.
  const wrapper = read("guarded-db-push.sh");
  assert.match(wrapper, /from pg_locks where locktype='advisory'/, "must confirm via pg_locks, not merely request the lock");
  const acquire = wrapper.indexOf("pg_advisory_lock(");
  const confirmCall = wrapper.indexOf('HELD="$(lock_still_held_query)"', acquire);
  const gate = wrapper.indexOf('"${GATE[@]}" "--emit-fingerprint=', confirmCall);
  assert.ok(acquire >= 0, "wrapper must take an advisory lock");
  assert.ok(confirmCall > acquire, "wrapper must confirm the lock is actually granted to its own backend, after requesting it");
  assert.ok(gate > confirmCall, "the gate must run only after the lock is confirmed");
  assert.match(wrapper, /trap cleanup EXIT/);
});

test("guarded-db-push always reconciles, even when the push fails", () => {
  // Round-3 P1-3: under a naive `set -e` a failed push would abort the script
  // before reconciliation, leaving a partially applied database unexamined.
  // Round-5 finding 1: the push now runs through run_push_watched (which
  // backgrounds it and polls the lock so a mid-push loss kills it promptly)
  // rather than a bare foreground invocation, but the captured-status /
  // always-reconcile property must still hold.
  const wrapper = read("guarded-db-push.sh");
  assert.match(wrapper, /PUSH_STATUS=0\n\s*run_push_watched supabase db push[^\n]*\|\| PUSH_STATUS=\$\?/);
  const pushStatus = wrapper.indexOf("|| PUSH_STATUS=$?");
  const reconcile = wrapper.indexOf('"--verify-applied=$FINGERPRINT"', pushStatus);
  assert.ok(reconcile > pushStatus, "reconciliation must run after a captured push failure");
  assert.match(wrapper, /RECONCILE_STATUS/);
});

test("guarded-db-push watches the lock WHILE the push runs, not just before it", () => {
  // Round-5 finding 1: a point-in-time check before the push leaves the
  // entire push duration unwatched. run_push_watched must background the
  // push and poll lock_still_held_query, killing the push on loss.
  const wrapper = read("guarded-db-push.sh");
  const fn = wrapper.indexOf("run_push_watched() {");
  assert.ok(fn >= 0, "wrapper must define run_push_watched");
  const body = wrapper.slice(fn, wrapper.indexOf("\n}", fn));
  assert.match(body, /"\$@" &/, "must background the supplied command");
  assert.match(body, /lock_still_held_query/, "must poll the shared lock-held check while running");
  assert.match(body, /kill -TERM "\$push_pid"/, "must kill the push on lock loss");
  const dryRunCall = wrapper.indexOf("run_push_watched supabase db push --include-all --db-url \"$DB_URL\" --dry-run");
  const realCall = wrapper.indexOf("run_push_watched supabase db push --include-all --db-url \"$DB_URL\" --yes");
  assert.ok(dryRunCall > 0, "the dry-run push must go through run_push_watched");
  assert.ok(realCall > 0, "the real push must go through run_push_watched");
});

test("guarded-db-push pairs the lock's backend pid with its backend_start", () => {
  // Round-5 finding 2: a bare pid check does not rule out PostgreSQL reusing
  // a pid for an unrelated later backend that happens to hold the same
  // advisory lock. Every lock-held check must also require the ORIGINAL
  // backend_start captured at acquisition time.
  const wrapper = read("guarded-db-push.sh");
  assert.match(wrapper, /select backend_start::text from pg_stat_activity where pid = pg_backend_pid\(\)/);
  assert.match(wrapper, /LOCK_BACKEND_START="\$\(sed -n '2p' "\$LOCK_OUT"/);
  const query = wrapper.indexOf("lock_still_held_query() {");
  assert.ok(query >= 0, "wrapper must define a shared lock_still_held_query helper");
  const body = wrapper.slice(query, wrapper.indexOf("\n}", query));
  assert.match(body, /pid=\$\{LOCK_BACKEND_PID\}/);
  assert.match(body, /a\.backend_start = '\$\{LOCK_BACKEND_START\}'::timestamptz/);
  // assert_lock_still_held and the initial confirmation loop must both route
  // through the shared helper rather than re-querying pid alone.
  const uses = [...wrapper.matchAll(/HELD="\$\(lock_still_held_query\)"/g)];
  assert.ok(uses.length >= 2, "both the initial confirm loop and assert_lock_still_held must use the shared query");
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

// --------------------------------------------------------------------------
// Round-4 finding 3: workflow_dispatch on the branch-controlled TEST file
// cannot defend itself with an in-file check, so the fix moved production
// entirely off workflow_dispatch, structurally. These tests prove the shape
// rather than trust the comments describing it.
// --------------------------------------------------------------------------

/** Returns the text of a top-level (column-0) YAML block, e.g. "on:". */
function topLevelBlock(content, key) {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line === `${key}:`);
  assert.ok(start !== -1, `expected a top-level "${key}:" block`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

test("db-migrate-prod.yml's on: block declares no push and no workflow_dispatch trigger", () => {
  const workflow = readFileSync(resolve(root, "../../.github/workflows/db-migrate-prod.yml"), "utf8");
  const onBlock = topLevelBlock(workflow, "on");
  assert.ok(
    !/workflow_dispatch\s*:/.test(onBlock),
    "db-migrate-prod.yml must not declare workflow_dispatch as a trigger key -- that is the entire fix: " +
      "GitHub reads dispatch eligibility from main's copy of the file, so a file that never declares the " +
      "trigger has no 'Run workflow' button or API call that can invoke it, on any ref, ever",
  );
  assert.ok(!/^\s*push\s*:/m.test(onBlock), "db-migrate-prod.yml must not declare a push trigger");
  assert.match(onBlock, /workflow_run\s*:/, "db-migrate-prod.yml must be triggered by workflow_run");
  assert.match(
    onBlock,
    /workflows:\s*\["Apply Supabase migrations to test"\]/,
    "must listen for the TEST workflow by its exact top-level name",
  );
});

test("db-migrate-prod.yml's job gates on the test run's success and main, checks out the exact tested SHA, and requires the Production environment", () => {
  const workflow = readFileSync(resolve(root, "../../.github/workflows/db-migrate-prod.yml"), "utf8");
  assert.match(
    workflow,
    /if:\s*github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.head_branch == 'main'/,
    "must refuse unless the upstream TEST run succeeded AND ran against main",
  );
  assert.match(workflow, /environment:\s*Production/, "must gate behind the configured Production environment");
  assert.match(
    workflow,
    /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha\s*\}\}/,
    "must check out the exact commit the TEST workflow verified, not whatever main currently points at",
  );
  assert.match(workflow, /fetch-depth:\s*0/, "must fetch full history for the ancestor-ref defense-in-depth check");
  assert.match(
    workflow,
    /guarded-db-push\.sh --target=institute-production/,
    "must push through the same sanctioned wrapper the manual runbook uses",
  );
  assert.ok(
    !/supabase db push[^\n]*--include-all/.test(workflow),
    "CI must not invoke a bare --include-all push outside the guarded wrapper",
  );
});

test("db-migrate-prod.yml refuses a manual rerun of a stale successful run", () => {
  // Round-5 finding 3: GitHub allows "Re-run jobs" on ANY completed workflow
  // run, including this one, regardless of trigger type. A rerun replays the
  // ORIGINAL head_sha/head_branch even if main has since advanced, and the
  // ancestor script alone does not catch it (an old main commit is still a
  // valid ancestor of current main -- that's intentionally allowed, see
  // assert-ref-is-main-or-ancestor.test.sh case C). github.run_attempt is
  // '1' only for a run's original, naturally-triggered execution.
  const workflow = readFileSync(resolve(root, "../../.github/workflows/db-migrate-prod.yml"), "utf8");
  assert.match(
    workflow,
    /if:\s*github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.head_branch == 'main' && github\.event\.workflow_run\.run_attempt == '1' && github\.run_attempt == '1'/,
    "must refuse any run_attempt other than the original, natural trigger -- both the production run's OWN attempt and the upstream test run's attempt",
  );
});

test("db-migrate-prod.yml also refuses a production run triggered by a RERUN of the upstream test workflow", () => {
  // Codex round-6 finding (on top of round-5 finding 3): `github.run_attempt
  // == '1'` alone only guards a rerun of THIS (production) workflow run. It
  // does nothing about someone rerunning the UPSTREAM db-migrate-test.yml
  // run instead: GitHub's rerun replays that run's original stale head_sha,
  // and completing it fires a genuinely NEW `workflow_run` event for
  // db-migrate-prod.yml (only the `requested` activity type is suppressed on
  // rerun, not `completed`) -- so the resulting production run's OWN
  // run_attempt is '1' and passes the first check, while still carrying the
  // stale upstream SHA. `github.event.workflow_run.run_attempt` is the
  // UPSTREAM run's own attempt number (from the event payload), so requiring
  // it to be '1' closes this specific gap.
  const workflow = readFileSync(resolve(root, "../../.github/workflows/db-migrate-prod.yml"), "utf8");
  assert.match(
    workflow,
    /if:[^\n]*github\.event\.workflow_run\.run_attempt == '1'/,
    "must also check the UPSTREAM (workflow_run event) run_attempt, not just this run's own github.run_attempt",
  );
});

test("db-migrate-prod.yml re-checks ancestry a second time immediately before the push", () => {
  // Round-5 finding 4: the first ancestry check runs right after checkout,
  // well before the push -- a force-push to main in that window would go
  // undetected. A second invocation of the same script, immediately before
  // the "Apply pending migrations" step, bounds (does not eliminate) that
  // window instead of leaving it open for the whole job.
  const workflow = readFileSync(resolve(root, "../../.github/workflows/db-migrate-prod.yml"), "utf8");
  const calls = [...workflow.matchAll(/run: bash scripts\/assert-ref-is-main-or-ancestor\.sh/g)];
  assert.equal(calls.length, 2, "the ancestor guard must run twice: once after checkout, once immediately before the push");
  const secondCallIndex = calls[1].index;
  const applyMigrations = workflow.indexOf("Apply pending migrations (safety gate chained to the push)");
  assert.ok(applyMigrations > secondCallIndex, "the second ancestor check must come immediately before the push step");
  const push = workflow.indexOf("guarded-db-push.sh --target=institute-production");
  assert.ok(push > applyMigrations, "the push must still come after the push step");
});

test("db-migrate-test.yml's workflow_dispatch trigger no longer carries a self-defeating expected_sha check", () => {
  const workflow = readFileSync(resolve(root, "../../.github/workflows/db-migrate-test.yml"), "utf8");
  const onBlock = topLevelBlock(workflow, "on");
  assert.match(onBlock, /workflow_dispatch:\s*\{\}/, "TEST dispatch is intentionally unrestricted -- see the file header");
  // The header and the dispatch comment both explain the history in prose
  // (which legitimately says the word "expected_sha"), so check for the
  // LIVE code shapes rather than the bare word: no `inputs:` block under
  // workflow_dispatch, no `${{ inputs.expected_sha }}` interpolation
  // anywhere, and no step still named for the check that used to run it.
  assert.ok(
    !/workflow_dispatch:\s*\n\s*inputs:/.test(workflow),
    "workflow_dispatch must have no inputs -- an expected_sha input is exactly the self-defeating check " +
      "this fix removed",
  );
  assert.ok(
    !/\$\{\{\s*inputs\.expected_sha\s*\}\}/.test(workflow),
    "no step may still read an expected_sha input -- it ran from the SAME branch being dispatched, so an " +
      "attacker branch could simply delete the check from its own copy before dispatching",
  );
  assert.ok(
    !/name:\s*Verify exact authorized revision/.test(workflow),
    "the self-defeating verification step must be removed, not merely disarmed",
  );
});
