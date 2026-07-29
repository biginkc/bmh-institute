#!/usr/bin/env node

// Local-only PostgreSQL 17 proof for the manual Hugo rollback pause. This
// script never reads credentials, connects to Supabase, or applies hosted SQL.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  const beforeHistory = JSON.parse(psqlScalar(historySnapshotSql(), "baseline migration history"));

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
  assertEqual(
    JSON.stringify(JSON.parse(psqlScalar(historySnapshotSql(), "post-rollback migration history"))),
    JSON.stringify(beforeHistory),
    "rollback changes only the four target migration-history rows",
  );
  const gateCount = Number(psqlScalar(
    "select count(*) from pg_catalog.pg_policies where policyname = 'hugo_rollback_fail_closed';",
    "rollback deny-gate policy count",
  ));
  if (gateCount < 2) throw new Error(`Rollback deny gate was vacuous: only ${gateCount} policy rows.`);
  const gateCoverage = JSON.parse(psqlScalar(rollbackGateCoverageSql(), "rollback gate coverage"));
  if (gateCoverage.metadata !== gateCoverage.public_policies
      || gateCoverage.storage_policies !== 1
      || gateCoverage.metadata === 0) {
    throw new Error(`Rollback deny gate coverage was incomplete: ${JSON.stringify(gateCoverage)}`);
  }
  assertEqual(
    psqlScalar(authenticatedProfileCountSql(), "authenticated rollback gate proof"),
    "0",
    "authenticated reads are fail-closed during rollback pause",
  );
  assertEqual(
    psqlScalar(authenticatedProfileWriteCountSql(), "authenticated rollback write gate proof"),
    "0",
    "authenticated writes are fail-closed during rollback pause",
  );
  expectPsqlFailure(
    () => psqlText(
      "set role service_role; update public.hugo_access_grants set desired_status = desired_status where user_id = '00000000-0000-4000-8000-000000000101';",
      "service-role rollback write gate proof",
    ),
    "service-role writes are quiesced during rollback pause",
  );
  const atomicFailureProbe = join(cluster, "atomic-replay-failure-probe.sql");
  writeFileSync(
    atomicFailureProbe,
    `begin;\n\\ir '${resolve(migrationsDir, targetFiles[0])}'\nselect 1 / 0;\ncommit;\n`,
  );
  expectPsqlFailure(
    () => psqlFile(atomicFailureProbe, "atomic replay failure probe"),
    "atomic replay rolls back a failed migration",
  );
  assertEqual(
    psqlScalar("select coalesce(string_agg(version, ',' order by version), '') from supabase_migrations.schema_migrations where version in ('20260728230000','20260728235900','20260729001500','20260729003000');", "atomic replay history probe"),
    "",
    "failed atomic replay leaves migration history unchanged",
  );
  assertEqual(
    psqlScalar("select coalesce(to_regclass('public.hugo_access_settings')::text, '')", "atomic replay object probe"),
    "",
    "failed atomic replay leaves target tables absent",
  );

  psqlWithConfirmation(resolve(rollbackDir, "replay-targets.sql"), "atomic target replay");
  psqlText(
    `drop trigger hugo_rollback_write_guard on public.hugo_access_enforcement_changes;
     insert into public.hugo_access_enforcement_changes (
       operation_id, previous_enforce_grants, enforce_grants, changed_at
     ) values (
       '00000000-0000-4000-8000-000000000502', false, true, now()
     );
     create trigger hugo_rollback_write_guard
     before insert or update or delete on public.hugo_access_enforcement_changes
     for each row execute function public.fn_hugo_rollback_write_guard();`,
    "replay drift fixture",
  );
  expectPsqlFailure(
    () => psqlWithConfirmation(resolve(rollbackDir, "replay-finalize.sql"), "drifted replay finalization"),
    "finalizer rejects extra replay rows while gate remains active",
  );
  psqlText(
    "drop trigger hugo_rollback_write_guard on public.hugo_access_enforcement_changes; delete from public.hugo_access_enforcement_changes where operation_id = '00000000-0000-4000-8000-000000000502'; create trigger hugo_rollback_write_guard before insert or update or delete on public.hugo_access_enforcement_changes for each row execute function public.fn_hugo_rollback_write_guard();",
    "remove replay drift fixture",
  );
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
  const finalHistory = JSON.parse(psqlScalar(historySnapshotSql(), "final migration history"));
  const nonTargetFinalHistory = finalHistory.filter((row) => !targetVersions.includes(row.version));
  assertEqual(
    JSON.stringify(nonTargetFinalHistory),
    JSON.stringify(beforeHistory),
    "replay preserves every non-target migration-history row",
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
    snapshot_scope: "all public tables plus auth.users and storage.objects (target settings compared separately)",
    preserved_tables: ["auth.users", "profiles", "hugo_access_grants", "hugo_access_operations", "role_groups", "user_role_groups", "programs", "storage.objects"],
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
      "select set_config('bmh.hugo_rollback_confirm', 'I_UNDERSTAND_MANUAL_ONLY', false), set_config('bmh.hugo_rollback_quiesced', 'I_UNDERSTAND_WRITERS_STOPPED', false);",
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
  const hash = migrationHash(file);
  psqlText(
    `insert into supabase_migrations.schema_migrations (version, statements, name)
       values ('${version}', array['sha256:${hash}'], '${name}');`,
    `record ${file}`,
  );
}

