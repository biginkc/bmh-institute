#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const externalMode = process.env.FIXTURE_GATE_EXTERNAL_PG;
if (externalMode !== undefined && externalMode !== "1") {
  throw new Error("FIXTURE_GATE_EXTERNAL_PG must be absent or exactly 1.");
}
const useExternalPostgres = externalMode === "1";
const cluster = useExternalPostgres
  ? null
  : await mkdtemp(join(tmpdir(), "bmh-controller-gate-pg-"));
const socket = cluster === null ? null : join(cluster, "socket");
const port = String(55000 + (process.pid % 1000));
const pgBindir = useExternalPostgres
  ? null
  : execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
const binary = (name) => (pgBindir === null ? name : join(pgBindir, name));
const pgEnv = useExternalPostgres
  ? { ...process.env }
  : {
      ...process.env,
      PGHOST: socket,
      PGPORT: port,
      PGDATABASE: "postgres",
      PGUSER: "postgres",
    };

if (
  useExternalPostgres &&
  (!["127.0.0.1", "localhost"].includes(pgEnv.PGHOST ?? "") ||
    pgEnv.PGDATABASE !== "postgres" ||
    pgEnv.PGUSER !== "postgres")
) {
  throw new Error(
    "External controller-gate PostgreSQL must be local postgres/postgres.",
  );
}

