#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const manifestPath = resolve(required(args, "manifest"));
const snapshotDataPath = resolve(required(args, "snapshot-data"));
const snapshotSchemaPath = resolve(required(args, "snapshot-schema"));

const [manifestRaw, dataRaw, schemaRaw] = await Promise.all([
  readFile(manifestPath, "utf8"),
  readFile(snapshotDataPath, "utf8"),
  readFile(snapshotSchemaPath, "utf8"),
]);
const manifest = JSON.parse(manifestRaw);
const columnKinds = parseColumnKinds(schemaRaw);
const snapshot = parseCopyDump(dataRaw, columnKinds);

for (const [table, section] of Object.entries(manifest.fixture_tables)) {
  const rows = addMigrationDefaultGuards(
    table,
    snapshot[`public.${table}`] ?? [],
    snapshot,
  );
  const rowsByIdentity = new Map(
    rows.map((row) => [identityKey(section.identity_fields, row), row]),
  );

  for (const expected of section.rows) {
    const key = identityKey(section.identity_fields, expected.identity);
    const row = rowsByIdentity.get(key);
    if (!row) throw new Error(`Snapshot is missing ${table} fixture row ${key}.`);
    const priorProjection = Object.fromEntries(
      section.fingerprint_fields.map((field) => [field, row[field]]),
    );
    if (sha256(canonicalJson(priorProjection)) !== expected.row_sha256) {
      throw new Error(
        `${table} fixture row ${key} does not match the prior live-capture fingerprint.`,
      );
    }
    expected.row_sha256 = sha256(canonicalJson(row));
  }

  if (section.rows.length > 0) {
    section.fingerprint_fields = Object.keys(rowsByIdentity.get(
      identityKey(section.identity_fields, section.rows[0].identity),
    )).sort();
  }
  const baseSurface = section.current_read_surface
    .split("; complete-row")[0]
    .replace("plus migration 015 default guard", "plus post-capture migration default guards");
  section.current_read_surface = `${baseSurface}; complete-row timestamp baseline from rollback snapshot`;
}

manifest.sources.live_read_only_capture.complete_row_fingerprint_note =
  "Previously guarded fields were verified byte-for-byte against the live-capture hashes. Timestamp baselines came from the rollback snapshot and must still match the locked production rows at execution.";
manifest.sources.live_read_only_capture.post_capture_migration_default_note =
  "Post-capture migration fields are included in fixture fingerprints at their required defaults: thumbnail_path, content_import_id, thumbnail_asset_key, thumbnail_approved_path and thumbnail_approved_sha256 are null, assignment rubric is an empty array, and completed legacy quiz attempts carry no reconstructed per-question result.";

const formatted = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(manifestPath, formatted);
await writeFile(
  `${manifestPath}.sha256`,
  `${sha256(formatted)}  ${manifestPath.split("/").at(-1)}\n`,
);
console.log(
  JSON.stringify({
    output: manifestPath,
    sha256: sha256(formatted),
    rows: Object.values(manifest.fixture_tables).reduce(
      (total, table) => total + table.rows.length,
      0,
    ),
  }),
);

function parseCopyDump(raw, kinds) {
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
    tables[table].push(
      Object.fromEntries(
        columns.map((column, index) => [
          column,
          coerceValue(values[index], kinds.get(`${table}.${column}`)),
        ]),
      ),
    );
  }
  return tables;
}

function parseColumnKinds(raw) {
  const result = new Map();
  for (const tableMatch of raw.matchAll(
    /CREATE TABLE IF NOT EXISTS "([^"]+)"\."([^"]+)" \(([\s\S]*?)\n\);/g,
  )) {
    const table = `${tableMatch[1]}.${tableMatch[2]}`;
    for (const line of tableMatch[3].split("\n")) {
      const column = line.match(/^\s+"([^"]+)"\s+(.+?)(?:,)?$/);
      if (!column) continue;
      const declaration = column[2];
      let kind = "string";
      if (/\bboolean\b/.test(declaration)) kind = "boolean";
      else if (/\b(?:smallint|integer|bigint|numeric|real|double precision)\b/.test(declaration)) {
        kind = "number";
      } else if (/"jsonb?"/.test(declaration)) kind = "json";
      else if (/\[\]/.test(declaration)) kind = "array";
      result.set(`${table}.${column[1]}`, kind);
    }
  }
  return result;
}

function decodeCopyValue(value) {
  if (value === "\\N") return null;
  return value
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
}

function coerceValue(value, kind) {
  if (value === null) return null;
  if (kind === "boolean") return value === "t";
  if (kind === "number") return Number(value);
  if (kind === "json") return JSON.parse(value);
  if (kind === "array") return parsePgArray(value);
  return value;
}

function parsePgArray(value) {
  if (value === "{}") return [];
  return value
    .slice(1, -1)
    .split(",")
    .map((item) => item.replace(/^"|"$/g, "").replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
}

function addMigrationDefaultGuards(table, rows, snapshot) {
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
  if (table === "assignments") return rows.map((row) => ({ ...row, rubric: [] }));
  if (table === "user_block_progress") {
    return rows.map((row) => ({ ...row, asset_version: null }));
  }
  if (table === "user_quiz_attempts") {
    const questions = new Map(
      (snapshot["public.questions"] ?? []).map((question) => [
        question.id,
        question,
      ]),
    );
    const optionsByQuestion = new Map();
    for (const option of snapshot["public.answer_options"] ?? []) {
      const options = optionsByQuestion.get(option.question_id) ?? [];
      options.push(option);
      optionsByQuestion.set(option.question_id, options);
    }
    return rows.map((row) => {
      if (row.completed_at !== null) {
        return {
          ...row,
          answer_results: {},
          grading_snapshot_state: "legacy_summary_only",
        };
      }
      const answerResults = {};
      for (const [questionId, selected] of Object.entries(row.responses ?? {})) {
        const question = questions.get(questionId);
        if (!question || question.quiz_id !== row.quiz_id) {
          throw new Error(
            `Incomplete quiz attempt ${row.id} references unavailable question ${questionId}.`,
          );
        }
        const correct = (optionsByQuestion.get(questionId) ?? [])
          .filter((option) => option.is_correct)
          .map((option) => option.id)
          .sort();
        const selectedSorted = [...selected].sort();
        const isCorrect = question.question_type === "multi_select"
          ? canonicalJson(selectedSorted) === canonicalJson(correct)
          : selectedSorted.length === 1 && correct.includes(selectedSorted[0]);
        answerResults[questionId] = {
          is_correct: isCorrect,
          points: question.points ?? 1,
          question_type: question.question_type,
          ...(isCorrect ? { explanation: null } : {}),
        };
      }
      return {
        ...row,
        answer_results: answerResults,
        grading_snapshot_state: "legacy_backfilled",
      };
    });
  }
  return rows;
}

function identityKey(fields, row) {
  return fields.map((field) => String(row[field])).join("|");
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
  return value;
}
