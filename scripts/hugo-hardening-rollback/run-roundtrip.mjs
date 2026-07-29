#!/usr/bin/env node

// Local-only PostgreSQL 17 proof for the manual Hugo rollback pause. This
// script never reads credentials, connects to Supabase, or applies hosted SQL.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const rollbackDir = resolve(root, "scripts/hugo-hardening-rollback");
const targetVersions = [
  "20260728230000",
  "20260728235900",
  "20260729001500",
  "20260729003000",
];
const targetFiles = targetVersions.map((version) => {
  const match = readdirSync(migrationsDir).find((file) => file.startsWith(`${version}_`));
  if (!match) throw new Error(`Missing target migration ${version}.`);
  return match;
});

const pgBin = process.argv.find((value) => value.startsWith("--pg-bin="))
  ?.slice("--pg-bin=".length)
  || "/opt/homebrew/opt/postgresql@17/bin";
if (!existsSync(join(pgBin, "postgres"))) {
  throw new Error(`PostgreSQL 17 binaries were not found at ${pgBin}.`);
}
const major = Number(
  execFileSync(join(pgBin, "pg_config"), ["--version"], { encoding: "utf8" })
    .match(/PostgreSQL (\d+)/)?.[1],
);
if (major !== 17) throw new Error(`Expected PostgreSQL 17, found ${major}.`);

const cluster = mkdtempSync(join(tmpdir(), `bmhi-hugo-roundtrip-pg17-${process.pid}-`));
const socket = join("/tmp", `bmhi-hugo-roundtrip-socket-${process.pid}`);
const port = String(58000 + (process.pid % 500));
const env = {
  ...process.env,
  LC_ALL: "C",
  LANG: "C",
  PGHOST: socket,
  PGPORT: port,
  PGDATABASE: "postgres",
  PGUSER: "postgres",
};
const binary = (name) => join(pgBin, name);

