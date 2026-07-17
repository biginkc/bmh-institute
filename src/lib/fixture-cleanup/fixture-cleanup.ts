import { createHash } from "node:crypto";

export type RowIdentity = Record<string, string>;

export type FixtureRow = {
  identity: RowIdentity;
  row_sha256: string;
  origin_classification: string;
  ownership_basis: string;
};

export type FixtureTable = {
  identity_fields: string[];
  fingerprint_fields: string[];
  current_row_count: number;
  snapshot_row_count: number;
  current_read_surface: string;
  rows: FixtureRow[];
};

export type FixtureBoundaryManifest = {
  manifest_version: number;
  project: { label: string; ref: string; production_url: string };
  authorization_boundary: {
    deletion_is_authorized_now: boolean;
    never_delete: string[];
  };
  fixture_tables: Record<string, FixtureTable>;
  storage_objects: Record<string, unknown>;
  retained_entities: {
    profiles: string[];
    auth_users_from_snapshot: string[];
    audit_log: string[];
  };
  reference_classification: {
    unexplained_database_references: unknown[];
    unexplained_storage_objects: unknown[];
  };
  execution_invariants: Record<string, boolean>;
};

export type FixtureCleanupAdapter = {
  listRows(table: string): Promise<Array<Record<string, unknown>>>;
  listAuthUserIds(): Promise<string[]>;
  listStorageObjectNames(bucket: string): Promise<string[]>;
  executeAtomicCleanup(input: {
    manifestSha256: string;
    confirmation: string;
  }): Promise<{ status: "deleted" | "already_deleted"; deleted: Record<string, number> }>;
  deleteStorageObjects(bucket: string, names: string[]): Promise<void>;
};

export type CleanupProblem = {
  code:
    | "invalid_manifest"
    | "missing_fixture_row"
    | "fixture_row_drift"
    | "unexplained_reference"
    | "missing_retained_profile"
    | "missing_retained_auth_user"
    | "missing_retained_audit_row"
    | "storage_drift";
  table?: string;
  identity?: RowIdentity;
  message: string;
};

export type FixtureCleanupPlan = {
  manifestSha256: string;
  deleteCounts: Record<string, number>;
  storageDeleteCounts: Record<string, number>;
  problems: CleanupProblem[];
};

export const DELETE_ORDER = [
  "role_play_results",
  "user_video_progress",
  "user_block_progress",
  "assignment_submissions",
  "user_quiz_attempts",
  "user_lesson_completions",
  "user_course_resume",
  "certificates",
  "program_certificates",
  "user_role_groups",
  "program_access",
  "course_access",
  "invites",
  "content_blocks",
  "lessons",
  "answer_options",
  "questions",
  "assignments",
  "quizzes",
  "modules",
  "program_courses",
  "programs",
  "courses",
  "role_groups",
] as const;

const REFERENCE_FIELDS: Record<string, Array<[string, string]>> = {
  program_courses: [["program_id", "programs"], ["course_id", "courses"]],
  program_access: [["program_id", "programs"], ["role_group_id", "role_groups"]],
  course_access: [["course_id", "courses"], ["role_group_id", "role_groups"]],
  user_role_groups: [["role_group_id", "role_groups"]],
  modules: [["course_id", "courses"]],
  lessons: [
    ["module_id", "modules"],
    ["quiz_id", "quizzes"],
    ["assignment_id", "assignments"],
    ["prerequisite_lesson_id", "lessons"],
  ],
  content_blocks: [["lesson_id", "lessons"]],
  questions: [["quiz_id", "quizzes"]],
  answer_options: [["question_id", "questions"]],
  assignment_submissions: [["assignment_id", "assignments"], ["lesson_id", "lessons"]],
  role_play_results: [["block_id", "content_blocks"]],
  user_block_progress: [["block_id", "content_blocks"]],
  user_video_progress: [["block_id", "content_blocks"]],
  user_lesson_completions: [["lesson_id", "lessons"]],
  user_quiz_attempts: [["quiz_id", "quizzes"], ["lesson_id", "lessons"]],
  user_course_resume: [
    ["course_id", "courses"],
    ["last_lesson_id", "lessons"],
    ["last_block_id", "content_blocks"],
  ],
  certificates: [["course_id", "courses"]],
  program_certificates: [["program_id", "programs"]],
};