try {
  if (cluster !== null && socket !== null) {
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
    exec("mkdir", ["-p", socket]);
    execFileSync(
      binary("pg_ctl"),
      ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"],
      { env: pgEnv, stdio: "ignore" },
    );
  }
  psqlText(`
    create role anon nologin inherit;
    create role authenticated nologin inherit;
    create role service_role nologin inherit bypassrls;
    create role authenticator login noinherit;
    create role supabase_storage_admin nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    do $$
    begin
      if current_setting('server_version_num')::integer / 10000 = 15 then
        grant anon, authenticated, service_role to postgres;
      else
        grant anon, authenticated, service_role, authenticator
          to postgres with admin option;
      end if;
    end;
    $$;
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
  const migrations = (await readdir(resolve(root, "supabase/migrations")))
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort();
  for (const required of [
    "033_import_qa_access_and_delete_guards.sql",
    "034_import_release_and_fixture_dependency_guards.sql",
    "036_controller_verified_fixture_cleanup_gate.sql",
  ]) {
    if (!migrations.includes(required)) {
      throw new Error(`Current migration stack is missing ${required}.`);
    }
  }
  for (const migration of migrations) {
    const migrationPath = resolve(root, "supabase/migrations", migration);
    if (migration === "038_refresh_fixture_progress_fingerprints.sql") {
      replayProgressFingerprintMigration(migrationPath);
    } else {
      psqlFile(migrationPath);
    }
  }
  psqlFile(
    resolve(
      root,
      "supabase/tests/031_versioned_video_completion_and_submission_evidence.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/034_import_release_and_fixture_dependency_guards.sql",
    ),
  );
  psqlText(`
    do $$
    begin
      if to_regprocedure(
        'public.fn_user_has_unreleased_import_qa_program_access(uuid,uuid)'
      ) is null then
        raise exception 'migration 033 QA access guard is absent';
      end if;
      if not exists (
        select 1 from private.fixture_cleanup_references_v1
        where child_table = 'sandra_course_completion_deliveries'
          and child_field = 'course_id'
          and parent_table = 'courses'
      ) or not exists (
        select 1 from private.fixture_cleanup_references_v1
        where child_table = 'user_video_completion_history'
          and child_field = 'block_id'
          and parent_table = 'content_blocks'
      ) then
        raise exception 'migration 034 dependency guards are absent';
      end if;
    end;
    $$;
  `);
  const controllerEnv = {
    FIXTURE_CLEANUP_PROJECT_REF: "dhvfsyteqsxagokoerrx",
    FIXTURE_CLEANUP_CONTROLLER_KEY_ID: "pr-harness-provisioned-v1",
    FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET:
      "pr-harness-controller-secret-with-at-least-32-characters",
  };
  const leakedSecret = "must-not-appear-in-provisioning-stderr";
  expectPsqlFileFailure(
    resolve(root, "scripts/fixture-boundary/provision-controller-key.sql"),
    {
      ...controllerEnv,
      FIXTURE_CLEANUP_CONTROLLER_KEY_ID: "INVALID KEY ID",
      FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET: leakedSecret,
    },
    "invalid key material",
    leakedSecret,
  );
  psqlFile(
    resolve(root, "scripts/fixture-boundary/provision-controller-key.sql"),
    controllerEnv,
  );
  const secondControllerEnv = {
    ...controllerEnv,
    FIXTURE_CLEANUP_CONTROLLER_KEY_ID: "pr-harness-provisioned-v2",
    FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET:
      "second-pr-harness-controller-secret-at-least-32-characters",
  };
  expectPsqlFileFailure(
    resolve(root, "scripts/fixture-boundary/provision-controller-key.sql"),
    secondControllerEnv,
    "an active key already exists",
    secondControllerEnv.FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET,
  );
  psqlText(`
    do $$
    begin
      if (select count(*) from private.fixture_cleanup_controller_keys_v1
          where is_active and retired_at is null) <> 1 then
        raise exception 'controller key single-active invariant failed';
      end if;
    end;
    $$;
  `);
  psqlFile(
    resolve(root, "scripts/fixture-boundary/retire-controller-key.sql"),
    controllerEnv,
  );
  psqlFile(
    resolve(root, "scripts/fixture-boundary/provision-controller-key.sql"),
    secondControllerEnv,
  );
  psqlFile(
    resolve(root, "scripts/fixture-boundary/retire-controller-key.sql"),
    secondControllerEnv,
  );
  psqlFile(
    resolve(
      root,
      "scripts/fixture-boundary/controller-gate-pr-destructive-test.sql",
    ),
  );
  const adversarialContractTest = resolve(
    root,
    "supabase/tests/036_controller_verified_fixture_cleanup_gate.sql",
  );
  expectPsqlFileFailure(
    adversarialContractTest,
    {},
    "requires fixture_cleanup_isolated_superuser=on",
  );
  psqlFile(
    adversarialContractTest,
    {},
    { fixture_cleanup_isolated_superuser: "on" },
  );
  const hostedContractTest = resolve(
    root,
    "supabase/tests/036_controller_verified_fixture_cleanup_gate_hosted.sql",
  );
  expectPsqlFileFailure(
    hostedContractTest,
    {},
    "requires fixture_cleanup_hosted_nonmutating=on",
  );
  psqlFile(
    hostedContractTest,
    {},
    { fixture_cleanup_hosted_nonmutating: "on" },
  );
  psqlFile(
    resolve(
      root,
      "scripts/fixture-boundary/disable-controller-gated-cleanup.sql",
    ),
    controllerEnv,
  );
  psqlText(`
    do $$
    begin
      if to_regprocedure('public.admin_cleanup_fixture_catalog_v1(text,text,jsonb,jsonb)') is not null then
        raise exception 'forward disable left the public cleanup wrapper reachable';
      end if;
      if has_function_privilege(
        'service_role',
        'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)',
        'execute'
      ) then
        raise exception 'forward disable restored the historical cleanup bypass';
      end if;
      if exists (
        select 1 from private.fixture_cleanup_controller_keys_v1 where is_active
      ) then
        raise exception 'forward disable left a controller key active';
      end if;
    end;
    $$;
  `);
  console.log(
    JSON.stringify({ status: "passed", harness: "controller-gate-pr" }),
  );
} finally {
  if (cluster !== null) {
    try {
      execFileSync(
        binary("pg_ctl"),
        ["-D", cluster, "-m", "fast", "-w", "stop"],
        {
          env: pgEnv,
          stdio: "ignore",
        },
      );
    } catch {}
    await rm(cluster, { recursive: true, force: true });
  }
}

function psqlText(sql) {
  exec(binary("psql"), ["-v", "ON_ERROR_STOP=1", "-c", sql]);
}

function psqlScalar(sql) {
  return exec(binary("psql"), [
    "-v",
    "ON_ERROR_STOP=1",
    "-A",
    "-t",
    "-c",
    sql,
  ])
    .toString()
    .trim();
}

function psqlFile(path, extraEnv = {}, variables = {}) {
  const args = ["-v", "ON_ERROR_STOP=1"];
  for (const [key, value] of Object.entries(variables)) {
    args.push("-v", `${key}=${value}`);
  }
  args.push("-f", path);
  exec(binary("psql"), args, extraEnv);
}

function expectPsqlFileFailure(path, extraEnv, expectedText, forbiddenSecret) {
  try {
    psqlFile(path, extraEnv);
  } catch (error) {
    const output = `${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`;
    if (!output.includes(expectedText)) {
      throw new Error(
        `Expected provisioning refusal containing: ${expectedText}`,
      );
    }
    if (forbiddenSecret && output.includes(forbiddenSecret)) {
      throw new Error(
        "Controller provisioning leaked secret material to stderr.",
      );
    }
    return;
  }
  throw new Error("Expected controller provisioning to fail closed.");
}

function replayProgressFingerprintMigration(migrationPath) {
  const unrelatedProgressId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  psqlText(`
    do $$
    begin
      if (select count(*) from private.fixture_cleanup_boundary_v1
          where table_name = 'user_block_progress') <> 67 then
        raise exception 'fixture progress boundary count changed from exactly 67';
      end if;
      if exists (
        select 1 from private.fixture_cleanup_boundary_v1
        where table_name = 'user_block_progress'
          and identity_key = '${unrelatedProgressId}'
      ) then
        raise exception 'unrelated progress regression ID overlaps fixture boundary';
      end if;
    end;
    $$;

    set session_replication_role = replica;
    insert into public.user_block_progress (
      id, user_id, block_id, completed_at, asset_version
    ) values (
      '${unrelatedProgressId}',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '2026-07-18 12:34:56.789012+00',
      null
    );
    insert into public.user_block_progress (
      id, user_id, block_id, completed_at, asset_version
    )
    select
      boundary.identity_key::uuid,
      boundary.identity_key::uuid,
      boundary.identity_key::uuid,
      '2026-07-18 12:34:56.789012+00'::timestamptz,
      case when row_number() over (order by boundary.identity_key) = 1
        then 'fixture-owned-non-null-must-block'
        else null
      end
    from private.fixture_cleanup_boundary_v1 boundary
    where boundary.table_name = 'user_block_progress';
    set session_replication_role = origin;
  `);

  const unrelatedBefore = progressRowBytes(unrelatedProgressId);
  expectPsqlFileFailure(
    migrationPath,
    {},
    "fixture progress fingerprint refresh blocked: fixture-owned progress rows",
  );
  const fixtureRowsAfterRefusal = psqlScalar(`
    select count(*)::text || '|' ||
      count(*) filter (where progress.asset_version is not null)::text
    from public.user_block_progress progress
    join private.fixture_cleanup_boundary_v1 boundary
      on boundary.table_name = 'user_block_progress'
     and boundary.identity_key = progress.id::text
  `);
  if (fixtureRowsAfterRefusal !== "67|1") {
    throw new Error(
      "fixture-owned progress with non-null asset_version was accepted",
    );
  }

  psqlText(`
    delete from public.user_block_progress progress
    using private.fixture_cleanup_boundary_v1 boundary
    where boundary.table_name = 'user_block_progress'
      and boundary.identity_key = progress.id::text;
  `);
  psqlFile(migrationPath);

  const unrelatedAfter = progressRowBytes(unrelatedProgressId);
  if (unrelatedAfter !== unrelatedBefore) {
    throw new Error("unrelated progress row changed during migration 038");
  }
  const boundaryCounts = psqlScalar(`
    select
      count(*)::text || '|' ||
      count(*) filter (
        where fingerprint_fields =
          array['asset_version', 'block_id', 'completed_at', 'id', 'user_id']::text[]
      )::text
    from private.fixture_cleanup_boundary_v1
    where table_name = 'user_block_progress'
  `);
  if (boundaryCounts !== "67|67") {
    throw new Error("fixture progress boundary count changed from exactly 67");
  }
  psqlText(`
    delete from public.user_block_progress
    where id = '${unrelatedProgressId}';
  `);
}

function progressRowBytes(id) {
  return psqlScalar(`
    select encode(
      convert_to(to_jsonb(progress)::text, 'UTF8'),
      'hex'
    )
    from public.user_block_progress progress
    where id = '${id}'
  `);
}

function exec(command, args, extraEnv = {}) {
  return execFileSync(command, args, {
    env: { ...pgEnv, ...extraEnv },
    stdio: "pipe",
  });
}
