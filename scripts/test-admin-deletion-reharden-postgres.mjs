#!/usr/bin/env node
// Dedicated executable coverage for
// supabase/migrations/20260730280000_reharden_admin_deletion_functions.sql.
//
// src/lib/release-control/admin-deletion-migration.test.ts only reads
// 20260730100000's SQL text as a string -- it never executes the migration
// chain, so it cannot catch a wrong body hash, an owner/current_user
// mismatch, an ACL predicate regression, or a failed pre-commit recheck in
// 20260730280000. This script runs the actual 20260730270000 ->
// 20260730280000 sequence against a disposable local Postgres cluster
// (production-shaped roles/ACLs, following the same LC_ALL=C + short-socket
// pattern as scripts/test-hugo-access-postgres.mjs) and asserts on the real
// post-commit state: function owner, body hash, and ACL -- plus the actual
// behavioral property this migration exists to protect (a NULL
// p_entity_type is refused, not silently accepted).
//
// It also rehearses the three drift scenarios 20260730280000's baseline
// guard exists to catch -- a grantable EXECUTE grant, an unexpected
// function owner, and a foreign function body -- and asserts the migration
// refuses (rolls back, makes zero changes) rather than silently proceeding.
//
// This does not include 20260730260000_forward_security_boundaries.sql
// (PR #157): that file does not exist in this branch's tree (PR #157 is
// still open), and 20260730280000 is designed and already verified
// (PR #162 description) not to depend on it. The 270000 -> 280000 sequence
// tested here is the one Codex's round-4 review specifically asked for.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationsDir = resolve(root, "supabase/migrations");

// Self-attestation "fixture cleanup" gates that fail in this ad hoc local
// bootstrap because it doesn't reproduce their exact controller-contract
// fingerprints. Unrelated to admin deletion or is_admin -- the project's
// own scripts/test-hugo-access-postgres.mjs hits the identical wall at the
// same migration (036) in this same local environment, confirming this is
// a pre-existing environment limitation, not something specific to this
// script.
const SKIP_MIGRATIONS = new Set([
  "036_controller_verified_fixture_cleanup_gate.sql",
  "038_refresh_fixture_progress_fingerprints.sql",
  "051_quiz_answer_privacy_snapshots.sql",
]);

const TARGET_MIGRATION_UP_TO = "20260730270000_apply_missing_admin_deletion_functions.sql";
const TARGET_MIGRATION = "20260730280000_reharden_admin_deletion_functions.sql";

const HARDENED_MD5 = {
  fn_admin_preview_deletion_v1: "8c66a3213456123f55a86d865a73e909",
  fn_admin_delete_catalog_entity_v1: "8e25647f33bb2cce249d77d2f5a9595c",
};
const VULNERABLE_MD5 = {
  fn_admin_preview_deletion_v1: "11666f54928b682a6ef05d4a2407f3eb",
  fn_admin_delete_catalog_entity_v1: "c939eb40e97681ea8e2d42fde77c8cd0",
};

const requestedBin = process.argv
  .find((value) => value.startsWith("--pg-bin="))
  ?.slice("--pg-bin=".length);
const candidates = requestedBin
  ? [resolve(requestedBin)]
  : [
      "/opt/homebrew/opt/postgresql@15/bin",
      "/opt/homebrew/opt/postgresql@16/bin",
      "/opt/homebrew/opt/postgresql@17/bin",
      execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim(),
    ];
const pgBin = [...new Set(candidates)].find((directory) =>
  existsSync(join(directory, "postgres")),
);
if (!pgBin) {
  throw new Error("No local PostgreSQL 15, 16, or 17 binaries were found.");
}

function binary(name) {
  return join(pgBin, name);
}