export function parseFixtureManifest(raw: unknown): FixtureBoundaryManifest {
  if (!raw || typeof raw !== "object") throw new Error("Fixture manifest must be an object.");
  const value = raw as Partial<FixtureBoundaryManifest>;
  if (value.manifest_version !== 1) throw new Error("Unsupported fixture manifest version.");
  if (value.project?.ref !== "dhvfsyteqsxagokoerrx") throw new Error("Unexpected production project ref.");
  if (value.authorization_boundary?.deletion_is_authorized_now !== false) {
    throw new Error("Manifest must state that deletion is not currently authorized.");
  }
  if (!value.fixture_tables || !value.retained_entities || !value.reference_classification) {
    throw new Error("Fixture manifest is missing required sections.");
  }
  for (const table of DELETE_ORDER) {
    const section = value.fixture_tables[table];
    if (!section || !Array.isArray(section.rows) || !Array.isArray(section.identity_fields)) {
      throw new Error(`Fixture manifest is missing ${table}.`);
    }
    if (!Array.isArray(section.fingerprint_fields)) {
      throw new Error(`Fixture manifest is missing ${table} fingerprint fields.`);
    }
    if (
      section.rows.length > 0 &&
      (section.fingerprint_fields.length === 0 ||
        new Set(section.fingerprint_fields).size !== section.fingerprint_fields.length)
    ) {
      throw new Error(`Fixture manifest has an invalid ${table} complete-row field set.`);
    }
  }
  if (value.reference_classification.unexplained_database_references.length > 0) {
    throw new Error("Manifest contains unexplained database references.");
  }
  if (value.reference_classification.unexplained_storage_objects.length > 0) {
    throw new Error("Manifest contains unexplained storage objects.");
  }
  return value as FixtureBoundaryManifest;
}

export async function buildFixtureCleanupPlan({
  manifest,
  manifestSha256,
  adapter,
}: {
  manifest: FixtureBoundaryManifest;
  manifestSha256: string;
  adapter: FixtureCleanupAdapter;
}): Promise<FixtureCleanupPlan> {
  const problems: CleanupProblem[] = [];
  const rowsByTable = new Map<string, Array<Record<string, unknown>>>();

  for (const table of DELETE_ORDER) {
    rowsByTable.set(table, await adapter.listRows(table));
  }

  const fixtureIds = fixtureIdSets(manifest);
  for (const table of DELETE_ORDER) {
    const section = manifest.fixture_tables[table];
    const liveRows = rowsByTable.get(table) ?? [];
    const liveByIdentity = new Map(
      liveRows.map((row) => [identityKey(section.identity_fields, row), row]),
    );
    const expectedKeys = new Set<string>();

    for (const expected of section.rows) {
      const key = identityKey(section.identity_fields, expected.identity);
      expectedKeys.add(key);
      const current = liveByIdentity.get(key);
      if (!current) {
        problems.push({
          code: "missing_fixture_row",
          table,
          identity: expected.identity,
          message: `${table} fixture row ${key} is missing.`,
        });
        continue;
      }
      const actualFields = Object.keys(current).sort();
      const expectedFields = [...section.fingerprint_fields].sort();
      if (canonicalJson(actualFields) !== canonicalJson(expectedFields)) {
        problems.push({
          code: "fixture_row_drift",
          table,
          identity: expected.identity,
          message: `${table} fixture row ${key} has a changed column set.`,
        });
        continue;
      }
      const projected = Object.fromEntries(
        section.fingerprint_fields.map((field) => [field, current[field]]),
      );
      if (sha256(canonicalJson(projected)) !== expected.row_sha256) {
        problems.push({
          code: "fixture_row_drift",
          table,
          identity: expected.identity,
          message: `${table} fixture row ${key} changed after the boundary capture.`,
        });
      }
    }

    for (const row of liveRows) {
      const key = identityKey(section.identity_fields, row);
      if (expectedKeys.has(key)) continue;
      if (referencesFixture(table, row, fixtureIds) || inviteReferencesFixture(table, row, fixtureIds)) {
        problems.push({
          code: "unexplained_reference",
          table,
          identity: Object.fromEntries(section.identity_fields.map((field) => [field, String(row[field])])),
          message: `${table} row ${key} references fixture content but is not in the exact manifest.`,
        });
      }
    }
  }

  await assertRetainedRows(manifest, adapter, problems);
  await assertStorage(manifest, adapter, problems);

  return {
    manifestSha256,
    deleteCounts: Object.fromEntries(
      DELETE_ORDER.map((table) => [table, manifest.fixture_tables[table].rows.length]),
    ),
    storageDeleteCounts: Object.fromEntries(
      ["content", "submissions"].map((bucket) => {
        const objects = manifest.storage_objects[bucket];
        if (!Array.isArray(objects)) throw new Error(`Invalid storage manifest for ${bucket}.`);
        return [bucket, objects.length];
      }),
    ),
    problems,
  };
}

