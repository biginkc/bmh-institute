#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const externalMode = process.env.WELCOME_VIDEO_REPLACEMENT_EXTERNAL_PG;
if (externalMode !== undefined && externalMode !== "1") {
  throw new Error(
    "WELCOME_VIDEO_REPLACEMENT_EXTERNAL_PG must be absent or exactly 1.",
  );
}
const useExternalPostgres = externalMode === "1";
const explicitPgBin = process.argv
  .find((value) => value.startsWith("--pg-bin="))
  ?.slice(9);
const pgBinCandidates = [
  explicitPgBin,
  "/opt/homebrew/opt/postgresql@17/bin",
  "/opt/homebrew/opt/postgresql@16/bin",
  "/opt/homebrew/opt/postgresql@15/bin",
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/16/bin",
  "/usr/lib/postgresql/15/bin",
];
if (!explicitPgBin) {
  try {
    pgBinCandidates.push(
      execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim(),
    );
  } catch {
    // The explicit and known installation paths above remain authoritative.
  }
}
const pgBin = useExternalPostgres
  ? null
  : pgBinCandidates.find(
      (directory) => directory && existsSync(join(directory, "postgres")),
    );

if (!useExternalPostgres && !pgBin) {
  throw new Error("PostgreSQL binaries were not found.");
}

const cluster = useExternalPostgres
  ? null
  : mkdtempSync(join(tmpdir(), "bmhi-video-zero-pg-"));
const socket = cluster === null ? null : join(cluster, "socket");
const port = String(58500 + (process.pid % 500));
const env = useExternalPostgres
  ? { ...process.env, LC_ALL: "C", LANG: "C" }
  : {
      ...process.env,
      LC_ALL: "C",
      LANG: "C",
      PGHOST: socket,
      PGPORT: port,
      PGDATABASE: "postgres",
      PGUSER: "postgres",
    };
if (
  useExternalPostgres &&
  (!["127.0.0.1", "localhost"].includes(env.PGHOST ?? "") ||
    env.PGUSER !== "postgres" ||
    !/^welcome_video_replacement_pg(?:15|16|17)$/.test(env.PGDATABASE ?? ""))
) {
  throw new Error(
    "External Welcome-video PostgreSQL must use local postgres and a version-keyed disposable database.",
  );
}
const binary = (name) => (pgBin === null ? name : join(pgBin, name));

const priorVideoPath =
  "courses/bmh-employee-training/v1/videos/video-slot-01-welcome.493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72.mp4";
const priorCaptionPath =
  "courses/bmh-employee-training/v1/captions/video-slot-01-welcome.54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11.vtt";
const replacementVideoPath =
  "courses/bmh-employee-training/v1/videos/video-slot-01-welcome.06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b.mp4";
const replacementCaptionPath =
  "courses/bmh-employee-training/v1/captions/video-slot-01-welcome.bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939.vtt";
const priorCatalog =
  "6b1413b3c74aa9c35ba64ce12c7ec598d373fa876769a307d03c4d3e38352859";
const replacementCatalog = "a".repeat(64);
const clientPayload =
  "ce6b666c7f13eb9f235b5484916c98aef03752c74afcffd430a19a65af02b900";
const approvalEvidence =
  "6997993901d79abec0a542dad342b67e990cfda6b7b3b7abbce484b5e782b7b3";