function migrationHash(file) {
  return createHash("sha256").update(readFileSync(resolve(migrationsDir, file))).digest("hex");
}

function expectPsqlFailure(run, message) {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(`${message}: expected the command to fail`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function historySql() {
  return "select coalesce(string_agg(version, ',' order by version), '') from supabase_migrations.schema_migrations where version = any (array['20260728230000','20260728235900','20260729001500','20260729003000']::text[]);";
}

function historySnapshotSql() {
  return `select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.version), '[]'::jsonb)
    from (
      select version, statements, name
      from supabase_migrations.schema_migrations
      where version not in ('20260728230000','20260728235900','20260729001500','20260729003000')
    ) row_data;`;
}

function rollbackGateCoverageSql() {
  return `select jsonb_build_object(
    'metadata', (select count(*) from public.hugo_rollback_gate_tables),
    'public_policies', (select count(*) from pg_catalog.pg_policies where policyname = 'hugo_rollback_fail_closed' and schemaname = 'public'),
    'storage_policies', (select count(*) from pg_catalog.pg_policies where policyname = 'hugo_rollback_fail_closed' and schemaname = 'storage')
  )::text;`;
}

function authenticatedProfileCountSql() {
  return `begin;
    set local role authenticated;
    set local request.jwt.claim.role = 'authenticated';
    set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
    select count(*)::text from public.profiles;
    rollback;`;
}

function authenticatedProfileWriteCountSql() {
  return `begin;
    set local role authenticated;
    set local request.jwt.claim.role = 'authenticated';
    set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000101';
    with attempted as (
      update public.profiles
      set full_name = full_name
      where id = '00000000-0000-4000-8000-000000000101'
      returning id
    ) select count(*)::text from attempted;
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
    insert into public.hugo_access_operations (
      operation_id, operation, email, input, receipt
    ) values (
      '00000000-0000-4000-8000-000000000601', 'inspect', 'rollback-owner@example.invalid',
      '{"scope":"roundtrip"}'::jsonb, '{"status":"fixture"}'::jsonb
    );
    insert into storage.objects (id, bucket_id, name, owner, metadata)
    values (
      '00000000-0000-4000-8000-000000000701', 'hugo', 'roundtrip.txt',
      '00000000-0000-4000-8000-000000000101', '{"fixture":true}'::jsonb
    );
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
  return "select public.hugo_roundtrip_snapshot()::text;";
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
    create or replace function public.hugo_roundtrip_snapshot()
    returns jsonb
    language plpgsql
    security definer
    set search_path = public, pg_catalog
    as $snapshot$
    declare
      v_result jsonb := jsonb_build_object(
        'auth.users', (select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id), '[]'::jsonb) from (select * from auth.users) row_data),
        'storage.objects', (select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id), '[]'::jsonb) from (select * from storage.objects) row_data)
      );
      v_table record;
      v_rows jsonb;
    begin
      for v_table in
        select relation.relname as table_name
        from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r', 'p')
          and relation.relname not in ('hugo_access_settings', 'hugo_access_enforcement_changes')
          and relation.relname not like 'hugo_rollback_%'
        order by relation.relname
      loop
        execute format(
          'select coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text), ''[]''::jsonb) from (select * from public.%I) row_data',
          v_table.table_name
        ) into v_rows;
        v_result := v_result || jsonb_build_object(format('public.%s', v_table.table_name), v_rows);
      end loop;
      return v_result;
    end;
    $snapshot$;
  `;
}