export async function executeFixtureCleanup({
  manifest,
  plan,
  adapter,
  confirmation,
}: {
  manifest: FixtureBoundaryManifest;
  plan: FixtureCleanupPlan;
  adapter: FixtureCleanupAdapter;
  confirmation: string;
}) {
  if (plan.problems.length > 0 && !isAlreadyDeletedCandidate(manifest, plan)) {
    throw new Error("Fixture cleanup preflight has blocking problems.");
  }
  const database = await adapter.executeAtomicCleanup({
    manifestSha256: plan.manifestSha256,
    confirmation,
  });
  for (const bucket of ["content", "submissions"]) {
    const objects = manifest.storage_objects[bucket];
    if (!Array.isArray(objects)) throw new Error(`Invalid storage manifest for ${bucket}.`);
    const names = objects.map((item) =>
      typeof item === "string" ? item : String((item as { name: string }).name),
    );
    if (names.length > 0) await adapter.deleteStorageObjects(bucket, names);
  }
  return database;
}

function isAlreadyDeletedCandidate(
  manifest: FixtureBoundaryManifest,
  plan: FixtureCleanupPlan,
) {
  const expectedRows = Object.values(manifest.fixture_tables).reduce(
    (total, table) => total + table.rows.length,
    0,
  );
  const missingRows = plan.problems.filter((problem) => problem.code === "missing_fixture_row");
  return (
    expectedRows > 0 &&
    missingRows.length === expectedRows &&
    plan.problems.every(
      (problem) => problem.code === "missing_fixture_row" || problem.code === "storage_drift",
    )
  );
}

async function assertRetainedRows(
  manifest: FixtureBoundaryManifest,
  adapter: FixtureCleanupAdapter,
  problems: CleanupProblem[],
) {
  const [profiles, audits, authUsers] = await Promise.all([
    adapter.listRows("profiles"),
    adapter.listRows("audit_log"),
    adapter.listAuthUserIds(),
  ]);
  addMissingRetained(
    "profiles",
    manifest.retained_entities.profiles,
    profiles.map((row) => String(row.id)),
    "missing_retained_profile",
    problems,
  );
  addMissingRetained(
    "audit_log",
    manifest.retained_entities.audit_log,
    audits.map((row) => String(row.id)),
    "missing_retained_audit_row",
    problems,
  );
  addMissingRetained(
    "auth.users",
    manifest.retained_entities.auth_users_from_snapshot,
    authUsers,
    "missing_retained_auth_user",
    problems,
  );
}

function addMissingRetained(
  table: string,
  expected: string[],
  current: string[],
  code: CleanupProblem["code"],
  problems: CleanupProblem[],
) {
  const live = new Set(current);
  for (const id of expected) {
    if (!live.has(id)) {
      problems.push({ code, table, identity: { id }, message: `Retained ${table} row ${id} is missing.` });
    }
  }
}

async function assertStorage(
  manifest: FixtureBoundaryManifest,
  adapter: FixtureCleanupAdapter,
  problems: CleanupProblem[],
) {
  for (const bucket of ["content", "submissions"]) {
    const expected = manifest.storage_objects[bucket];
    if (!Array.isArray(expected)) throw new Error(`Invalid storage manifest for ${bucket}.`);
    const current = await adapter.listStorageObjectNames(bucket);
    const expectedNames = new Set(
      expected.map((item) => typeof item === "string" ? item : String((item as { name: string }).name)),
    );
    for (const name of expectedNames) {
      if (!current.includes(name)) {
        problems.push({ code: "storage_drift", message: `${bucket}/${name} is missing.` });
      }
    }
  }
}

function fixtureIdSets(manifest: FixtureBoundaryManifest) {
  return new Map(
    Object.entries(manifest.fixture_tables).map(([table, section]) => [
      table,
      new Set(section.rows.map((row) => row.identity.id).filter(Boolean)),
    ]),
  );
}

function referencesFixture(
  table: string,
  row: Record<string, unknown>,
  ids: Map<string, Set<string>>,
) {
  return (REFERENCE_FIELDS[table] ?? []).some(([field, parent]) => {
    const value = row[field];
    return typeof value === "string" && ids.get(parent)?.has(value);
  });
}

function inviteReferencesFixture(
  table: string,
  row: Record<string, unknown>,
  ids: Map<string, Set<string>>,
) {
  if (table !== "invites" || !Array.isArray(row.role_group_ids)) return false;
  return row.role_group_ids.some(
    (value) => typeof value === "string" && ids.get("role_groups")?.has(value),
  );
}

function identityKey(fields: string[], row: Record<string, unknown>) {
  return fields.map((field) => String(row[field])).join("|");
}

function canonicalJson(value: unknown) {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize((value as Record<string, unknown>)[key])]),
    );
  }
  if (typeof value === "string" && /^\d{4}-\d\d-\d\d(?:T| )/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  }
  return value;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
