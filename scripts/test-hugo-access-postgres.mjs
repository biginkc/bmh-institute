#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  verifyAuthInsertLifecycleSerialization,
  verifyRoleGroupDeleteLifecycleSerialization,
  verifyRoleGroupTruncateLifecycleSerialization,
} from "./hugo-auth-insert-concurrency-test.mjs";

const root = resolve(import.meta.dirname, "..");
const requestedBin = process.argv.find((value) => value.startsWith("--pg-bin="))
  ?.slice("--pg-bin=".length);
const candidates = requestedBin
  ? [resolve(requestedBin)]
  : [
      "/opt/homebrew/opt/postgresql@15/bin",
      "/opt/homebrew/opt/postgresql@16/bin",
      "/opt/homebrew/opt/postgresql@17/bin",
      execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim(),
    ];
const seenMajors = new Set();
const pgBins = [...new Set(candidates)].filter((directory) => {
  if (!existsSync(join(directory, "postgres"))) return false;
  const major = execFileSync(join(directory, "pg_config"), ["--version"], {
    encoding: "utf8",
  }).match(/PostgreSQL (\d+)/)?.[1];
  if (!major || seenMajors.has(major)) return false;
  seenMajors.add(major);
  return true;
});

async function runPostgres(pgBin, index) {
  const major = Number(
    execFileSync(join(pgBin, "pg_config"), ["--version"], {
      encoding: "utf8",
    }).match(/PostgreSQL (\d+)/)?.[1],
  );
  if (![15, 16, 17].includes(major)) {
    throw new Error(`Unsupported PostgreSQL version in ${pgBin}.`);
  }

  const cluster = mkdtempSync(join(tmpdir(), `bmhi-hugo-pg${major}-`));
  const socket = join(cluster, "socket");
  const port = String(57000 + (process.pid % 500) + index);
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
      "-D",
      cluster,
      "-A",
      "trust",
      "-U",
      "postgres",
      "--no-locale",
      "--encoding=UTF8",
    ], { stdio: "ignore" });
    execFileSync("mkdir", ["-p", socket]);
    execFileSync(
      binary("pg_ctl"),
      ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"],
      { env, stdio: "ignore" },
    );

    psqlText(binary, env, bootstrapSql(major));

    const migrations = readdirSync(resolve(root, "supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const migration of migrations) {
      if (migration === "20260729040000_hugo_mutation_receipt_binding.sql") {
        psqlText(binary, env, historicalUnboundReceiptSql);
      }
      psqlFile(binary, env, resolve(root, "supabase/migrations", migration));
    }
    psqlFile(
      binary,
      env,
      resolve(
        root,
        "supabase/migrations/20260729001500_hugo_auth_insert_lifecycle_lock.sql",
      ),
    );
    psqlFile(
      binary,
      env,
      resolve(
        root,
        "supabase/migrations/20260729003000_hugo_auth_email_lifecycle_lock.sql",
      ),
    );
    for (const test of [
      "055_hugo_access_provisioner.sql",
      "056_hugo_access_operation_payload_hash.sql",
      "057_hugo_access_authorization_hardening.sql",
      "058_hugo_missing_identity_durable_proof.sql",
      "059_hugo_auth_insert_lifecycle_lock.sql",
      "060_hugo_auth_email_lifecycle_lock.sql",
      "061_hugo_mutation_receipt_binding.sql",
      "062_hugo_verified_identity_and_orphan_delete_guard.sql",
      "063_hugo_post_merge_security_closure.sql",
    ]) {
      const path = resolve(root, "supabase/tests", test);
      if (existsSync(path)) psqlFile(binary, env, path);
    }

    const authInsertSerialization =
      await verifyAuthInsertLifecycleSerialization({
        psqlPath: binary("psql"),
        env,
      });
    const roleGroupDeleteSerialization =
      await verifyRoleGroupDeleteLifecycleSerialization({
        psqlPath: binary("psql"),
        env,
      });
    const roleGroupTruncateSerialization =
      await verifyRoleGroupTruncateLifecycleSerialization({
        psqlPath: binary("psql"),
        env,
      });

    psqlText(binary, env, concurrencyFixtureSql);
    const outcomes = await Promise.all([
      concurrentDelete(binary, env, "00000000-0000-4000-8000-000000000901"),
      concurrentDelete(binary, env, "00000000-0000-4000-8000-000000000902"),
    ]);
    const failures = outcomes.filter((outcome) => outcome.code !== 0);
    if (
      failures.length !== 2 ||
      failures.some((outcome) =>
        !outcome.stderr.includes(
          "Hugo owner grants must be changed through a lifecycle RPC.",
        ),
      )
    ) {
      throw new Error(
        `Concurrent final-owner grant guard failed: ${JSON.stringify(outcomes)}`,
      );
    }
    const remaining = psqlText(
      binary,
      env,
      "select count(*) from public.hugo_access_grants where user_id in ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902');",
    ).trim();
    if (remaining !== "2") {
      throw new Error(`Expected both owner grants after blocked direct contention, found ${remaining}.`);
    }

    return {
      postgres_major: major,
      migrations: migrations.length,
      focused_sql_tests: 9,
      auth_insert_lifecycle_serialization: authInsertSerialization,
      role_group_delete_lifecycle_serialization:
        roleGroupDeleteSerialization,
      role_group_truncate_lifecycle_serialization:
        roleGroupTruncateSerialization,
      concurrent_owner_deletes: "both_direct_mutations_blocked",
    };
  } finally {
    try {
      execFileSync(
        binary("pg_ctl"),
        ["-D", cluster, "-m", "fast", "-w", "stop"],
        { env, stdio: "ignore" },
      );
    } catch {}
    rmSync(cluster, { recursive: true, force: true });
  }
}