function psqlFile(env, file, { allowFailure = false } = {}) {
  try {
    const stdout = execFileSync(
      binary("psql"),
      ["-X", "-v", "ON_ERROR_STOP=1", "-f", file],
      { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ok: true, stdout, stderr: "" };
  } catch (error) {
    if (!allowFailure) {
      process.stderr.write(error.stdout ?? "");
      process.stderr.write(error.stderr ?? "");
      throw error;
    }
    return { ok: false, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

function psqlText(env, sql) {
  try {
    return execFileSync(
      binary("psql"),
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

function bootstrapSql() {
  return `
    create role anon nologin inherit;
    create role authenticated nologin inherit;
    create role service_role nologin inherit bypassrls;
    create role authenticator login noinherit;
    grant anon, authenticated, service_role to authenticator;
    grant anon, authenticated, service_role, authenticator to postgres with admin option;

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
    grant execute on function auth.uid(), auth.role()
      to anon, authenticated, service_role;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (
      id text primary key,
      name text not null,
      owner uuid,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table storage.objects (
      id uuid primary key default extensions.gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      metadata jsonb
    );
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    grant select on storage.buckets, storage.objects to anon, authenticated, service_role;

    alter default privileges in schema public
      grant select, insert, update, delete on tables to authenticated;
    alter database postgres set search_path = public, extensions;
  `;
}

async function withCluster(name, fn) {
  const cluster = mkdtempSync(join(tmpdir(), `bmhi-reharden-${name}-`));
  const socket = join(cluster, "sock");
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
  try {
    execFileSync(binary("initdb"), [
      "-D", cluster, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8",
    ], { stdio: "ignore" });
    execFileSync("mkdir", ["-p", socket]);
    execFileSync(
      binary("pg_ctl"),
      ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"],
      { env, stdio: "ignore" },
    );
    psqlText(env, bootstrapSql());
    return await fn({ env, cluster });
  } finally {
    try {
      execFileSync(binary("pg_ctl"), ["-D", cluster, "-m", "fast", "-w", "stop"], { env, stdio: "ignore" });
    } catch {}
    rmSync(cluster, { recursive: true, force: true });
  }
}

function sortedMigrations() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && !SKIP_MIGRATIONS.has(file))
    .sort();
}

function applyThrough270000(env) {
  const migrations = sortedMigrations();
  const cutoffIndex = migrations.indexOf(TARGET_MIGRATION_UP_TO);
  if (cutoffIndex === -1) {
    throw new Error(`${TARGET_MIGRATION_UP_TO} not found in supabase/migrations`);
  }
  for (const migration of migrations.slice(0, cutoffIndex + 1)) {
    psqlFile(env, resolve(migrationsDir, migration));
  }
}

function applyTarget(env, { allowFailure = false } = {}) {
  return psqlFile(env, resolve(migrationsDir, TARGET_MIGRATION), { allowFailure });
}

function functionState(env) {
  const rows = psqlText(
    env,
    `select p.proname, md5(p.prosrc), (select r.rolname from pg_roles r where r.oid = p.proowner), p.proacl::text
     from pg_proc p
     where p.proname in ('fn_admin_preview_deletion_v1', 'fn_admin_delete_catalog_entity_v1')
     order by p.proname;`,
  ).trim();
  const state = {};
  for (const line of rows.split("\n").filter(Boolean)) {
    const [proname, md5, owner, acl] = line.split("|");
    state[proname] = { md5, owner, acl };
  }
  return state;
}

function setUpAdmin(env) {
  psqlText(
    env,
    `insert into public.hugo_access_settings (singleton, enforce_grants) values (true, false)
       on conflict (singleton) do update set enforce_grants = false;
     insert into auth.users (id, email) values
       ('11111111-1111-1111-1111-111111111111', 'admin@test.invalid')
       on conflict (id) do nothing;
     insert into public.profiles (id, email, full_name, system_role, status) values
       ('11111111-1111-1111-1111-111111111111', 'admin@test.invalid', 'Test Admin', 'admin', 'active')
       on conflict (id) do update set system_role = 'admin', status = 'active';`,
  );
}

function callPreviewAsAdmin(env, entityType, entityId) {
  const entityTypeSql = entityType === null ? "null" : `'${entityType}'`;
  return psqlText(
    env,
    `begin;
     set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
     select public.fn_admin_preview_deletion_v1(${entityTypeSql}, '${entityId}'::uuid) ->> 'code';
     rollback;`,
  ).trim();
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function assertHardened(state, label) {
  for (const fn of Object.keys(HARDENED_MD5)) {
    assertEquals(state[fn]?.md5, HARDENED_MD5[fn], `${label}: ${fn} body hash must be hardened`);
    assertEquals(state[fn]?.owner, "postgres", `${label}: ${fn} owner must be the migrating role`);
    if (state[fn]?.acl.includes("*")) {
      throw new Error(`${label}: ${fn} ACL must not contain a grantable ('*') entry, got ${state[fn].acl}`);
    }
    if (!state[fn]?.acl.includes("authenticated=X")) {
      throw new Error(`${label}: ${fn} ACL must grant non-grantable EXECUTE to authenticated, got ${state[fn]?.acl}`);
    }
  }
}

async function testFreshSequenceHardenedAndBehaviorallyCorrect() {
  return withCluster("fresh", async ({ env }) => {
    applyThrough270000(env);
    const beforeState = functionState(env);
    for (const fn of Object.keys(VULNERABLE_MD5)) {
      assertEquals(beforeState[fn]?.md5, VULNERABLE_MD5[fn], `pre-280000: ${fn} must start on the known vulnerable pre-image`);
    }
    setUpAdmin(env);
    const beforeResult = callPreviewAsAdmin(env, null, "22222222-2222-2222-2222-222222222222");
    assertEquals(beforeResult, "ready", "pre-280000: NULL p_entity_type must reproduce the live bypass ('ready', not rejected)");

    applyTarget(env);
    const afterState = functionState(env);
    assertHardened(afterState, "post-280000");
    const afterResult = callPreviewAsAdmin(env, null, "22222222-2222-2222-2222-222222222222");
    assertEquals(afterResult, "invalid_target", "post-280000: NULL p_entity_type must be refused");

    // Idempotent rerun: must succeed again with identical state.
    applyTarget(env);
    const rerunState = functionState(env);
    assertHardened(rerunState, "post-280000-idempotent-rerun");

    return { scenario: "fresh_270000_to_280000_sequence", status: "PASS" };
  });
}

async function testAclGrantOptionRefused() {
  return withCluster("acl", async ({ env }) => {
    applyThrough270000(env);
    psqlText(
      env,
      "grant execute on function public.fn_admin_delete_catalog_entity_v1(text, uuid) to authenticated with grant option;",
    );
    const before = functionState(env);
    const result = applyTarget(env, { allowFailure: true });
    if (result.ok) {
      throw new Error("ACL-negative case: migration was expected to refuse a grantable EXECUTE grant, but it succeeded");
    }
    if (!result.stderr.includes("security baseline")) {
      throw new Error(`ACL-negative case: refusal message did not mention the security baseline: ${result.stderr}`);
    }
    const after = functionState(env);
    assertEquals(JSON.stringify(after), JSON.stringify(before), "ACL-negative case: migration must make zero changes when it refuses");
    return { scenario: "acl_grant_option_refused", status: "PASS" };
  });
}

async function testOwnerDriftRefused() {
  return withCluster("owner", async ({ env }) => {
    applyThrough270000(env);
    psqlText(env, "create role rogue_owner superuser;");
    psqlText(env, "alter function public.fn_admin_delete_catalog_entity_v1(text, uuid) owner to rogue_owner;");
    const before = functionState(env);
    const result = applyTarget(env, { allowFailure: true });
    if (result.ok) {
      throw new Error("Owner-drift case: migration was expected to refuse an unexpected function owner, but it succeeded");
    }
    if (!result.stderr.includes("is owned by")) {
      throw new Error(`Owner-drift case: refusal message did not mention ownership: ${result.stderr}`);
    }
    const after = functionState(env);
    assertEquals(JSON.stringify(after), JSON.stringify(before), "Owner-drift case: migration must make zero changes when it refuses");
    return { scenario: "owner_drift_refused", status: "PASS" };
  });
}

async function testTamperedBodyRefused() {
  return withCluster("tamper", async ({ env }) => {
    applyThrough270000(env);
    psqlText(
      env,
      `create or replace function public.fn_admin_preview_deletion_v1(p_entity_type text, p_entity_id uuid)
       returns jsonb language plpgsql security definer set search_path = public as $$
       begin return jsonb_build_object('code', 'tampered'); end;
       $$;`,
    );
    const before = functionState(env);
    const result = applyTarget(env, { allowFailure: true });
    if (result.ok) {
      throw new Error("Tampered-body case: migration was expected to refuse an unrecognized function body, but it succeeded");
    }
    if (!result.stderr.includes("unrecognized body")) {
      throw new Error(`Tampered-body case: refusal message did not mention an unrecognized body: ${result.stderr}`);
    }
    const after = functionState(env);
    assertEquals(JSON.stringify(after), JSON.stringify(before), "Tampered-body case: migration must make zero changes when it refuses");
    return { scenario: "tampered_body_refused", status: "PASS" };
  });
}

const results = [];
for (const test of [
  testFreshSequenceHardenedAndBehaviorallyCorrect,
  testAclGrantOptionRefused,
  testOwnerDriftRefused,
  testTamperedBodyRefused,
]) {
  results.push(await test());
}

console.log(JSON.stringify({ status: "PASS", results }, null, 2));
