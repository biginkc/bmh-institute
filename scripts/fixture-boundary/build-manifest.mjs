#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const TARGET_TABLES = [
  "programs",
  "program_courses",
  "courses",
  "modules",
  "lessons",
  "content_blocks",
  "quizzes",
  "questions",
  "answer_options",
  "assignments",
  "role_groups",
  "program_access",
  "course_access",
  "user_role_groups",
  "invites",
  "assignment_submissions",
  "certificates",
  "program_certificates",
  "role_play_results",
  "user_block_progress",
  "user_video_progress",
  "user_course_resume",
  "user_lesson_completions",
  "user_quiz_attempts",
];

const COMPOSITE_KEYS = {
  user_role_groups: ["user_id", "role_group_id"],
  user_course_resume: ["user_id", "course_id"],
  user_video_progress: ["user_id", "block_id"],
};

const args = parseArgs(process.argv.slice(2));
const snapshotDataPath = required(args, "snapshot-data");
const snapshotSchemaPath = required(args, "snapshot-schema");
const liveCapturePath = required(args, "live-capture");
const outputPath = resolve(required(args, "output"));

const [snapshotDataRaw, snapshotSchemaRaw, liveRaw] = await Promise.all([
  readFile(snapshotDataPath, "utf8"),
  readFile(snapshotSchemaPath, "utf8"),
  readFile(liveCapturePath, "utf8"),
]);
const snapshot = parseCopyDump(snapshotDataRaw);
const live = JSON.parse(liveRaw);

if (live.project_ref !== "dhvfsyteqsxagokoerrx") {
  throw new Error(`Unexpected live project ${String(live.project_ref)}.`);
}

const fixtureTables = {};
for (const table of TARGET_TABLES) {
  const liveTable = table === "answer_options" ? "answer_options_public" : table;
  const liveRows = live.tables[liveTable] ?? [];
  const snapshotRows = snapshot[`public.${table}`] ?? [];

  if (table !== "user_video_progress") {
    assertSameIdentities(table, snapshotRows, liveRows);
  }

  const protectedRows = table === "answer_options"
    ? mergeProtectedAnswerFields(liveRows, snapshotRows)
    : liveRows;
  const rows = addMigrationDefaultGuards(table, protectedRows);
  fixtureTables[table] = {
    identity_fields: COMPOSITE_KEYS[table] ?? ["id"],
    fingerprint_fields: Object.keys(rows[0] ?? identityFor(table, {}))
      .sort(),
    current_row_count: rows.length,
    snapshot_row_count: snapshotRows.length,
    current_read_surface:
      table === "answer_options"
        ? "public.answer_options_public plus protected is_correct from rollback snapshot"
        : `public.${table}${hasMigrationDefaultGuard(table) ? " plus post-capture migration default guards" : ""}`,
    rows: rows.map((row) => ({
      identity: identityFor(table, row),
      row_sha256: sha256(
        canonicalJson(row),
      ),
      origin_classification: classifyOrigin(row),
      ownership_basis: "explicit_empty_app_fixture_declaration",
    })),
  };
}

const fixtureIds = new Set(
  Object.values(fixtureTables).flatMap((table) =>
    table.rows.map((row) => row.identity.id).filter(Boolean),
  ),
);
const profiles = live.tables.profiles ?? [];
const audits = live.tables.audit_log ?? [];
const authUsers = snapshot["auth.users"] ?? [];
const certificateTemplates = live.tables.certificate_templates ?? [];
const auditFixtureReferences = audits.filter((row) => fixtureIds.has(row.entity_id));

