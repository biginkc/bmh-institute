#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  verifyAuthInsertLifecycleSerialization,
} from "../hugo-auth-insert-concurrency-test.mjs";

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
    grant usage on schema auth to anon, authenticated, service_role;
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
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      created_at timestamptz,
      updated_at timestamptz
    );
    grant execute on function auth.uid(), auth.role()
      to anon, authenticated, service_role;
    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;
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
      owner uuid,
      metadata jsonb,
      user_metadata jsonb
    );
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    alter default privileges in schema public
      grant select, insert, update, delete on tables to authenticated;
    alter database postgres set search_path = public, extensions;
  `);
  const migrations = (await readdir(resolve(root, "supabase/migrations")))
    .filter((file) => /^(?:\d{3}|\d{14})_.+\.sql$/.test(file))
    .sort();
  for (const required of [
    "033_import_qa_access_and_delete_guards.sql",
    "034_import_release_and_fixture_dependency_guards.sql",
    "036_controller_verified_fixture_cleanup_gate.sql",
    "047_register_reviewer_answer_option_fixture_dependencies.sql",
    "20260722043000_replace_released_imported_video_posters.sql",
    "20260722235500_replace_released_imported_video_captions.sql",
    "20260726170000_revise_released_content_blocks.sql",
  ]) {
    if (!migrations.includes(required)) {
      throw new Error(`Current migration stack is missing ${required}.`);
    }
  }
  for (const migration of migrations) {
    const migrationPath = resolve(root, "supabase/migrations", migration);
    if (migration === "038_refresh_fixture_progress_fingerprints.sql") {
      replayProgressFingerprintMigration(migrationPath);
    } else if (migration === "051_quiz_answer_privacy_snapshots.sql") {
      replayQuizPrivacyMigration(migrationPath);
    } else {
      // Round-6 Codex review, finding 2: 20260728050000_apply_oral_check_pilot_role_play_blocks.sql
      // used to be special-cased out of this sweep, because the round-5
      // version of that migration raised unconditionally when no release
      // record existed -- which is true of every fresh cluster, and of every
      // real clean-database replay (supabase db reset, CI, a new preview or
      // test project). Skipping it here hid that breakage rather than
      // fixing it. That migration is now replay-safe (it skips with a NOTICE
      // only when the database holds no bmh-employee-training-v1 catalog at
      // all, and still fails closed when the catalog exists without a
      // release), so it is applied here in normal order like every other
      // migration -- and this sweep passing against a byte-fresh cluster is
      // what proves the replay safety.
      psqlFile(migrationPath);
    }
  }
  const reviewedLegacyDefinitionSha = psqlScalar(`
    select expected_sha256
    from private.fixture_cleanup_expected_function_contracts_v1
    where contract_name = 'moved_destructive'
  `);
  const reviewedLegacyAttesterSha = psqlScalar(`
    select expected_sha256
    from private.fixture_cleanup_expected_function_contracts_v1
    where contract_name = 'legacy_attester'
  `);
  psqlText(`
    do $$
    begin
      if not exists (
        select 1
        from private.fixture_cleanup_tables_v1
        where table_name = 'course_import_reviewer_answer_options_v1'
          and identity_fields = array['answer_option_id']::text[]
          and expected_count = 0
      ) or (
        select jsonb_agg(
          jsonb_build_object(
            'child_field', child_field,
            'parent_table', parent_table,
            'match_type', match_type
          )
          order by child_field
        )
        from private.fixture_cleanup_references_v1
        where child_table = 'course_import_reviewer_answer_options_v1'
      ) is distinct from '[
        {
          "child_field": "answer_option_id",
          "parent_table": "answer_options",
          "match_type": "scalar"
        },
        {
          "child_field": "program_id",
          "parent_table": "programs",
          "match_type": "scalar"
        },
        {
          "child_field": "question_id",
          "parent_table": "questions",
          "match_type": "scalar"
        }
      ]'::jsonb then
        raise exception 'migration 047 reviewer answer-option dependencies are absent';
      end if;
    end;
    $$;

    begin;
    create table public.fixture_cleanup_unknown_fk_probe (
      id uuid primary key,
      answer_option_id uuid references public.answer_options(id)
    );
    do $$
    begin
      begin
        perform private.admin_cleanup_fixture_catalog_v021_without_controller_gate(
          '84cd11f70007a28cbb0612f3d5ec34e3124a86377b7cda7d8e87ac6f1e587528',
          'DELETE-EXACT-BMH-INSTITUTE-FIXTURES:dhvfsyteqsxagokoerrx:84cd11f70007a28cbb0612f3d5ec34e3124a86377b7cda7d8e87ac6f1e587528'
        );
        raise exception 'unregistered foreign key was accepted';
      exception when others then
        if sqlerrm = 'unregistered foreign key was accepted' then
          raise;
        end if;
        if sqlerrm not like
          '%unknown foreign key fixture_cleanup_unknown_fk_probe.answer_option_id -> answer_options.id%'
        then
          raise exception 'unregistered foreign key failed for the wrong reason: %',
            sqlerrm;
        end if;
      end;
    end;
    $$;
    rollback;
  `);
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
  psqlFile(
    resolve(
      root,
      "supabase/tests/053_released_imported_video_caption_replacement.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/054_released_content_block_revision.sql",
    ),
  );
  psqlFile(
    resolve(root, "supabase/tests/055_hugo_access_provisioner.sql"),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/056_hugo_access_operation_payload_hash.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/057_hugo_access_authorization_hardening.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/058_hugo_missing_identity_durable_proof.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/migrations/20260729001500_hugo_auth_insert_lifecycle_lock.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/migrations/20260729003000_hugo_auth_email_lifecycle_lock.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/059_hugo_auth_insert_lifecycle_lock.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/060_hugo_auth_email_lifecycle_lock.sql",
    ),
  );
  await verifyAuthInsertLifecycleSerialization({
    psqlPath: binary("psql"),
    env: pgEnv,
  });
  psqlFile(
    resolve(
      root,
      "supabase/tests/056_oral_check_pilot_role_play_blocks.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/057_oral_check_pilot_role_play_rollback.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/058_oral_check_pilot_apply_ordering_gate.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/059_oral_check_pilot_apply_fail_closed.sql",
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
  await runOralCheckPilotChecksumTableContentionTest();
  await runOralCheckPilotRollbackLockTimeoutTest();
  console.log(
    JSON.stringify({
      status: "passed",
      harness: "controller-gate-pr",
      legacy_definition_sha256: reviewedLegacyDefinitionSha,
      legacy_attester_sha256: reviewedLegacyAttesterSha,
    }),
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

function replayQuizPrivacyMigration(migrationPath) {
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";
  const moduleId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03";
  const quizId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04";
  const lessonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05";
  const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06";
  const q1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11";
  const q2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12";
  const qMissing = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13";
  const q1Good = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21";
  const q1Bad = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22";
  const q2Good = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23";
  const q2Bad = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa24";
  const missingOption = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa25";
  const invalidAttempt = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31";
  const validAttempt = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32";
  const completedAttempt = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33";
  const reviewedLegacyAttesterSha = psqlScalar(`
    select expected_sha256
    from private.fixture_cleanup_expected_function_contracts_v1
    where contract_name = 'legacy_attester'
  `);

  psqlText(`
    set session_replication_role = replica;
    insert into auth.users (id) values ('${userId}');
    insert into public.profiles (id, email, full_name, status)
      values ('${userId}', 'privacy-harness@example.test', 'Privacy Harness', 'active');
    insert into public.role_groups (id, name) values ('${groupId}', 'Privacy Harness');
    insert into public.courses (id, title, is_published)
      values ('${courseId}', 'Privacy Harness', true);
    insert into public.course_access (course_id, role_group_id)
      values ('${courseId}', '${groupId}');
    insert into public.user_role_groups (user_id, role_group_id)
      values ('${userId}', '${groupId}');
    insert into public.modules (id, course_id, title)
      values ('${moduleId}', '${courseId}', 'Privacy Harness');
    insert into public.quizzes (id, title) values ('${quizId}', 'Privacy Harness');
    insert into public.lessons (id, module_id, title, lesson_type, quiz_id)
      values ('${lessonId}', '${moduleId}', 'Privacy Harness', 'quiz', '${quizId}');
    insert into public.questions (
      id, quiz_id, question_text, question_type, explanation, points
    ) values
      ('${q1}', '${quizId}', 'Q1', 'single_choice', 'Q1 explanation', 2),
      ('${q2}', '${quizId}', 'Q2', 'single_choice', 'Q2 explanation', 3);
    insert into public.answer_options (id, question_id, option_text, is_correct)
    values
      ('${q1Good}', '${q1}', 'Q1 good', true),
      ('${q1Bad}', '${q1}', 'Q1 bad', false),
      ('${q2Good}', '${q2}', 'Q2 good', true),
      ('${q2Bad}', '${q2}', 'Q2 bad', false);
    insert into public.user_quiz_attempts (
      id, user_id, quiz_id, lesson_id, question_order, answer_orders, responses
    ) values (
      '${invalidAttempt}', '${userId}', '${quizId}', '${lessonId}',
      '["${qMissing}"]',
      '{"${qMissing}":["${missingOption}"]}',
      '{}'
    );
    set session_replication_role = origin;
  `);

  expectPsqlFileFailure(
    migrationPath,
    {},
    "Incomplete legacy quiz attempts reference unavailable questions",
  );
  if (psqlScalar(`select to_regprocedure('public.fn_record_quiz_answer(uuid,uuid,text[])') is not null`) !== "t") {
    throw new Error("quiz privacy migration refusal did not roll back the prior RPC");
  }
  if (psqlScalar(`select count(*) from information_schema.columns where table_schema='public' and table_name='user_quiz_attempts' and column_name='answer_results'`) !== "0") {
    throw new Error("quiz privacy migration refusal left a partial schema change");
  }

  psqlText(`
    delete from public.user_quiz_attempts where id = '${invalidAttempt}';
    alter function private.fixture_cleanup_legacy_contract_attestation_v1()
      volatile;
  `);
  expectPsqlFileFailure(
    migrationPath,
    {},
    "legacy attester definition drift",
  );
  if (psqlScalar(`select count(*) from information_schema.columns where table_schema='public' and table_name='user_quiz_attempts' and column_name='answer_results'`) !== "0") {
    throw new Error("attester-drift refusal left a partial schema change");
  }
  psqlText(`
    alter function private.fixture_cleanup_legacy_contract_attestation_v1()
      stable;
  `);
  if (psqlScalar(`
    select encode(extensions.digest(pg_get_functiondef(proc.oid), 'sha256'), 'hex')
    from pg_proc proc
    where proc.oid = to_regprocedure(
      'private.fixture_cleanup_legacy_contract_attestation_v1()'
    )
  `) !== reviewedLegacyAttesterSha) {
    throw new Error("legacy attester restoration did not recover the reviewed definition");
  }

  psqlText(`
    set session_replication_role = replica;
    insert into public.user_quiz_attempts (
      id, user_id, quiz_id, lesson_id, question_order, answer_orders, responses
    ) values (
      '${validAttempt}', '${userId}', '${quizId}', '${lessonId}',
      '["${q1}","${q2}"]',
      '{"${q1}":["${q1Good}","${q1Bad}"],"${q2}":["${q2Good}","${q2Bad}"]}',
      '{"${q1}":["${q1Good}"],"${q2}":["${q2Bad}"]}'
    );
    insert into public.user_quiz_attempts (
      id, user_id, quiz_id, lesson_id, score, passed, question_order,
      answer_orders, responses, completed_at
    ) values (
      '${completedAttempt}', '${userId}', '${quizId}', '${lessonId}', 50, false,
      '["${qMissing}"]', '{"${qMissing}":["${missingOption}"]}',
      '{"${qMissing}":["${missingOption}"]}', now()
    );
    set session_replication_role = origin;
  `);
  psqlFile(migrationPath);

  const transition = psqlScalar(`
    select string_agg(id::text || ':' || grading_snapshot_state || ':' ||
      answer_results::text, E'\n' order by id)
    from public.user_quiz_attempts
    where id in ('${validAttempt}', '${completedAttempt}')
  `);
  if (!transition.includes(`${completedAttempt}:legacy_summary_only:{}`)
    || !transition.includes(`"${q1}": {"points": 2, "is_correct": true, "explanation": null, "question_type": "single_choice"}`)
    || !transition.includes(`"${q2}": {"points": 3, "is_correct": false, "question_type": "single_choice"}`)
    || transition.includes("Q1 explanation")
    || transition.includes("Q2 explanation")) {
    throw new Error(`quiz privacy transition mismatch: ${transition}`);
  }

  psqlText(`
    update public.questions set points = 99 where id in ('${q1}', '${q2}');
    update public.answer_options set is_correct = not is_correct
      where question_id in ('${q1}', '${q2}');
  `);
  if (!psqlScalar(`select answer_results::text from public.user_quiz_attempts where id='${validAttempt}'`).includes('"points": 2')) {
    throw new Error("authored quiz edits changed an immutable grading snapshot");
  }

  const activeRead = psqlScalar(`
    set request.jwt.claim.sub = '${userId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select count(*) from public.user_quiz_attempts where id = '${validAttempt}';
    reset role;
  `).split("\n").find((line) => /^\d+$/.test(line));
  if (activeRead !== "1") throw new Error("active learner cannot read the owned attempt");
  psqlText(`update public.profiles set status='suspended' where id='${userId}'`);
  const suspendedRead = psqlScalar(`
    set request.jwt.claim.sub = '${userId}';
    set request.jwt.claim.role = 'authenticated';
    set role authenticated;
    select count(*) from public.user_quiz_attempts where id = '${validAttempt}';
    reset role;
  `).split("\n").find((line) => /^\d+$/.test(line));
  if (suspendedRead !== "0") throw new Error("suspended learner retained direct attempt access");
  psqlText(`
    set session_replication_role = replica;
    delete from public.user_quiz_attempts where user_id = '${userId}';
    delete from public.user_role_groups where user_id = '${userId}';
    delete from public.profiles where id = '${userId}';
    delete from auth.users where id = '${userId}';
    delete from public.courses where id = '${courseId}';
    delete from public.quizzes where id = '${quizId}';
    delete from public.role_groups where id = '${groupId}';
    delete from public.audit_log;
    set session_replication_role = origin;
  `);
}

function exec(command, args, extraEnv = {}) {
  return execFileSync(command, args, {
    env: { ...pgEnv, ...extraEnv },
    stdio: "pipe",
  });
}

// Round-6 Codex review, finding 3: fn_insert_oral_check_pilot_role_play_blocks()
// computes prior_catalog_sha256 and replacement_catalog_sha256 through
// fn_course_import_catalog_sha256, which reads the whole managed import graph,
// but it used to lock only the tables it writes. At READ COMMITTED the two
// hash statements can therefore see different committed snapshots: a
// concurrent edit to an unlocked quiz, question, or answer option gets
// absorbed into the replacement receipt, and deleting the 3 blocks later can
// no longer reproduce the recorded prior hash, so the prepared rollback aborts
// permanently. The lock set is now widened to cover every table the checksum
// reads. The reviewer's exact point about the previous coverage was that the
// existing contention test exercises only content_blocks and so cannot detect
// this race at all.
//
// This proves the widened lock set for real, with two genuinely concurrent
// connections. The lock list is PARSED OUT OF THE MIGRATION rather than
// hand-copied here, which is the whole point: narrowing the real lock set
// makes this test fail immediately instead of silently reintroducing the race.
// One connection holds exactly the migration's own lock set; a second
// connection then issues a real write statement against public.questions,
// which is one of the tables that used to be unlocked, and must be refused
// with a lock timeout rather than committing underneath the hash computation.
// A negative control writes to a table that is neither locked nor read by the
// checksum and must succeed, so a pass here means locking, not a test that
// times out on everything.
function forwardCatalogLockTableList() {
  const sql = readFileSync(
    resolve(
      root,
      "supabase/migrations/20260728020000_insert_oral_check_pilot_role_play_blocks.sql",
    ),
    "utf8",
  );
  const functionStart = sql.indexOf(
    "create or replace function public.fn_insert_oral_check_pilot_role_play_blocks()",
  );
  if (functionStart === -1) {
    throw new Error(
      "checksum contention test: could not find fn_insert_oral_check_pilot_role_play_blocks in the migration",
    );
  }
  const lockStart = sql.indexOf("lock table", functionStart);
  const lockEnd = sql.indexOf("in share row exclusive mode;", lockStart);
  if (lockStart === -1 || lockEnd === -1 || lockEnd <= lockStart) {
    throw new Error(
      "checksum contention test: could not bound the migration's lock table statement",
    );
  }
  const tables = sql
    .slice(lockStart + "lock table".length, lockEnd)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const table of tables) {
    if (!/^public\.[a-z_]+$/.test(table)) {
      throw new Error(
        `checksum contention test: unexpected entry in the migration's lock list: ${table}`,
      );
    }
  }
  return tables;
}

