import { describe, expect, it } from "vitest";

import {
  buildFixtureCleanupPlan,
  DELETE_ORDER,
  executeFixtureCleanup,
  parseFixtureManifest,
  sha256,
  type FixtureBoundaryManifest,
  type FixtureCleanupAdapter,
} from "./fixture-cleanup";

describe("fixture cleanup boundary", () => {
  it("deletes only exact manifest identities and has no auth deletion surface", async () => {
    const manifest = fixtureManifest();
    const adapter = fakeAdapter();
    const plan = await buildFixtureCleanupPlan({ manifest, manifestSha256: "a".repeat(64), adapter });

    expect(plan.problems).toEqual([]);
    await executeFixtureCleanup({ manifest, plan, adapter, confirmation: "confirm" });

    expect(adapter.atomicCalls).toEqual([
      { manifestSha256: "a".repeat(64), confirmation: "confirm" },
    ]);
    expect(adapter.rows.courses).toContainEqual({ id: "real-course", title: "Real course" });
    expect(adapter.rows.profiles).toEqual([{ id: "retained-profile" }]);
    expect(adapter.rows.audit_log).toEqual([{ id: "retained-audit" }]);
    expect("deleteAuthUsers" in adapter).toBe(false);
  });

  it("prevents a late dependent from causing a partial cleanup", async () => {
    const manifest = fixtureManifest();
    const adapter = fakeAdapter();
    const plan = await buildFixtureCleanupPlan({ manifest, manifestSha256: "a".repeat(64), adapter });
    expect(plan.problems).toEqual([]);
    adapter.rows.modules.push({ id: "late-module", course_id: "fixture-course" });
    adapter.rejectLateDependents = true;
    const before = structuredClone(adapter.rows);

    await expect(
      executeFixtureCleanup({ manifest, plan, adapter, confirmation: "confirm" }),
    ).rejects.toThrow(/late dependent/i);

    expect(adapter.rows).toEqual(before);
    expect(adapter.atomicCalls).toHaveLength(1);
  });

  it("fails closed when a manifest row changes", async () => {
    const adapter = fakeAdapter();
    adapter.rows.courses[0].title = "Edited fixture course";

    const plan = await buildFixtureCleanupPlan({
      manifest: fixtureManifest(),
      manifestSha256: "a".repeat(64),
      adapter,
    });

    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: "fixture_row_drift", table: "courses" }),
    );
  });

  it("fails closed when post-capture import provenance appears", async () => {
    const adapter = fakeAdapter();
    adapter.rows.courses[0].content_import_id = "real-import";

    const plan = await buildFixtureCleanupPlan({
      manifest: fixtureManifest(),
      manifestSha256: "a".repeat(64),
      adapter,
    });

    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: "fixture_row_drift", table: "courses" }),
    );
  });

  it("fails closed when a future column appears on a fixture row", async () => {
    const adapter = fakeAdapter();
    adapter.rows.courses[0].future_real_content = "must not be deleted";

    const plan = await buildFixtureCleanupPlan({
      manifest: fixtureManifest(),
      manifestSha256: "a".repeat(64),
      adapter,
    });

    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: "fixture_row_drift", table: "courses" }),
    );
  });

  it("fails closed on an unmanifested dependent reference", async () => {
    const adapter = fakeAdapter();
    adapter.rows.modules.push({ id: "surprise-module", course_id: "fixture-course" });

    const plan = await buildFixtureCleanupPlan({
      manifest: fixtureManifest(),
      manifestSha256: "a".repeat(64),
      adapter,
    });

    expect(plan.problems).toContainEqual(
      expect.objectContaining({ code: "unexplained_reference", table: "modules" }),
    );
  });

  it("fails closed when retained profiles, auth users or audit rows disappear", async () => {
    const adapter = fakeAdapter();
    adapter.rows.profiles = [];
    adapter.rows.audit_log = [];
    adapter.authUserIds = [];

    const plan = await buildFixtureCleanupPlan({
      manifest: fixtureManifest(),
      manifestSha256: "a".repeat(64),
      adapter,
    });

    expect(plan.problems.map((problem) => problem.code)).toEqual(
      expect.arrayContaining([
        "missing_retained_profile",
        "missing_retained_auth_user",
        "missing_retained_audit_row",
      ]),
    );
  });

  it("rejects a manifest that claims deletion is already authorized", () => {
    const manifest = fixtureManifest();
    manifest.authorization_boundary.deletion_is_authorized_now = true;
    expect(() => parseFixtureManifest(manifest)).toThrow(/not currently authorized/i);
  });
});

