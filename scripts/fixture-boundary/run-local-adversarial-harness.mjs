#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const backupRoot = resolve(
  root,
  "../../_codex_backups/bmh-institute-2026-07-16",
);
const manifest = JSON.parse(
  await readFile(
    resolve(root, "docs/course-production/fixture-boundary-manifest.json"),
    "utf8",
  ),
);
const manifestSha = (
  await readFile(
    resolve(
      root,
      "docs/course-production/fixture-boundary-manifest.json.sha256",
    ),
    "utf8",
  )
).split(" ")[0];
const confirmation = `DELETE-EXACT-BMH-INSTITUTE-FIXTURES:${manifest.project.ref}:${manifestSha}`;
const cluster = await mkdtemp(join(tmpdir(), "bmh-fixture-pg-"));
const socket = join(cluster, "socket");
const filteredData = join(cluster, "fixture-data.sql");
const port = String(54000 + (process.pid % 1000));
const pgEnv = {
  ...process.env,
  PGHOST: socket,
  PGPORT: port,
  PGDATABASE: "postgres",
  PGUSER: "postgres",
};

try {
  exec("initdb", [
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
    "pg_ctl",
    ["-D", cluster, "-o", `-F -p ${port} -k ${socket}`, "-w", "start"],
    {
      env: pgEnv,
      stdio: "ignore",
    },
  );

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
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
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

  const migrationFiles = [
    "001_initial_schema.sql",
    "002_functions_and_triggers.sql",
    "003_rls_policies.sql",
    "004_indexes.sql",
    "006_storage_content_bucket.sql",
    "007_storage_submissions_bucket.sql",
    "008_answer_options_public_view.sql",
    "009_answer_options_public_row_filter.sql",
    "010_prevent_last_owner_deletion.sql",
    "011_auth_rate_limits.sql",
    "012_data_integrity.sql",
    "013_role_play_blocks.sql",
    "014_revoke_answer_options_answer_key.sql",
    "015_course_media_and_artwork.sql",
    "016_runtime_progress_security.sql",
    "017_revoke_quiz_explanations.sql",
    "018_storage_content_markdown.sql",
    "019_atomic_course_import_rollback.sql",
    "020_catalog_artwork_provenance.sql",
  ];
  for (const file of migrationFiles)
    psqlFile(resolve(root, "supabase/migrations", file));

  const authValues = manifest.retained_entities.auth_users_from_snapshot
    .map((id) => `('${sqlLiteral(id)}'::uuid)`)
    .join(",");
  psqlText(
    `set session_replication_role = replica; insert into auth.users (id) values ${authValues}; set session_replication_role = origin;`,
  );

  const selected = new Set([
    ...Object.keys(manifest.fixture_tables).map((table) => `public.${table}`),
    "public.profiles",
    "public.audit_log",
    "public.certificate_templates",
    "public.certificate_number_counters",
    "public.auth_rate_limits",
  ]);
  const dataRaw = await readFile(resolve(backupRoot, "data.sql"), "utf8");
  await writeFile(filteredData, filterCopyBlocks(dataRaw, selected));
  psqlFile(filteredData);
  for (const file of (await readdir(resolve(root, "supabase/migrations")))
    .filter((file) => /^0(?:2[1-9]|3\d|4\d|5[01])_.+\.sql$/.test(file))
    .sort()) {
    psqlFile(resolve(root, "supabase/migrations", file));
  }
  psqlText(`
    do $$
    begin
      if (select count(*) from public.user_quiz_attempts) <> 11
        or exists (
          select 1
          from public.user_quiz_attempts attempt
          where attempt.grading_snapshot_state <> 'legacy_summary_only'
             or attempt.answer_results <> '{}'::jsonb
        )
        or exists (
          select 1
          from private.fixture_cleanup_boundary_v1 boundary
          join public.user_quiz_attempts attempt
            on attempt.id::text = boundary.identity_key
          where boundary.table_name = 'user_quiz_attempts'
            and boundary.row_sha256 <> encode(
              extensions.digest(
                convert_to(
                  private.fixture_cleanup_canonical_jsonb_v1((
                    select jsonb_object_agg(field, to_jsonb(attempt) -> field)
                    from unnest(boundary.fingerprint_fields) field
                  )),
                  'UTF8'
                ),
                'sha256'
              ),
              'hex'
            )
        )
      then
        raise exception 'rollback fixture quiz-attempt transition does not match the reviewed manifest';
      end if;
    end;
    $$;
  `);
  psqlFile(
    resolve(root, "scripts/fixture-boundary/atomic-cleanup-local-test.sql"),
    {
      manifest_sha: manifestSha,
      confirmation,
    },
  );
  psqlFile(
    resolve(
      root,
      "supabase/tests/036_controller_verified_fixture_cleanup_gate.sql",
    ),
    { fixture_cleanup_isolated_superuser: "on" },
  );
  console.log(
    JSON.stringify({
      status: "passed",
      postgres: 17,
      manifest_sha256: manifestSha,
    }),
  );
} finally {
  try {
    execFileSync("pg_ctl", ["-D", cluster, "-m", "fast", "-w", "stop"], {
      env: pgEnv,
      stdio: "ignore",
    });
  } catch {}
  await rm(cluster, { recursive: true, force: true });
}

function psqlText(sql) {
  exec("psql", ["-v", "ON_ERROR_STOP=1", "-c", sql]);
}

function psqlFile(path, variables = {}) {
  const args = ["-v", "ON_ERROR_STOP=1"];
  for (const [key, value] of Object.entries(variables))
    args.push("-v", `${key}=${value}`);
  args.push("-f", path);
  exec("psql", args);
}

function exec(command, args) {
  execFileSync(command, args, { env: pgEnv, stdio: "pipe" });
}

function filterCopyBlocks(raw, selected) {
  const output = ["set session_replication_role = replica;"];
  let include = false;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^COPY "([^"]+)"\."([^"]+)" /);
    if (match) include = selected.has(`${match[1]}.${match[2]}`);
    if (include) output.push(line);
    if (include && line === "\\.") include = false;
  }
  output.push("set session_replication_role = origin;", "");
  return output.join("\n");
}

function sqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}
