#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const pgBin = [
  process.argv.find((value) => value.startsWith("--pg-bin="))?.slice(9),
  "/opt/homebrew/opt/postgresql@17/bin",
  "/opt/homebrew/opt/postgresql@16/bin",
  "/opt/homebrew/opt/postgresql@15/bin",
  execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim(),
].find((directory) => directory && existsSync(join(directory, "postgres")));

if (!pgBin) throw new Error("PostgreSQL binaries were not found.");

const cluster = mkdtempSync(join(tmpdir(), "bmhi-video-zero-pg-"));
const socket = join(cluster, "socket");
const port = String(58500 + (process.pid % 500));
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
const payloadSql = quoteJson([replacement]);

try {
  execFileSync(
    binary("initdb"),
    [
      "-D",
      cluster,
      "-A",
      "trust",
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
    ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"],
    { env, stdio: "ignore" },
  );

  psqlText(bootstrapSql());
  psqlFile(
    resolve(
      root,
      "supabase/migrations/20260730010000_replace_released_imported_welcome_video.sql",
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
    "PASS: authorization and null payload rejected; exact replacement, replay, rollback, rollback replay, and terminal retry verified in disposable PostgreSQL",
  );
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
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create extension pgcrypto;
    create schema auth;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
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

    create function public.fn_course_import_catalog_sha256(p_import_id text)
    returns text language sql stable as $$
      select case
        when exists (
          select 1 from public.content_blocks
          where content ->> 'file_path' = '${replacementVideoPath}'
        ) then '${replacementCatalog}'
        else '${priorCatalog}'
      end
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
    do $$
    begin
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      begin
        perform public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        );
        raise exception 'unauthorized replacement unexpectedly succeeded';
      exception when insufficient_privilege then null;
      end;
    end $$;

    do $$
    begin
      perform set_config('request.jwt.claim.role', 'service_role', true);
      begin
        perform public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', null, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        );
        raise exception 'null payload unexpectedly succeeded';
      exception when invalid_parameter_value then null;
      end;
    end $$;

    set request.jwt.claim.role = 'service_role';
    do $$
    declare result jsonb;
    declare database_payload text;
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
      select database_payload_sha256 into database_payload
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
      begin
        perform public.fn_replace_released_imported_welcome_video(
          'bmh-employee-training-v1', ${payloadSql}::jsonb, '${clientPayload}',
          '${approvalEvidence}', '${priorCatalog}'
        );
        raise exception 'terminal replacement retry unexpectedly succeeded';
      exception when serialization_failure then null;
      end;
    end $$;
  `;
}
