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
  assert.match(harness, /numberedMigrations\(15, 39\)/);
  assert.match(harness, /assertVersions\(numberedVersions\(1, 39\)/);
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
  assert.doesNotMatch(wrapper, /check-migration-safety\.mjs[^\n]*\|\|/);
  assert.doesNotMatch(wrapper, /set \+e/);
  assert.doesNotMatch(wrapper, /continue-on-error/);
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
