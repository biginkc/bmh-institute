#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
};

try {
  exec("initdb", [
    "-D",
    cluster,
    "-A",
    "trust",
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
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text)
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
  ];
  for (const file of migrationFiles)
    psqlFile(resolve(root, "supabase/migrations", file));

  psqlText(`
    alter table public.programs
      add column content_import_id text,
      add column thumbnail_asset_key text,
      add column thumbnail_approved_path text,
      add column thumbnail_approved_sha256 text;
    alter table public.courses
      add column content_import_id text,
      add column thumbnail_asset_key text,
      add column thumbnail_approved_path text,
      add column thumbnail_approved_sha256 text;
    alter table public.lessons
      add column content_import_id text,
      add column thumbnail_asset_key text,
      add column thumbnail_approved_path text,
      add column thumbnail_approved_sha256 text;
  `);

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
  psqlFile(
    resolve(root, "supabase/migrations/021_atomic_fixture_catalog_cleanup.sql"),
  );
  psqlFile(
    resolve(
      root,
      "supabase/migrations/024_fixture_cleanup_canonicalizer_stable.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/migrations/035_refresh_fixture_cleanup_manifest_contract.sql",
    ),
  );
  psqlFile(
    resolve(
      root,
      "supabase/migrations/036_controller_verified_fixture_cleanup_gate.sql",
    ),
  );
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