async function runOralCheckPilotChecksumTableContentionTest() {
  const lockedTables = forwardCatalogLockTableList();
  // The reviewer's own examples of tables the checksum reads but the forward
  // operation used to leave unlocked. If a later edit drops any of these from
  // the lock set, fail here rather than shipping the race.
  for (const required of [
    "public.quizzes",
    "public.questions",
    "public.answer_options",
    "public.assignments",
    "public.program_courses",
    "public.program_access",
    "public.course_access",
    "public.role_groups",
  ]) {
    if (!lockedTables.includes(required)) {
      throw new Error(
        `checksum contention: ${required} is read by fn_course_import_catalog_sha256 but is missing from the forward migration's lock set (${lockedTables.join(", ")}). A concurrent edit to it between the two hash reads would corrupt the receipt and strand the prepared rollback.`,
      );
    }
  }

  const holderSql = `
    begin;
    lock table ${lockedTables.join(", ")} in share row exclusive mode;
    select pg_sleep(20);
    rollback;
  `;
  const holder = spawn(binary("psql"), ["-v", "ON_ERROR_STOP=1", "-c", holderSql], {
    env: pgEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let holderOutput = "";
  holder.stdout.on("data", (chunk) => { holderOutput += chunk; });
  holder.stderr.on("data", (chunk) => { holderOutput += chunk; });
  const holderExit = new Promise((resolveHolder, rejectHolder) => {
    holder.on("exit", (code) => {
      if (code !== 0) {
        rejectHolder(
          new Error(`checksum contention: lock holder failed (exit ${code}):\n${holderOutput}`),
        );
      } else {
        resolveHolder();
      }
    });
    holder.on("error", rejectHolder);
  });

  // Let the holder actually acquire the locks before the writers start.
  await new Promise((resolveWait) => setTimeout(resolveWait, 3000));

  // A real write statement, not a bare LOCK: an UPDATE takes ROW EXCLUSIVE on
  // the table, which is exactly what a concurrent quiz edit would take, and it
  // conflicts with the SHARE ROW EXCLUSIVE the migration now holds. It matches
  // zero rows on purpose, so this needs no fixture and leaves nothing behind.
  const blockedStart = Date.now();
  let blockedFailed = false;
  let blockedOutput = "";
  try {
    blockedOutput = exec(binary("psql"), [
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "set lock_timeout = '5s'; update public.questions set points = points;",
    ]).toString();
  } catch (error) {
    blockedFailed = true;
    blockedOutput = `${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`;
  }
  const blockedElapsedMs = Date.now() - blockedStart;

  if (!blockedFailed) {
    await holderExit.catch(() => {});
    throw new Error(
      `checksum contention: a concurrent write to public.questions committed while the forward operation's lock set was held (elapsed ${blockedElapsedMs}ms). The catalog checksum reads that table, so this edit could land between the prior and replacement hashes and corrupt the receipt. Output:\n${blockedOutput}`,
    );
  }
  if (!blockedOutput.includes("55P03") && !/lock timeout/i.test(blockedOutput)) {
    await holderExit.catch(() => {});
    throw new Error(
      `checksum contention: the concurrent write to public.questions failed, but not with the expected lock_timeout. Output:\n${blockedOutput}`,
    );
  }

  // Negative control: public.profiles is neither locked by the migration nor
  // read by fn_course_import_catalog_sha256, so the identical statement shape
  // must succeed immediately while the same locks are still held. Without
  // this, a harness that simply timed out on every statement would pass the
  // check above for the wrong reason.
  const controlStart = Date.now();
  exec(binary("psql"), [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "set lock_timeout = '5s'; update public.profiles set status = status;",
  ]);
  const controlElapsedMs = Date.now() - controlStart;

  await holderExit;

  console.log(
    `Oral-check pilot checksum-table contention test passed: a real write to public.questions was refused after ${blockedElapsedMs}ms with a lock_timeout while the forward operation's ${lockedTables.length}-table lock set was held, and the unlocked-table control committed in ${controlElapsedMs}ms.`,
  );
}

// Round-5 Codex review, finding 3: fn_rollback_oral_check_pilot_role_play_blocks()
// now sets a function-level `lock_timeout = '10s'`, but nothing had ever
// exercised it against real lock contention -- the migration-level `set
// lock_timeout = '10s'` near the top of
// 20260728030000_rollback_oral_check_pilot_role_play_blocks.sql only ever
// applied to the session that installed that migration, never to a later,
// separate incident invocation. This proves it for real, using two
// genuinely separate, concurrent psql connections (every other oral-check
// pilot test in this harness runs single-connection, which cannot exercise
// real lock contention at all): one connection builds a real fixture, runs
// the real forward insertion, commits it, then holds a conflicting ACCESS
// EXCLUSIVE lock on content_blocks in a second transaction; the other
// connection, started shortly after, calls the real rollback function and
// must fail with SQLSTATE 55P03 (lock_timeout) after roughly 10 real
// seconds of contention -- not hang indefinitely, and not coincidentally
// succeed only because the locker happened to finish first. This runs last
// in the harness, after every other check, and deliberately leaves its own
// fixture rows committed for the locker's second (lock-holding) writer
// transaction to exist against -- it cleans up after itself at the end by
// completing a real, successful rollback once the lock is free again.
async function runOralCheckPilotRollbackLockTimeoutTest() {
  const importId = "bmh-employee-training-v1";
  const blockIds = [
    "7300bba9-a9fc-582c-aa20-dd5d58754165",
    "4464ecdd-2650-59ed-a525-78871e846d20",
    "34758403-1ddd-5e3c-a054-b2f28310d8b8",
  ];
  const programId = "15a382c9-617c-5407-a880-af6303be74b2";
  const courseId = "e743b27c-7e0d-5760-aa25-5dbd75656718";
  const programCourseId = "8e8b2d86-6e11-59e5-acd2-332488b2341e";
  const moduleIds = [
    "b2b26858-4b5c-5e1f-ada4-6814d3c340fe",
    "2cf8bd25-600c-5514-a88f-bd964bbd6616",
    "774aa2b9-6460-572c-a8bf-a000020fdfd5",
  ];
  const lessonIds = [
    "dc391d4b-58f4-5a94-a97f-ca59c4d98f41",
    "823f016f-6e4c-5791-ac42-9f24c28040df",
    "cccdb0ef-b907-5bce-ade1-3ff0b0d054ce",
  ];
  const idList = (ids) => ids.map((id) => `'${id}'`).join(", ");

  // Round-6 Codex review, finding 2: unlike every other check in this
  // harness, this one deliberately COMMITS its fixture (it needs two real
  // concurrent connections, so it cannot live inside one rolled-back
  // transaction). It used to clean up only the 3 content blocks, leaving a
  // committed bmh-employee-training-v1 release record, the fixture catalog
  // rows, both evidence receipts, and a stubbed
  // fn_course_import_catalog_sha256 behind on the shared database. The very
  // next step of the same CI job -- "Rehearse released quiz forward
  // revision and rollback" -- then called fn_apply_course_import for that
  // same import and was refused with "released imports are immutable",
  // failing the PostgreSQL 15/16/17 jobs. Save the real checksum function
  // before stubbing it so it can be restored verbatim afterwards, and drop
  // every committed row at the end.
  psqlText(`
    create table public.oral_check_lock_rehearsal_saved_function (definition text);
    insert into public.oral_check_lock_rehearsal_saved_function (definition)
    select pg_get_functiondef(
      'public.fn_course_import_catalog_sha256(text)'::regprocedure
    );
    do $$
    begin
      if not exists (
        select 1 from public.oral_check_lock_rehearsal_saved_function
        where definition is not null
      ) then
        raise exception 'could not capture the real fn_course_import_catalog_sha256 definition before stubbing it';
      end if;
    end;
    $$;
  `);

  const lockerSql = `
    select set_config('request.jwt.claim.role', 'service_role', false);
    create or replace function public.fn_course_import_catalog_sha256(p_import_id text)
    returns text
    language sql
    stable
    security definer
    set search_path = ''
    as $stub$
      select case
        when p_import_id <> '${importId}' then repeat('0', 64)
        when exists (
          select 1 from public.content_blocks where id in (${blockIds.map((id) => `'${id}'`).join(", ")})
        ) then repeat('f', 64)
        else '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2'
      end;
    $stub$;
    begin;
    do $$
    begin
      perform set_config('bmh.apply_import_id', '${importId}', true);
      insert into public.programs (id, title, description, content_import_id, is_published, course_order_mode, certificate_enabled, sort_order) values ('15a382c9-617c-5407-a880-af6303be74b2', 'BMH Employee Training', 'Internal training for serving sellers, operating the pipeline, and growing at BMH Group.', '${importId}', false, 'sequential', true, 0);
      insert into public.courses (id, title, description, content_import_id, is_published, certificate_enabled, sort_order) values ('e743b27c-7e0d-5760-aa25-5dbd75656718', 'BMH Employee Training', 'Six sequential sections covering the BMH way, seller conversations, operating systems, and performance.', '${importId}', false, false, 0);
      insert into public.program_courses (id, program_id, course_id, sort_order) values ('8e8b2d86-6e11-59e5-acd2-332488b2341e', '15a382c9-617c-5407-a880-af6303be74b2', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 0);
      insert into public.modules (id, course_id, title, description, sort_order) values
        ('b2b26858-4b5c-5e1f-ada4-6814d3c340fe', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Orientation', 'Learn the BMH Group service standard, vocabulary, and operating tools.', 1),
        ('2cf8bd25-600c-5514-a88f-bd964bbd6616', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Who We Serve', 'Understand the sellers BMH Group can help and the tradeoffs in our offer.', 2),
        ('774aa2b9-6460-572c-a8bf-a000020fdfd5', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Performance and Career', 'Use scorecards, operating discipline, and coaching to improve and grow.', 6);
      insert into public.lessons (id, module_id, title, description, lesson_type, sort_order, content_import_id, is_required_for_completion) values
        ('dc391d4b-58f4-5a94-a97f-ca59c4d98f41', 'b2b26858-4b5c-5e1f-ada4-6814d3c340fe', 'Real Estate Terms Glossary', 'Build the vocabulary needed to follow property, title, financing, and transaction conversations without guessing.', 'content', 3, '${importId}', true),
        ('823f016f-6e4c-5791-ac42-9f24c28040df', '2cf8bd25-600c-5514-a88f-bd964bbd6616', 'The BMH Offer Playbook', 'Explain how a direct property purchase exchanges maximum retail price for speed, certainty, convenience, and an as-is sale.', 'content', 3, '${importId}', true),
        ('cccdb0ef-b907-5bce-ade1-3ff0b0d054ce', '774aa2b9-6460-572c-a8bf-a000020fdfd5', 'KPIs and Sales Telemetry', 'Read the funnel from left to right to locate process gaps and choose the right coaching response.', 'content', 1, '${importId}', true);
      perform set_config('bmh.apply_import_id', '', true);
      perform set_config('bmh.release_import_id', '${importId}', true);
      insert into public.content_import_release_records (import_id, program_id, qa_role_group_id, employee_role_group_id, manifest_sha256, reconciliation_sha256, catalog_sha256, rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256, admin_happy_path_sha256, approval_sha256, approved_by, evidence) values ('${importId}', '15a382c9-617c-5407-a880-af6303be74b2', '05903000-0000-5000-a000-000000000001', '05903000-0000-5000-a000-000000000002', '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c', repeat('2',64), repeat('3',64), repeat('4',64), repeat('5',64), repeat('6',64), repeat('7',64), repeat('8',64), 'Jarrad Henry', '{}'::jsonb);
      update public.programs set is_published = true where content_import_id = '${importId}';
      update public.courses set is_published = true where content_import_id = '${importId}';
      perform set_config('bmh.release_import_id', '', true);
    end;
    $$;
    select public.fn_insert_oral_check_pilot_role_play_blocks();
    commit;

    begin;
    lock table public.content_blocks in access exclusive mode;
    select pg_sleep(20);
    rollback;
  `;

  const locker = spawn(binary("psql"), ["-v", "ON_ERROR_STOP=1", "-c", lockerSql], {
    env: pgEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let lockerOutput = "";
  locker.stdout.on("data", (chunk) => { lockerOutput += chunk; });
  locker.stderr.on("data", (chunk) => { lockerOutput += chunk; });
  const lockerExit = new Promise((resolveLocker, rejectLocker) => {
    locker.on("exit", (code) => {
      if (code !== 0) {
        rejectLocker(
          new Error(`lock-timeout rehearsal: locker process failed (exit ${code}):\n${lockerOutput}`),
        );
      } else {
        resolveLocker();
      }
    });
    locker.on("error", rejectLocker);
  });

  // Give the locker time to build the fixture, commit the real forward
  // insertion, and acquire the conflicting ACCESS EXCLUSIVE lock before the
  // roller attempts the rollback.
  await new Promise((resolveWait) => setTimeout(resolveWait, 4000));

  const rollerSql = `
    select set_config('request.jwt.claim.role', 'service_role', false);
    select public.fn_rollback_oral_check_pilot_role_play_blocks();
  `;
  const rollerStart = Date.now();
  let rollerFailed = false;
  let rollerOutput = "";
  try {
    rollerOutput = exec(binary("psql"), [
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      rollerSql,
    ]).toString();
  } catch (error) {
    rollerFailed = true;
    rollerOutput = `${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`;
  }
  const rollerElapsedMs = Date.now() - rollerStart;

  if (!rollerFailed) {
    throw new Error(
      `lock-timeout rehearsal: the rollback call succeeded despite a genuinely held conflicting lock (elapsed ${rollerElapsedMs}ms) -- expected a real lock_timeout failure. Output:\n${rollerOutput}`,
    );
  }
  if (
    !rollerOutput.includes("55P03") &&
    !/lock timeout/i.test(rollerOutput)
  ) {
    throw new Error(
      `lock-timeout rehearsal: the rollback call failed, but not with the expected lock_timeout error. Output:\n${rollerOutput}`,
    );
  }
  if (rollerElapsedMs < 7000 || rollerElapsedMs > 19000) {
    throw new Error(
      `lock-timeout rehearsal: expected the rollback call to time out after roughly 10s of real lock contention, but it took ${rollerElapsedMs}ms. Output:\n${rollerOutput}`,
    );
  }

  await lockerExit;

  console.log(
    `Oral-check pilot rollback lock-timeout rehearsal passed: refused after ${rollerElapsedMs}ms with a real lock_timeout, while a genuinely concurrent writer held the conflicting lock.`,
  );

  // Clean up: now that the locker's lock is released, complete a REAL,
  // successful rollback (no lock contention this time) so this test leaves
  // the shared harness database exactly as it found it, and so the harness
  // proves the roller's earlier failed attempt did not leave anything
  // half-done (the one-shot evidence row was never written, so a second,
  // genuine attempt succeeds).
  const cleanupSql = `
    select set_config('request.jwt.claim.role', 'service_role', false);
    select public.fn_rollback_oral_check_pilot_role_play_blocks();
  `;
  exec(binary("psql"), ["-v", "ON_ERROR_STOP=1", "-c", cleanupSql]);

  const remainingSql = `
    select count(*) from public.content_blocks
    where id in (${idList(blockIds)});
  `;
  const remaining = Number(
    exec(binary("psql"), ["-v", "ON_ERROR_STOP=1", "-A", "-t", "-c", remainingSql])
      .toString()
      .trim(),
  );
  if (remaining !== 0) {
    throw new Error(
      `lock-timeout rehearsal cleanup: expected 0 oral-check blocks remaining after the real cleanup rollback, found ${remaining}.`,
    );
  }

  // Round-6 review, finding 2: drop everything this rehearsal committed and
  // restore the real checksum function, so the shared database is left
  // exactly as it was found. session_replication_role = replica is the same
  // mechanism the quiz-privacy replay cleanup above uses -- it suspends the
  // immutability guard triggers on the two evidence tables, which correctly
  // refuse every delete under normal operation. Deletes run child-first
  // because the evidence tables reference content_import_release_records
  // with ON DELETE RESTRICT.
  psqlText(`
    set session_replication_role = replica;
    delete from public.content_import_oral_check_pilot_role_play_rollback_records
      where import_id = '${importId}';
    delete from public.content_import_oral_check_pilot_role_play_records
      where import_id = '${importId}';
    delete from public.content_import_release_records where import_id = '${importId}';
    delete from public.lessons where id in (${idList(lessonIds)});
    delete from public.modules where id in (${idList(moduleIds)});
    delete from public.program_courses where id = '${programCourseId}';
    delete from public.courses where id = '${courseId}';
    delete from public.programs where id = '${programId}';
    set session_replication_role = origin;

    do $$
    declare
      v_definition text;
    begin
      select definition into v_definition
      from public.oral_check_lock_rehearsal_saved_function;
      if v_definition is null then
        raise exception 'the saved fn_course_import_catalog_sha256 definition is missing -- refusing to leave the stub in place';
      end if;
      execute v_definition;
    end;
    $$;
    drop table public.oral_check_lock_rehearsal_saved_function;
  `);

  // Prove the restoration for real rather than assuming it: a leftover
  // release record or a still-stubbed checksum function is exactly what
  // broke the next CI step, so fail here instead of there.
  psqlText(`
    do $$
    begin
      if exists (
        select 1 from public.content_import_release_records where import_id = '${importId}'
      ) then
        raise exception 'lock-timeout rehearsal cleanup left a committed release record behind';
      end if;
      if exists (
        select 1 from public.programs where content_import_id = '${importId}'
        union all
        select 1 from public.courses where content_import_id = '${importId}'
        union all
        select 1 from public.lessons where content_import_id = '${importId}'
      ) then
        raise exception 'lock-timeout rehearsal cleanup left committed catalog rows behind';
      end if;
      if exists (
        select 1 from public.content_import_oral_check_pilot_role_play_records
        union all
        select 1 from public.content_import_oral_check_pilot_role_play_rollback_records
      ) then
        raise exception 'lock-timeout rehearsal cleanup left a committed evidence receipt behind';
      end if;
      if pg_get_functiondef(
        'public.fn_course_import_catalog_sha256(text)'::regprocedure
      ) like '%91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2%' then
        raise exception 'lock-timeout rehearsal cleanup left the stubbed fn_course_import_catalog_sha256 in place';
      end if;
    end;
    $$;
  `);
}
