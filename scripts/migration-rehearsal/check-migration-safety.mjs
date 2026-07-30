#!/usr/bin/env node
// Mandatory preflight gate for any `supabase db push --include-all` against a
// linked project (TEST or PRODUCTION).
//
// Why this exists (2026-07-30 incident):
// An automated reconciliation loop treated "this migration version has no row
// in supabase_migrations.schema_migrations" as "this migration's content was
// never applied," and re-ran supabase/migrations/20260728091000_hugo_access_provisioner.sql
// directly against BMH Institute production, out of order. That file's body had
// long since been superseded by later hardening migrations. Re-applying it
// silently reverted 6 functions and broke Hugo user provisioning for hours.
// `--include-all` re-applies every migration the remote history doesn't know
// about, in filename order, regardless of age or whether later migrations
// already touched the same objects. It has no concept of supersession.
//
// This script fails closed instead of guessing:
//   1. Refuses to proceed if schema_migrations contains any placeholder row
//      (statements IS NULL) — those rows come from `migration repair` and mean
//      history is not a trustworthy signal of what content is actually live.
//   2. Refuses to proceed if any locally pending migration (present on disk,
//      absent from schema_migrations) sorts OLDER than the newest version
//      already recorded in schema_migrations. A pending migration that is
//      older than history's current high-water mark is exactly the
//      out-of-order re-apply pattern that caused the outage — it must never
//      be auto-applied. A human decides, in each case, whether the file is
//      genuinely new (rare) or superseded (assume this until proven otherwise).
//
// This script only inspects and reports. It never runs `supabase db push`,
// `supabase migration repair`, or any writing SQL itself.
//
// Usage:
//   PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... [PGSSLMODE=require] \
//     node scripts/migration-rehearsal/check-migration-safety.mjs [--migrations-dir=supabase/migrations]
//
// Exit code 0: safe to proceed to a `db push --include-all --dry-run` review.
// Exit code 1: refuse. Print the reason and let a human resolve it.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

function parseArguments(argv) {
  const map = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) {
      map[match[1]] = match[2] ?? "true";
    }
  }
  return map;
}

function versionKey(version) {
  // Migration versions in this repo are either 3-digit legacy numbers
  // ("001".."014") or 14-digit timestamps ("20260728091000"). Both are
  // all-digit strings, so a same-length numeric compare is always correct
  // chronologically as long as we compare as BigInt rather than by string
  // length or lexicographically across mixed lengths.
  if (!/^\d+$/.test(version)) {
    throw new Error(
      `Migration version "${version}" is not purely numeric. Refusing to guess its chronological order.`,
    );
  }
  return BigInt(version);
}

function runPsqlCsv(sql) {
  const requiredEnv = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"];
  const missing = requiredEnv.filter((name) => process.env[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing required psql connection env var(s): ${missing.join(", ")}. ` +
        "Export PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD (and PGSSLMODE for hosted projects) before running this gate.",
    );
  }
  const output = execFileSync(
    "psql",
    ["--csv", "--quiet", "--tuples-only", "--set", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
  const lines = output.trim().split("\n").filter((line) => line.length > 0);
  return lines.map((line) => line.split(","));
}

function loadLocalMigrationVersions(migrationsDir) {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  return files.map((name) => {
    const match = /^(\d+)_/.exec(name);
    if (!match) {
      throw new Error(`Migration file "${name}" does not start with a numeric version prefix.`);
    }
    return { file: name, version: match[1] };
  });
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const migrationsDir = resolve(args["migrations-dir"] ?? "supabase/migrations");

  console.log("== Migration safety gate ==");
  console.log(`Migrations directory: ${migrationsDir}`);

  const historyRows = runPsqlCsv(
    "select version, (statements is null) as is_placeholder " +
      "from supabase_migrations.schema_migrations order by version",
  );

  const history = historyRows.map(([version, isPlaceholder]) => ({
    version,
    isPlaceholder: isPlaceholder === "t",
  }));

  const placeholders = history.filter((row) => row.isPlaceholder);
  if (placeholders.length > 0) {
    console.error("");
    console.error(
      "REFUSING: schema_migrations contains placeholder row(s) with NULL statements:",
    );
    for (const row of placeholders) {
      console.error(`  - ${row.version}`);
    }
    console.error("");
    console.error(
      "These rows come from `supabase migration repair` and do not prove any real content is",
    );
    console.error(
      "applied at that version. History is not a reliable signal while these exist. A human",
    );
    console.error(
      "must reconcile this (confirm live schema state directly, e.g. pg_get_functiondef) before",
    );
    console.error("any `db push --include-all` runs against this project.");
    process.exitCode = 1;
    return;
  }

  if (history.length === 0) {
    console.error("REFUSING: schema_migrations returned zero rows. Refusing to guess a baseline.");
    process.exitCode = 1;
    return;
  }

  const maxApplied = history
    .map((row) => versionKey(row.version))
    .reduce((max, current) => (current > max ? current : max));

  const appliedVersions = new Set(history.map((row) => row.version));
  const local = loadLocalMigrationVersions(migrationsDir);
  const pending = local.filter((entry) => !appliedVersions.has(entry.version));

  console.log(`Newest version recorded in schema_migrations: ${maxApplied.toString()}`);
  console.log(`Locally pending (not in schema_migrations): ${pending.length}`);

  const unsafePending = pending.filter((entry) => versionKey(entry.version) < maxApplied);

  if (unsafePending.length > 0) {
    console.error("");
    console.error(
      "REFUSING: the following pending migration(s) are OLDER than the newest version already",
    );
    console.error(
      "recorded in schema_migrations. This is exactly the out-of-order re-apply pattern that",
    );
    console.error(
      "reverted 6 hardened Hugo functions on 2026-07-30. `--include-all` cannot tell whether a",
    );
    console.error(
      "later migration already supersedes this file's content, so it must never be assumed safe:",
    );
    for (const entry of unsafePending) {
      console.error(`  - ${entry.file} (version ${entry.version} < ${maxApplied.toString()})`);
    }
    console.error("");
    console.error(
      "Before applying any of these, a human must confirm (by reading the live function/table",
    );
    console.error(
      "definitions, not just history) whether a later migration already changed the same objects.",
    );
    console.error("If it does, that later migration is authoritative and this file must NOT be re-run.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("OK: no placeholder rows, and every pending migration is newer than history's high-water mark.");
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

main();