function psqlFile(binary, env, file) {
  try {
    return execFileSync(
      binary("psql"),
      ["-X", "-v", "ON_ERROR_STOP=1", "-f", file],
      { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

function psqlText(binary, env, sql) {
  try {
    return execFileSync(
      binary("psql"),
      ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

function concurrentDelete(binary, env, userId) {
  return new Promise((resolveOutcome) => {
    const child = spawn(
      binary("psql"),
      [
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `begin; delete from public.hugo_access_grants where user_id = '${userId}'; select pg_sleep(0.5); commit;`,
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolveOutcome({ code, stdout, stderr });
    });
  });
}

function bootstrapSql(major) {
  const roleMembership = major === 15
    ? "grant anon, authenticated, service_role, authenticator to postgres with admin option;"
    : "grant anon, authenticated, service_role, authenticator to postgres with admin option;";
  return `
    create role anon nologin inherit;
    create role authenticated nologin inherit;
    create role service_role nologin inherit bypassrls;
    create role authenticator login noinherit;
    create role supabase_storage_admin nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    ${roleMembership}
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
    grant execute on function auth.uid(), auth.role()
      to anon, authenticated, service_role;
    create table auth.users (
      instance_id uuid,
      id uuid primary key,
      aud text,
      role text,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      invited_at timestamptz,
      confirmation_token text,
      confirmation_sent_at timestamptz,
      recovery_token text,
      recovery_sent_at timestamptz,
      email_change_token_new text,
      email_change text,
      email_change_sent_at timestamptz,
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      is_super_admin boolean,
      created_at timestamptz,
      updated_at timestamptz,
      phone text,
      phone_confirmed_at timestamptz,
      confirmed_at timestamptz,
      is_anonymous boolean default false
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
      bucket_id text not null,
      name text not null,
      owner uuid,
      owner_id text,
      metadata jsonb,
      user_metadata jsonb,
      version text,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      last_accessed_at timestamptz default now()
    );
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;

    alter default privileges in schema public
      grant select, insert, update, delete on tables to authenticated;
    alter database postgres set search_path = public, extensions;
  `;
}

const concurrencyFixtureSql = `
  set request.jwt.claim.role = 'service_role';
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-4000-8000-000000000901', 'owner-a@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('00000000-0000-4000-8000-000000000902', 'owner-b@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());
  update public.profiles
  set system_role = 'owner', status = 'active'
  where id in (
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000902'
  );
  insert into public.hugo_access_grants (
    user_id, email, app_user_id, role, desired_status
  ) values
    ('00000000-0000-4000-8000-000000000901', 'owner-a@example.invalid', '00000000-0000-4000-8000-000000000901', 'owner', 'active'),
    ('00000000-0000-4000-8000-000000000902', 'owner-b@example.invalid', '00000000-0000-4000-8000-000000000902', 'owner', 'active');
`;

const historicalUnboundReceiptSql = `
  set request.jwt.claim.role = 'service_role';
  select public.hugo_apply_access(
    '00000000-0000-4000-8000-000000000961',
    'historical-receipt@example.invalid',
    'not-a-role',
    '{}'::jsonb,
    'active',
    null,
    null
  );
  do $$
  declare
    v_receipt jsonb;
    v_hash text;
  begin
    select receipt, request_hash into v_receipt, v_hash
    from public.hugo_access_operations
    where operation_id = '00000000-0000-4000-8000-000000000961';
    assert v_receipt->>'operation_id' =
      '00000000-0000-4000-8000-000000000961',
      'historical receipt must already contain its operation id';
    assert not (v_receipt ? 'request_hash'),
      'historical fixture must precede receipt hash binding';
    assert v_hash ~ '^[0-9a-f]{64}$',
      'historical fixture must already have a journal request hash';
  end;
  $$;
`;

if (pgBins.length === 0) {
  throw new Error("No local PostgreSQL 15, 16, or 17 binaries were found.");
}

const results = [];
for (const [index, pgBin] of pgBins.entries()) {
  results.push(await runPostgres(pgBin, index));
}
const testedMajors = new Set(results.map((result) => result.postgres_major));
console.log(JSON.stringify({
  status: "PASS",
  results,
  unavailable_postgres_majors: [15, 16, 17].filter(
    (major) => !testedMajors.has(major),
  ),
}));