try {
  execFileSync(binary("initdb"), [
    "-D", cluster, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8",
  ], { stdio: "ignore" });
  execFileSync("mkdir", ["-p", socket]);
  execFileSync(binary("pg_ctl"), [
    "-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start",
  ], { env, stdio: "ignore" });

  psqlText(bootstrapSql(), "bootstrap cluster");
  psqlText(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    );`, "migration history");

  const preTargetMigrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => {
      const version = file.match(/^(\d+)/)?.[1];
      return version && (version.length === 3 || Number(version) <= 20260728113000);
    })
    .sort();
  for (const file of preTargetMigrations) {
    psqlFile(resolve(migrationsDir, file), `pre-target ${file}`);
    recordMigration(file);
  }

  psqlText(seedFixtureSql(), "preservation fixture");
  const before = JSON.parse(psqlScalar(snapshotSql(), "baseline snapshot"));

  for (const file of targetFiles) {
    psqlFile(resolve(migrationsDir, file), `target ${file}`);
    recordMigration(file);
  }
  const operationReceipt = JSON.parse(psqlScalar(enableStrictFixtureSql(), "strict-mode fixture"));
  const targetBefore = JSON.parse(psqlScalar(targetSnapshotSql(), "target snapshot"));
  const targetActive = psqlScalar(
    "select public.fn_hugo_access_is_active('00000000-0000-4000-8000-000000000101')::text;",
    "target active-access proof",
  );
  if (!/[Tt]rue$/.test(targetActive)) {
    throw new Error(`Target hardening did not authorize the fixture owner: ${targetActive}`);
  }

  psqlWithConfirmation(resolve(rollbackDir, "rollback.sql"), "rollback pause");
  assertEqual(
    psqlScalar(historySql(), "rollback history"),
    "",
    "rollback removes exactly the four target history rows",
  );
  assertEqual(
    JSON.stringify(JSON.parse(psqlScalar(snapshotSql(), "post-rollback snapshot"))),
    JSON.stringify(before),
    "rollback preserves identity, grants, groups, and business data",
  );
  const gateCount = Number(psqlScalar(
    "select count(*) from pg_catalog.pg_policies where policyname = 'hugo_rollback_fail_closed';",
    "rollback deny-gate policy count",
  ));
  if (gateCount < 2) throw new Error(`Rollback deny gate was vacuous: only ${gateCount} policy rows.`);
  assertEqual(
    psqlScalar(authenticatedProfileCountSql(), "authenticated rollback gate proof"),
    "0",
    "authenticated reads are fail-closed during rollback pause",
  );

  for (const file of targetFiles) {
    psqlFile(resolve(migrationsDir, file), `replay ${file}`);
    recordMigration(file);
  }
  psqlWithConfirmation(resolve(rollbackDir, "replay-finalize.sql"), "replay finalization");

  assertEqual(
    JSON.stringify(JSON.parse(psqlScalar(snapshotSql(), "post-replay snapshot"))),
    JSON.stringify(before),
    "replay preserves identity, grants, groups, and business data",
  );
  assertEqual(
    JSON.stringify(JSON.parse(psqlScalar(targetSnapshotSql(), "post-replay target snapshot"))),
    JSON.stringify(targetBefore),
    "replay restores quarantined hardening state exactly",
  );
  assertEqual(
    psqlScalar(authenticatedProfileCountSql(), "authenticated replay proof"),
    "2",
    "replayed target policy restores authorized owner access to existing rows",
  );
  assertEqual(
    psqlScalar("select count(*) from pg_catalog.pg_policies where policyname = 'hugo_rollback_fail_closed';", "gate removal"),
    "0",
    "replay finalization removes only the rollback deny gate",
  );
  assertEqual(
    JSON.stringify(JSON.parse(psqlScalar(
      "set request.jwt.claim.role = 'service_role'; select public.hugo_set_access_enforcement('00000000-0000-4000-8000-000000000501', true)::text;",
      "replayed receipt proof",
    ))),
    JSON.stringify(operationReceipt),
    "replayed lifecycle RPC returns the preserved idempotent receipt",
  );

  console.log(JSON.stringify({
    status: "PASS",
    postgres_major: major,
    pre_target_migrations: preTargetMigrations.length,
    target_migrations: targetFiles,
    preserved_tables: ["auth.users", "profiles", "hugo_access_grants", "role_groups", "user_role_groups", "programs"],
    rollback_gate: "authenticated_denied_until_replay_finalize",
    replay_receipt: "exact_preserved_operation_receipt",
  }));
} finally {
  try {
    execFileSync(binary("pg_ctl"), ["-D", cluster, "-m", "fast", "-w", "stop"], {
      env,
      stdio: "ignore",
    });
  } catch {}
  rmSync(cluster, { recursive: true, force: true });
  rmSync(socket, { recursive: true, force: true });
}

function psqlFile(file, label) {
  try {
    execFileSync(binary("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-f", file], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    process.stderr.write(`\n${label} failed\n`);
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

function psqlWithConfirmation(file, label) {
  try {
    execFileSync(binary("psql"), [
      "-X", "-v", "ON_ERROR_STOP=1", "-c",
      "select set_config('bmh.hugo_rollback_confirm', 'I_UNDERSTAND_MANUAL_ONLY', false);",
      "-f", file,
    ], { env, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    process.stderr.write(`\n${label} failed\n`);
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

function psqlText(sql, label) {
  try {
    execFileSync(binary("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    process.stderr.write(`\n${label} failed\n`);
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

function psqlScalar(sql, label) {
  try {
    return execFileSync(binary("psql"), [
      "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q", "-c", sql,
    ], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    process.stderr.write(`\n${label} failed\n`);
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

function recordMigration(file) {
  const match = /^(\d+)_(.+)\.sql$/.exec(basename(file));
  if (!match) throw new Error(`Unexpected migration file ${file}.`);
  const version = match[1];
  const name = match[2].replaceAll("'", "''");
  psqlText(
    `insert into supabase_migrations.schema_migrations (version, statements, name)
       values ('${version}', array[]::text[], '${name}');`,
    `record ${file}`,
  );
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function historySql() {
  return "select coalesce(string_agg(version, ',' order by version), '') from supabase_migrations.schema_migrations where version = any (array['20260728230000','20260728235900','20260729001500','20260729003000']::text[]);";
}

function authenticatedProfileCountSql() {
  return `begin;
    set local role authenticated;
    set local request.jwt.claim.role = 'authenticated';
    set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
    select count(*)::text from public.profiles;
    rollback;`;
}

function seedFixtureSql() {
  return `
    set request.jwt.claim.role = 'service_role';
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('00000000-0000-4000-8000-000000000101', 'rollback-owner@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('00000000-0000-4000-8000-000000000102', 'rollback-learner@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());
    update public.profiles
    set full_name = case id
          when '00000000-0000-4000-8000-000000000101' then 'Rollback Owner'
          else 'Rollback Learner'
        end,
        system_role = case id
          when '00000000-0000-4000-8000-000000000101' then 'owner'
          else 'learner'
        end,
        status = 'active'
    where id in (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102'
    );
    insert into public.role_groups (id, name, description)
    values ('00000000-0000-4000-8000-000000000201', 'Rollback Group', 'Round-trip preservation fixture');
    insert into public.user_role_groups (user_id, role_group_id)
    values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000201');
    insert into public.programs (id, title, description)
    values ('00000000-0000-4000-8000-000000000301', 'Rollback Program', 'Round-trip preservation fixture');
    insert into public.hugo_access_grants (
      user_id, email, app_user_id, role, config, desired_status
    ) values
      ('00000000-0000-4000-8000-000000000101', 'rollback-owner@example.invalid', '00000000-0000-4000-8000-000000000101', 'owner', '{}'::jsonb, 'active'),
      ('00000000-0000-4000-8000-000000000102', 'rollback-learner@example.invalid', '00000000-0000-4000-8000-000000000102', 'learner', jsonb_build_object('role_group_ids', jsonb_build_array('00000000-0000-4000-8000-000000000201')), 'active');
  `;
}

function enableStrictFixtureSql() {
  return `
    set request.jwt.claim.role = 'service_role';
    select public.hugo_set_access_enforcement(
      '00000000-0000-4000-8000-000000000501', true
    )::text;
  `;
}

function snapshotSql() {
  return `select jsonb_build_object(
    'auth_users', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from (select * from auth.users) r),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from (select * from public.profiles) r),
    'hugo_access_grants', (select coalesce(jsonb_agg(to_jsonb(r) order by r.user_id), '[]'::jsonb) from (select * from public.hugo_access_grants) r),
    'role_groups', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from (select * from public.role_groups) r),
    'user_role_groups', (select coalesce(jsonb_agg(to_jsonb(r) order by r.user_id, r.role_group_id), '[]'::jsonb) from (select * from public.user_role_groups) r),
    'programs', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from (select * from public.programs) r)
  )::text;`;
}

function targetSnapshotSql() {
  return `select jsonb_build_object(
    'settings', (select coalesce(jsonb_agg(to_jsonb(r) order by r.singleton), '[]'::jsonb) from (select * from public.hugo_access_settings) r),
    'changes', (select coalesce(jsonb_agg(to_jsonb(r) order by r.operation_id), '[]'::jsonb) from (select * from public.hugo_access_enforcement_changes) r)
  )::text;`;
}

function bootstrapSql() {
  return `
    create role anon nologin inherit;
    create role authenticated nologin inherit;
    create role service_role nologin inherit bypassrls;
    create role authenticator login noinherit;
    create role supabase_storage_admin nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    grant anon, authenticated, service_role, authenticator to postgres with admin option;
    grant authenticator to supabase_storage_admin;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
      )
    $$;
    grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
    create table auth.users (
      instance_id uuid, id uuid primary key, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz, invited_at timestamptz,
      confirmation_token text, confirmation_sent_at timestamptz, recovery_token text,
      recovery_sent_at timestamptz, email_change_token_new text, email_change text,
      email_change_sent_at timestamptz, last_sign_in_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
      created_at timestamptz, updated_at timestamptz, phone text,
      phone_confirmed_at timestamptz, confirmed_at timestamptz,
      is_anonymous boolean default false
    );
    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (
      id text primary key, name text not null, owner uuid,
      public boolean not null default false, file_size_limit bigint,
      allowed_mime_types text[], created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table storage.objects (
      id uuid primary key default extensions.gen_random_uuid(), bucket_id text not null,
      name text not null, owner uuid, owner_id text, metadata jsonb,
      user_metadata jsonb, version text, created_at timestamptz default now(),
      updated_at timestamptz default now(), last_accessed_at timestamptz default now()
    );
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    alter database postgres set search_path = public, extensions;
  `;
}