function fixtureManifest(): FixtureBoundaryManifest {
  const fixtureTables: FixtureBoundaryManifest["fixture_tables"] = Object.fromEntries(
    DELETE_ORDER.map((table) => [
      table,
      {
        identity_fields: ["id"],
        fingerprint_fields: ["id"],
        current_row_count: 0,
        snapshot_row_count: 0,
        current_read_surface: `public.${table}`,
        rows: [],
      },
    ]),
  );
  fixtureTables.courses = {
    identity_fields: ["id"],
    fingerprint_fields: ["content_import_id", "id", "thumbnail_path", "title"],
    current_row_count: 1,
    snapshot_row_count: 1,
    current_read_surface: "public.courses",
    rows: [
      {
        identity: { id: "fixture-course" },
        row_sha256: sha256(
          JSON.stringify({
            content_import_id: null,
            id: "fixture-course",
            thumbnail_path: null,
            title: "Fixture course",
          }),
        ),
        origin_classification: "test",
        ownership_basis: "test",
      },
    ],
  };
  return {
    manifest_version: 1,
    project: {
      label: "bmh-institute",
      ref: "dhvfsyteqsxagokoerrx",
      production_url: "https://dhvfsyteqsxagokoerrx.supabase.co",
    },
    authorization_boundary: {
      deletion_is_authorized_now: false,
      never_delete: ["auth accounts", "profiles", "audit history"],
    },
    fixture_tables: fixtureTables,
    storage_objects: { content: [], submissions: [] },
    retained_entities: {
      profiles: ["retained-profile"],
      auth_users_from_snapshot: ["retained-auth"],
      audit_log: ["retained-audit"],
    },
    reference_classification: {
      unexplained_database_references: [],
      unexplained_storage_objects: [],
    },
    execution_invariants: {},
  };
}

function fakeAdapter() {
  const rows: Record<string, Array<Record<string, unknown>>> = Object.fromEntries(
    DELETE_ORDER.map((table) => [table, []]),
  );
  rows.courses = [
    {
      content_import_id: null,
      id: "fixture-course",
      thumbnail_path: null,
      title: "Fixture course",
    },
    { id: "real-course", title: "Real course" },
  ];
  rows.profiles = [{ id: "retained-profile" }];
  rows.audit_log = [{ id: "retained-audit" }];
  const atomicCalls: Array<{ manifestSha256: string; confirmation: string }> = [];
  const adapter: FixtureCleanupAdapter & {
    rows: typeof rows;
    authUserIds: string[];
    atomicCalls: typeof atomicCalls;
    rejectLateDependents: boolean;
  } = {
    rows,
    authUserIds: ["retained-auth"],
    atomicCalls,
    rejectLateDependents: false,
    async listRows(table) {
      return rows[table] ?? [];
    },
    async listAuthUserIds() {
      return adapter.authUserIds;
    },
    async listStorageObjectNames() {
      return [];
    },
    async executeAtomicCleanup(input) {
      atomicCalls.push(input);
      const transaction = structuredClone(rows);
      if (adapter.rejectLateDependents && transaction.modules.length > 0) {
        throw new Error("late dependent detected inside transaction");
      }
      transaction.courses = transaction.courses.filter((row) => row.id !== "fixture-course");
      Object.assign(rows, transaction);
      return { status: "deleted", deleted: { courses: 1 } };
    },
    async deleteStorageObjects() {},
  };
  return adapter;
}
