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
  const dryRun = commands.indexOf("--include-all --dry-run");
  const push = commands.indexOf("--include-all --yes", dryRun);
  assert.ok(applyNumbered >= 0);
  assert.ok(removeLegacy > applyNumbered);
  assert.ok(dryRun > removeLegacy);
  assert.ok(push > dryRun);
});