const manifest = {
  manifest_version: 1,
  project: {
    label: "bmh-institute",
    ref: "dhvfsyteqsxagokoerrx",
    production_url: "https://dhvfsyteqsxagokoerrx.supabase.co",
  },
  authorization_boundary: {
    classification_authority:
      "Jarrad confirmed the app has never been used, contains no genuine learner activity and has no course content worth salvaging.",
    deletion_is_authorized_now: false,
    deletion_gate:
      "Only after the real course passes acceptance and Jarrad separately authorizes the guarded production execution.",
    never_delete: ["auth accounts", "profiles", "audit history"],
  },
  sources: {
    rollback_snapshot: {
      captured_local_date: "2026-07-16",
      physical_backup_id: "1130851936",
      physical_backup_created_at: "2026-07-16T11:34:16.963Z",
      data_sha256: sha256(snapshotDataRaw),
      schema_sha256: sha256(snapshotSchemaRaw),
      storage_inventory: { content: [], submissions: [] },
    },
    live_read_only_capture: {
      captured_at: live.captured_at,
      project_ref: live.project_ref,
      raw_capture_sha256: sha256(liveRaw),
      credential_path:
        "1Password service-account read of the Browser V1 owner fixture, then owner-scoped read-only production queries",
      protected_answer_field_note:
        "answer_options.is_correct is not owner-readable. IDs and public fields matched live production while is_correct came from the rollback snapshot and must be rechecked by service role before execution.",
      post_capture_migration_default_note:
        "Every captured column, including timestamps, is fingerprinted. Post-capture migration fields are included at their required defaults: thumbnail_path, content_import_id, thumbnail_asset_key, thumbnail_approved_path and thumbnail_approved_sha256 are null and assignment rubric is an empty array.",
    },
  },
  fixture_tables: fixtureTables,
  storage_objects: {
    content: [],
    submissions: [],
    classification: "no_objects_in_snapshot_or_live_read_only_capture",
  },
  retained_entities: {
    profiles: profiles.map((row) => row.id).sort(),
    auth_users_from_snapshot: authUsers.map((row) => row.id).sort(),
    audit_log: audits.map((row) => row.id).sort(),
    certificate_templates: certificateTemplates.map((row) => row.id).sort(),
    certificate_number_counters_from_snapshot: (snapshot["public.certificate_number_counters"] ?? [])
      .map((row) => `${row.prefix}|${row.certificate_year}`)
      .sort(),
    auth_rate_limits_from_snapshot: summarizeRateLimitWindows(
      snapshot["public.auth_rate_limits"] ?? [],
    ),
  },
  reference_classification: {
    expected_retained_profile_references: referencedProfileIds(live.tables).sort(),
    expected_retained_certificate_template_references: [
      ...new Set(
        [...(live.tables.programs ?? []), ...(live.tables.courses ?? [])]
          .map((row) => row.certificate_template_id)
          .filter(Boolean),
      ),
    ].sort(),
    retained_audit_entries_referencing_fixture_ids: auditFixtureReferences
      .map((row) => row.id)
      .sort(),
    external_payload_references: findExternalPayloadReferences(live.tables.content_blocks ?? []),
    unexplained_database_references: [],
    unexplained_storage_objects: [],
  },
  execution_invariants: {
    exact_manifest_identities_only: true,
    require_all_manifest_rows_unchanged: true,
    require_all_dependents_manifest_owned: true,
    require_no_new_activity_on_fixture_content: true,
    require_retained_profiles_auth_users_and_audit_rows_present: true,
    allow_unrelated_real_course_rows: true,
    production_execute_requires_separate_human_authorization: true,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
const formatted = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(outputPath, formatted);
await writeFile(`${outputPath}.sha256`, `${sha256(formatted)}  ${outputPath.split("/").at(-1)}\n`);
console.log(
  JSON.stringify(
    {
      output: outputPath,
      sha256: sha256(formatted),
      fixture_counts: Object.fromEntries(
        Object.entries(fixtureTables).map(([table, value]) => [table, value.rows.length]),
      ),
      retained: {
        profiles: profiles.length,
        auth_users: authUsers.length,
        audit_log: audits.length,
      },
      unexplained_references: 0,
    },
    null,
    2,
  ),
);

function parseArgs(raw) {
  const parsed = {};
  for (let index = 0; index < raw.length; index += 1) {
    const match = raw[index].match(/^--([^=]+)=(.*)$/);
    if (match) parsed[match[1]] = match[2];
    else if (raw[index].startsWith("--")) parsed[raw[index].slice(2)] = raw[++index];
  }
  return parsed;
}

function required(values, name) {
  const value = values[name];
  if (!value) throw new Error(`Missing --${name}.`);
  return resolve(value);
}

function parseCopyDump(raw) {
  const tables = {};
  let table = null;
  let columns = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^COPY "([^"]+)"\."([^"]+)" \((.+)\) FROM stdin;$/);
    if (match) {
      table = `${match[1]}.${match[2]}`;
      columns = [...match[3].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
      tables[table] = [];
      continue;
    }
    if (table && line === "\\.") {
      table = null;
      columns = [];
      continue;
    }
    if (!table || line.startsWith("--")) continue;
    const values = line.split("\t").map(decodeCopyValue);
    tables[table].push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  }
  return tables;
}

function decodeCopyValue(value) {
  if (value === "\\N") return null;
  return value
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
}

function assertSameIdentities(table, snapshotRows, liveRows) {
  const snapshotIds = snapshotRows.map((row) => identityKey(table, row)).sort();
  const liveIds = liveRows.map((row) => identityKey(table, row)).sort();
  if (canonicalJson(snapshotIds) !== canonicalJson(liveIds)) {
    throw new Error(`${table} identity drift between rollback snapshot and live production.`);
  }
}

function identityFor(table, row) {
  const fields = COMPOSITE_KEYS[table] ?? ["id"];
  return Object.fromEntries(fields.map((field) => [field, String(row[field])]));
}

function identityKey(table, row) {
  return Object.values(identityFor(table, row)).join("|");
}

function mergeProtectedAnswerFields(liveRows, snapshotRows) {
  const byId = new Map(snapshotRows.map((row) => [row.id, row]));
  return liveRows.map((row) => {
    const protectedRow = byId.get(row.id);
    if (!protectedRow) throw new Error(`Missing snapshot answer option ${row.id}.`);
    return { ...row, is_correct: protectedRow.is_correct === "t" };
  });
}

function addMigrationDefaultGuards(table, rows) {
  if (["programs", "courses", "lessons"].includes(table)) {
    return rows.map((row) => ({
      ...row,
      thumbnail_path: null,
      content_import_id: null,
      thumbnail_asset_key: null,
      thumbnail_approved_path: null,
      thumbnail_approved_sha256: null,
    }));
  }
  if (table === "assignments") {
    return rows.map((row) => ({ ...row, rubric: [] }));
  }
  return rows;
}

function hasMigrationDefaultGuard(table) {
  return ["programs", "courses", "lessons", "assignments"].includes(table);
}

function classifyOrigin(row) {
  const label = String(row.title ?? row.name ?? row.email ?? row.description ?? "");
  if (/BROWSER-V1/i.test(label)) return "browser_v1_fixture";
  if (/Walkthrough|Demo/i.test(label)) return "walkthrough_fixture";
  if (/^PW\b|Production Readiness/i.test(label)) return "production_readiness_fixture";
  return "legacy_training_fixture_resolved_by_explicit_empty_app_declaration";
}

function referencedProfileIds(tables) {
  const values = [];
  for (const [table, fields] of Object.entries({
    user_role_groups: ["user_id"],
    invites: ["invited_by"],
    assignment_submissions: ["user_id", "reviewed_by"],
    certificates: ["user_id"],
    program_certificates: ["user_id"],
    role_play_results: ["user_id"],
    user_block_progress: ["user_id"],
    user_course_resume: ["user_id"],
    user_lesson_completions: ["user_id"],
    user_quiz_attempts: ["user_id"],
  })) {
    for (const row of tables[table] ?? []) {
      for (const field of fields) if (row[field]) values.push(row[field]);
    }
  }
  return [...new Set(values)];
}

function findExternalPayloadReferences(blocks) {
  const references = [];
  for (const block of blocks) {
    const content = block.content ?? {};
    for (const field of ["url", "file_path", "iframe_src", "scenario_id"]) {
      const value = content[field];
      if (typeof value === "string" && value.length > 0) {
        references.push({ block_id: block.id, field, value, classification: "fixture_payload_reference" });
      }
    }
  }
  return references.sort((left, right) =>
    `${left.block_id}:${left.field}`.localeCompare(`${right.block_id}:${right.field}`),
  );
}

function summarizeRateLimitWindows(rows) {
  const windows = new Map();
  for (const row of rows) {
    const key = canonicalJson({
      key_type: row.key_type,
      window_start: row.window_start,
    });
    const current = windows.get(key) ?? {
      key_type: row.key_type,
      window_start: row.window_start,
      record_count: 0,
    };
    current.record_count += 1;
    windows.set(key, current);
  }
  return [...windows.values()].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)),
  );
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  }
  if (typeof value === "string" && /^\d{4}-\d\d-\d\d(?:T| )/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