const priorContent = {
  title: "Welcome and the Service Playbook",
  file_path: priorVideoPath,
  part_label: "Part A",
  poster_path:
    "courses/bmh-employee-training/v1/posters/video-slot-01-welcome-2e481279cc270f73c2af666857dd7379c529679388d5ccd41b0d8eace71c11b0.webp",
  caption_path: priorCaptionPath,
  duration_seconds: 246.186,
};
const replacement = {
  block_id: "e8d2c1d2-7a02-5b28-a807-9dad78b46306",
  video_asset_key: "video-slot-01-welcome",
  caption_asset_key: "caption-video-slot-01-welcome",
  expected_content: priorContent,
  expected_video_path: priorVideoPath,
  expected_video_sha256:
    "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72",
  expected_video_size_bytes: 35190296,
  expected_video_mime_type: "video/mp4",
  expected_caption_path: priorCaptionPath,
  expected_caption_sha256:
    "54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11",
  expected_caption_size_bytes: 5636,
  expected_caption_mime_type: "text/vtt",
  expected_duration_seconds: 246.186,
  replacement_video_path: replacementVideoPath,
  replacement_video_sha256:
    "06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b",
  replacement_video_size_bytes: 74404741,
  replacement_video_mime_type: "video/mp4",
  replacement_caption_path: replacementCaptionPath,
  replacement_caption_sha256:
    "bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939",
  replacement_caption_size_bytes: 7629,
  replacement_caption_mime_type: "text/vtt",
  replacement_duration_seconds: 318.351,
};
const replacementContent = {
  ...priorContent,
  file_path: replacementVideoPath,
  caption_path: replacementCaptionPath,
  duration_seconds: replacement.replacement_duration_seconds,
};
const driftedPriorContent = {
  ...priorContent,
  title: "DRIFTED prior welcome content",
};
const driftedReplacementContent = {
  ...replacementContent,
  title: "DRIFTED replacement welcome content",
};
const payloadSql = quoteJson([replacement]);
let started = false;

try {
  if (cluster !== null && socket !== null) {
    execFileSync(
      binary("initdb"),
      [
        "-D",
        cluster,
        "--auth-local=trust",
        "--auth-host=reject",
        "-U",
        "postgres",
        "--no-locale",
        "--encoding=UTF8",
      ],
      { stdio: "ignore" },
    );
    execFileSync("mkdir", ["-p", socket]);
    execFileSync(
      binary("pg_ctl"),
      [
        "-D",
        cluster,
        "-o",
        `-F -c listen_addresses='' -p ${port} -k ${socket}`,
        "-w",
        "start",
      ],
      { env, stdio: "ignore" },
    );
    started = true;
  }

  psqlText(bootstrapSql());
  psqlFile(
    resolve(
      root,
      "supabase/migrations/20260730230000_replace_released_imported_welcome_video.sql",
    ),
  );
  psqlText(lifecycleSql());

  const result = psqlText(`
    select
      (select count(*) from public.content_import_welcome_video_replacement_records),
      (select count(*) from public.content_import_welcome_video_rollback_records),
      (select content = ${quoteJson(priorContent)}::jsonb
       from public.content_blocks
       where id = 'e8d2c1d2-7a02-5b28-a807-9dad78b46306');
  `).trim();
  if (result !== "1|1|t") {
    throw new Error(`Unexpected terminal lifecycle state: ${result}`);
  }
  console.log(
    "PASS: SQL-role and JWT authorization, null payload, forward and rollback drift, replay, rollback replay, and terminal retry verified in disposable PostgreSQL",
  );
} finally {
  if (started) {
    execFileSync(
      binary("pg_ctl"),
      ["-D", cluster, "-m", "fast", "-w", "stop"],
      { env, stdio: "ignore" },
    );
    started = false;
  }
  if (cluster !== null) {
    rmSync(cluster, { recursive: true, force: true });
  }
}

