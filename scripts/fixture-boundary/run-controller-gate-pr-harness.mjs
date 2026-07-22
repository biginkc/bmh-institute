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
      owner uuid,
      metadata jsonb,
      user_metadata jsonb
    );
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    create schema extensions;
    create extension pgcrypto with schema extensions;
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
