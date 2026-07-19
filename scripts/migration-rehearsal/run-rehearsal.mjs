#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const argumentsMap = parseArguments(process.argv.slice(2));
const evidenceDirectory = resolve(
  argumentsMap["evidence-dir"] ??
    "/private/tmp/bmh-migration-history-fetch-1784431792/supabase/migrations",
);
const outputDirectory = resolve(
  argumentsMap["output-dir"] ?? join(import.meta.dirname, "artifacts"),
);
const keepCluster = argumentsMap["keep-cluster"] === "true";
const cluster = join(
  tmpdir(),
  `bmh-migration-rehearsal-pg-${process.pid}-${Date.now()}`,
);
const socket = join(cluster, "socket");
const port = String(56000 + (process.pid % 1000));
const pgBindir = execFileSync("pg_config", ["--bindir"], {
  encoding: "utf8",
}).trim();
const binary = (name) => join(pgBindir, name);
const pgEnv = {
  ...process.env,
  LC_ALL: "C",
  LANG: "C",
  PGHOST: socket,
  PGPORT: port,
  PGDATABASE: "postgres",
  PGUSER: "postgres",
};

mkdirSync(outputDirectory, { recursive: true });
runEquivalenceCheck();

try {
  mkdirSync(cluster, { recursive: true });
  exec(binary("initdb"), [
    "-D",
    cluster,
    "-A",
    "trust",
    "-U",
    "postgres",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  mkdirSync(socket, { recursive: true });
  execFileSync(
    binary("pg_ctl"),
    ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"],
    { env: pgEnv, stdio: "ignore" },
  );
  bootstrapSupabaseRoles();

  for (const migration of numberedMigrations(1, 14)) {
    psqlFile(resolve(root, "supabase/migrations", migration));
  }
  seedProductionHistory();
  assertVersions(productionVersions(), "seeded production history");
  writeHistory("history-before-repair.txt");

  psqlFile(resolve(import.meta.dirname, "repair-history.sql"));
  assertVersions(numberedVersions(1, 14), "repaired history");
  writeHistory("history-after-repair.txt");

  for (const migration of numberedMigrations(15, 39)) {
    psqlFile(resolve(root, "supabase/migrations", migration));
    recordMigration(migration);
  }
  assertVersions(numberedVersions(1, 39), "final history");
  writeHistory("history-final.txt");
  dumpSchema("schema-full.sql", []);
  dumpSchema("schema-app.sql", ["public", "private", "supabase_migrations"]);

  const summary = {
    status: "PASS",
    postgres: execFileSync(binary("postgres"), ["--version"], {
      env: pgEnv,
      encoding: "utf8",
    }).trim(),
    evidenceDirectory,
    outputDirectory,
    history: "001-039",
    artifacts: [
      "legacy-equivalence-report.json",
      "history-before-repair.txt",
      "history-after-repair.txt",
      "history-final.txt",
      "schema-full.sql",
      "schema-app.sql",
    ],
  };
  writeFileSync(
    join(outputDirectory, "rehearsal-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary));
} finally {
  try {
    execFileSync(
      binary("pg_ctl"),
      ["-D", cluster, "-m", "fast", "-w", "stop"],
      { env: pgEnv, stdio: "ignore" },
    );
  } catch {}
  if (!keepCluster) rmSync(cluster, { recursive: true, force: true });
  else console.error(`Cluster retained at ${cluster}`);
}

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--keep-cluster") {
      parsed["keep-cluster"] = "true";
      continue;
    }
    if (!value.startsWith("--") || !values[index + 1]) {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
    parsed[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function runEquivalenceCheck() {
  const output = join(outputDirectory, "legacy-equivalence-report.json");
  const uvCache = join(tmpdir(), "bmh-migration-rehearsal-uv-cache");
  execFileSync(
    "uv",
    [
      "run",
      "--with",
      "pglast==7.10",
      "python",
      resolve(import.meta.dirname, "compare-legacy-sql.py"),
      "--map",
      resolve(import.meta.dirname, "legacy-map.json"),
      "--evidence-dir",
      evidenceDirectory,
      "--repo-migrations-dir",
      resolve(root, "supabase/migrations"),
      "--output",
      output,
    ],
    {
      env: { ...process.env, LC_ALL: "C", LANG: "C", UV_CACHE_DIR: uvCache },
      stdio: "inherit",
    },
  );
  const report = JSON.parse(readFileSync(output, "utf8"));
  if (report.status !== "PASS" || report.pairs.length !== 10) {
    throw new Error("Legacy SQL equivalence did not pass for all ten pairs.");
  }
}

function bootstrapSupabaseRoles() {
  psqlText(`
    create role anon nologin inherit;
    create role authenticated nologin inherit;
    create role service_role nologin inherit bypassrls;
    create role authenticator login noinherit;
    create role supabase_storage_admin nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    grant anon, authenticated, service_role, authenticator
      to postgres with admin option;
    grant authenticator to supabase_storage_admin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create table auth.users (
      instance_id uuid,
      id uuid primary key,
      aud text,
      role text,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      created_at timestamptz,
      updated_at timestamptz
    );
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      owner uuid
    );
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    alter database postgres set search_path = public, extensions;
  `);
}

function seedProductionHistory() {
  psqlText(`
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
    insert into supabase_migrations.schema_migrations (version, statements, name)
    values
      ('20260423204031', array[]::text[], 'initial_schema'),
      ('20260423204130', array[]::text[], 'functions_and_triggers'),
      ('20260423204205', array[]::text[], 'rls_policies'),
      ('20260423204222', array[]::text[], 'indexes'),
      ('20260423204234', array[]::text[], 'seed_dev'),
      ('20260423224651', array[]::text[], 'storage_content_bucket'),
      ('20260423231622', array[]::text[], 'storage_submissions_bucket'),
      ('20260501012728', array[]::text[], 'answer_options_public_view'),
      ('20260501020518', array[]::text[], 'answer_options_public_row_filter'),
      ('20260501020537', array[]::text[], 'prevent_last_owner_deletion'),
      ('011', array[]::text[], 'auth_rate_limits'),
      ('012', array[]::text[], 'data_integrity'),
      ('013', array[]::text[], 'role_play_blocks'),
      ('014', array[]::text[], 'revoke_answer_options_answer_key');
  `);
}

function numberedMigrations(first, last) {
  const files = readdirSync(resolve(root, "supabase/migrations"));
  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const version = String(first + offset).padStart(3, "0");
    const matches = files.filter((file) => file.startsWith(`${version}_`));
    if (matches.length !== 1) {
      throw new Error(`Expected one migration for ${version}, found ${matches.length}.`);
    }
    return matches[0];
  });
}

function recordMigration(file) {
  const match = /^(\d{3})_(.+)\.sql$/.exec(basename(file));
  if (!match) throw new Error(`Unexpected migration file: ${file}`);
  psqlText(
    `insert into supabase_migrations.schema_migrations (version, statements, name) ` +
      `values ('${match[1]}', array[]::text[], '${match[2]}');`,
  );
}

function productionVersions() {
  return [
    "011", "012", "013", "014",
    "20260423204031", "20260423204130", "20260423204205",
    "20260423204222", "20260423204234", "20260423224651",
    "20260423231622", "20260501012728", "20260501020518",
    "20260501020537",
  ].sort();
}

function numberedVersions(first, last) {
  return Array.from({ length: last - first + 1 }, (_, offset) =>
    String(first + offset).padStart(3, "0"),
  );
}

function assertVersions(expected, label) {
  const actual = psqlScalar(
    "select coalesce(string_agg(version, ',' order by version), '') " +
      "from supabase_migrations.schema_migrations",
  ).split(",").filter(Boolean);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch. Expected ${expected.join(",")}; got ${actual.join(",")}`);
  }
}

function writeHistory(name) {
  const history = exec(binary("psql"), [
    "-X", "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-c",
    "select version, name from supabase_migrations.schema_migrations order by version",
  ]);
  writeFileSync(join(outputDirectory, name), history);
}

function dumpSchema(name, schemas) {
  const args = ["--schema-only", "--no-owner", "--file", join(outputDirectory, name)];
  for (const schema of schemas) args.push("--schema", schema);
  exec(binary("pg_dump"), args);
}

function psqlText(sql) {
  exec(binary("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-c", sql]);
}

function psqlScalar(sql) {
  return exec(binary("psql"), [
    "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-c", sql,
  ]).trim();
}

function psqlFile(path) {
  exec(binary("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-f", path]);
}

function exec(command, args) {
  return execFileSync(command, args, {
    env: pgEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}