function psqlText(sql) {
  return execFileSync(
    binary("psql"),
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
}

function psqlFile(path) {
  execFileSync(binary("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-f", path], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function quoteJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
}

function bootstrapSql() {
  return `
    ${
      useExternalPostgres
        ? ""
        : `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
        `
    }
    create extension pgcrypto;
    create schema auth;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function public.fn_hugo_access_is_active(p_user_id uuid)
    returns boolean language sql stable as $$
      select p_user_id is not null
    $$;
    create schema storage;
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      metadata jsonb,
      user_metadata jsonb
    );
    create table public.content_import_release_records (import_id text primary key);
    create table public.programs (
      id uuid primary key,
      content_import_id text,
      is_published boolean not null
    );
    create table public.courses (
      id uuid primary key,
      content_import_id text,
      is_published boolean not null
    );
    create table public.program_courses (id uuid);
    create table public.program_access (id uuid);
    create table public.course_access (id uuid);
    create table public.role_groups (id uuid);
    create table public.modules (id uuid primary key, course_id uuid not null);
    create table public.lessons (
      id uuid primary key,
      module_id uuid not null,
      content_import_id text
    );
    create table public.content_blocks (
      id uuid primary key,
      lesson_id uuid not null,
      block_type text not null,
      content jsonb not null
    );
    create table public.quizzes (id uuid);
    create table public.questions (id uuid);
    create table public.answer_options (id uuid);
    create table public.assignments (id uuid);

    create procedure public.test_expect_error(
      p_label text,
      p_statement text,
      p_expected_sqlstate text,
      p_expected_message text
    )
    language plpgsql
    as $$
    declare
      actual_sqlstate text;
      actual_message text;
    begin
      begin
        execute p_statement;
      exception when others then
        get stacked diagnostics
          actual_sqlstate = returned_sqlstate,
          actual_message = message_text;
        if actual_sqlstate is distinct from p_expected_sqlstate
          or actual_message is distinct from p_expected_message
        then
          raise exception '% returned [%] %, expected [%] %',
            p_label,
            actual_sqlstate,
            actual_message,
            p_expected_sqlstate,
            p_expected_message;
        end if;
        return;
      end;
      raise exception '% unexpectedly succeeded', p_label;
    end
    $$;

    create procedure public.test_assert_welcome_state(
      p_label text,
      p_expected_content jsonb,
      p_expected_replacement_count bigint,
      p_expected_rollback_count bigint
    )
    language plpgsql
    as $$
    declare
      actual_content jsonb;
      actual_replacement_count bigint;
      actual_rollback_count bigint;
    begin
      select content into strict actual_content
      from public.content_blocks
      where id = 'e8d2c1d2-7a02-5b28-a807-9dad78b46306';
      select count(*) into actual_replacement_count
      from public.content_import_welcome_video_replacement_records;
      select count(*) into actual_rollback_count
      from public.content_import_welcome_video_rollback_records;
      if actual_content is distinct from p_expected_content
        or actual_replacement_count is distinct from p_expected_replacement_count
        or actual_rollback_count is distinct from p_expected_rollback_count
      then
        raise exception
          '% left content or audit counts changed: content=%, replacements=%, rollbacks=%',
          p_label,
          actual_content,
          actual_replacement_count,
          actual_rollback_count;
      end if;
    end
    $$;

    create function public.fn_course_import_catalog_sha256(p_import_id text)
    returns text language sql stable as $$
      select coalesce(
        nullif(current_setting('bmh.test_welcome_catalog_override', true), ''),
        case
          when exists (
            select 1 from public.content_blocks
            where content ->> 'file_path' = '${replacementVideoPath}'
          ) then '${replacementCatalog}'
          else '${priorCatalog}'
        end
      )
    $$;

    insert into public.content_import_release_records values ('bmh-employee-training-v1');
    insert into public.programs values
      ('10000000-0000-4000-8000-000000000001', 'bmh-employee-training-v1', true);
    insert into public.courses values
      ('20000000-0000-4000-8000-000000000001', 'bmh-employee-training-v1', true);
    insert into public.modules values
      ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
    insert into public.lessons values
      ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'bmh-employee-training-v1');
    insert into public.content_blocks values (
      'e8d2c1d2-7a02-5b28-a807-9dad78b46306',
      '40000000-0000-4000-8000-000000000001',
      'video',
      ${quoteJson(priorContent)}::jsonb
    );
    ${storageInsert(priorVideoPath, replacement.expected_video_sha256, 35190296, "video/mp4")}
    ${storageInsert(priorCaptionPath, replacement.expected_caption_sha256, 5636, "text/vtt")}
    ${storageInsert(replacementVideoPath, replacement.replacement_video_sha256, 74404741, "video/mp4")}
    ${storageInsert(replacementCaptionPath, replacement.replacement_caption_sha256, 7629, "text/vtt")}
  `;
}

function storageInsert(path, checksum, size, mimetype) {
  return `
    insert into storage.objects (bucket_id, name, metadata, user_metadata)
    values (
      'content',
      '${path}',
      '{"sha256":"${checksum}","course_import_id":"bmh-employee-training-v1","size":"${size}","mimetype":"${mimetype}"}',
      '{}'
    );
  `;
}

function lifecycleSql() {
  return `
    set role authenticated;
    call public.test_expect_error(
      'authenticated replacement execution',
      $statement$
        select public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        )
      $statement$,
      '42501',
      'permission denied for function fn_replace_released_imported_welcome_video'
    );
    call public.test_expect_error(
      'authenticated rollback execution',
      $statement$
        select public.fn_rollback_released_imported_welcome_video(
          'bmh-employee-training-v1', '${"f".repeat(64)}', '${clientPayload}',
          '${approvalEvidence}', '${replacementCatalog}'
        )
      $statement$,
      '42501',
      'permission denied for function fn_rollback_released_imported_welcome_video'
    );
    reset role;

    set request.jwt.claim.role = 'authenticated';
    set role service_role;
    call public.test_expect_error(
      'replacement JWT-role guard',
      $statement$
        select public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        )
      $statement$,
      '42501',
      'Released welcome video replacement requires service_role.'
    );
    call public.test_expect_error(
      'rollback JWT-role guard',
      $statement$
        select public.fn_rollback_released_imported_welcome_video(
          'bmh-employee-training-v1', '${"f".repeat(64)}', '${clientPayload}',
          '${approvalEvidence}', '${replacementCatalog}'
        )
      $statement$,
      '42501',
      'Released welcome video rollback requires service_role.'
    );
    reset role;

    set request.jwt.claim.role = 'service_role';
    set role service_role;
    call public.test_expect_error(
      'null replacement payload',
      $statement$
        select public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', null, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        )
      $statement$,
      '22023',
      'Released welcome video replacement requires exactly one replacement.'
    );
    reset role;
    call public.test_assert_welcome_state(
      'null replacement payload',
      ${quoteJson(priorContent)}::jsonb,
      0,
      0
    );

    set bmh.test_welcome_catalog_override = '${"b".repeat(64)}';
    set role service_role;
    call public.test_expect_error(
      'pre-forward catalog drift',
      $statement$
        select public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        )
      $statement$,
      '40001',
      'Released welcome video replacement refused: catalog drifted from the exact production preflight.'
    );
    reset role;
    reset bmh.test_welcome_catalog_override;
    call public.test_assert_welcome_state(
      'pre-forward catalog drift',
      ${quoteJson(priorContent)}::jsonb,
      0,
      0
    );

    update public.content_blocks
    set content = ${quoteJson(driftedPriorContent)}::jsonb
    where id = 'e8d2c1d2-7a02-5b28-a807-9dad78b46306';
    set role service_role;
    call public.test_expect_error(
      'pre-forward content drift',
      $statement$
        select public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        )
      $statement$,
      '40001',
      'Released welcome video replacement refused: target, ownership, type, or expected content mismatch.'
    );
    reset role;
    call public.test_assert_welcome_state(
      'pre-forward content drift',
      ${quoteJson(driftedPriorContent)}::jsonb,
      0,
      0
    );
    update public.content_blocks
    set content = ${quoteJson(priorContent)}::jsonb
    where id = 'e8d2c1d2-7a02-5b28-a807-9dad78b46306';

    update storage.objects
    set metadata = jsonb_set(metadata, '{sha256}', to_jsonb('${"0".repeat(64)}'::text))
    where bucket_id = 'content' and name = '${replacementVideoPath}';
    set role service_role;
    call public.test_expect_error(
      'pre-forward storage checksum drift',
      $statement$
        select public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        )
      $statement$,
      '22023',
      'Released welcome video replacement refused: an exact old or new storage object is missing.'
    );
    reset role;
    call public.test_assert_welcome_state(
      'pre-forward storage checksum drift',
      ${quoteJson(priorContent)}::jsonb,
      0,
      0
    );
    update storage.objects
    set metadata = jsonb_set(
      metadata,
      '{sha256}',
      to_jsonb('${replacement.replacement_video_sha256}'::text)
    )
    where bucket_id = 'content' and name = '${replacementVideoPath}';

    set role service_role;
    do $$
    declare result jsonb;
    begin
      result := public.fn_replace_released_imported_welcome_video(
        'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
        '${approvalEvidence}', '${priorCatalog}'
      );
      if result ->> 'status' <> 'replaced' then
        raise exception 'replacement failed: %', result;
      end if;
      result := public.fn_replace_released_imported_welcome_video(
        'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
        '${approvalEvidence}', '${replacementCatalog}'
      );
      if result ->> 'status' <> 'already_replaced' then
        raise exception 'replacement replay failed: %', result;
      end if;
    end $$;
    reset role;
    call public.test_assert_welcome_state(
      'replacement and replay',
      ${quoteJson(replacementContent)}::jsonb,
      1,
      0
    );

    set bmh.test_welcome_catalog_override = '${"b".repeat(64)}';
    set role service_role;
    call public.test_expect_error(
      'pre-rollback catalog drift',
      $statement$
        select public.fn_rollback_released_imported_welcome_video(
          'bmh-employee-training-v1',
          (
            select database_payload_sha256
            from public.content_import_welcome_video_replacement_records
          ),
          '${clientPayload}', '${approvalEvidence}', '${replacementCatalog}'
        )
      $statement$,
      '40001',
      'Released welcome video rollback refused: replacement catalog drifted.'
    );
    reset role;
    reset bmh.test_welcome_catalog_override;
    call public.test_assert_welcome_state(
      'pre-rollback catalog drift',
      ${quoteJson(replacementContent)}::jsonb,
      1,
      0
    );

    update public.content_blocks
    set content = ${quoteJson(driftedReplacementContent)}::jsonb
    where id = 'e8d2c1d2-7a02-5b28-a807-9dad78b46306';
    set role service_role;
    call public.test_expect_error(
      'pre-rollback content drift',
      $statement$
        select public.fn_rollback_released_imported_welcome_video(
          'bmh-employee-training-v1',
          (
            select database_payload_sha256
            from public.content_import_welcome_video_replacement_records
          ),
          '${clientPayload}', '${approvalEvidence}', '${replacementCatalog}'
        )
      $statement$,
      '40001',
      'Released welcome video rollback refused: exact replacement content is absent.'
    );
    reset role;
    call public.test_assert_welcome_state(
      'pre-rollback content drift',
      ${quoteJson(driftedReplacementContent)}::jsonb,
      1,
      0
    );
    update public.content_blocks
    set content = ${quoteJson(replacementContent)}::jsonb
    where id = 'e8d2c1d2-7a02-5b28-a807-9dad78b46306';

    update storage.objects
    set metadata = jsonb_set(metadata, '{size}', to_jsonb('7628'::text))
    where bucket_id = 'content' and name = '${replacementCaptionPath}';
    set role service_role;
    call public.test_expect_error(
      'pre-rollback storage size drift',
      $statement$
        select public.fn_rollback_released_imported_welcome_video(
          'bmh-employee-training-v1',
          (
            select database_payload_sha256
            from public.content_import_welcome_video_replacement_records
          ),
          '${clientPayload}', '${approvalEvidence}', '${replacementCatalog}'
        )
      $statement$,
      '22023',
      'Released welcome video rollback refused: an exact old or new storage object is missing.'
    );
    reset role;
    call public.test_assert_welcome_state(
      'pre-rollback storage size drift',
      ${quoteJson(replacementContent)}::jsonb,
      1,
      0
    );
    update storage.objects
    set metadata = jsonb_set(metadata, '{size}', to_jsonb('7629'::text))
    where bucket_id = 'content' and name = '${replacementCaptionPath}';

    set role service_role;
    do $$
    declare result jsonb;
    declare database_payload text;
    begin
      select database_payload_sha256 into strict database_payload
      from public.content_import_welcome_video_replacement_records;
      result := public.fn_rollback_released_imported_welcome_video(
        'bmh-employee-training-v1', database_payload, '${clientPayload}',
        '${approvalEvidence}', '${replacementCatalog}'
      );
      if result ->> 'status' <> 'rolled_back' then
        raise exception 'rollback failed: %', result;
      end if;
      result := public.fn_rollback_released_imported_welcome_video(
        'bmh-employee-training-v1', database_payload, '${clientPayload}',
        '${approvalEvidence}', '${replacementCatalog}'
      );
      if result ->> 'status' <> 'already_rolled_back' then
        raise exception 'rollback replay failed: %', result;
      end if;
    end $$;
    call public.test_expect_error(
      'terminal replacement retry',
      $statement$
        select public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        )
      $statement$,
      '40001',
      'Released welcome video replacement was previously rolled back and is terminal.'
    );
    reset role;
    call public.test_assert_welcome_state(
      'rollback, rollback replay, and terminal retry',
      ${quoteJson(priorContent)}::jsonb,
      1,
      1
    );
  `;
}
