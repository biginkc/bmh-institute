import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const manifestPath = resolve(root, "docs/course-production/fixture-boundary-manifest.json");
const migrationPath = resolve(root, "supabase/migrations/021_atomic_fixture_catalog_cleanup.sql");
const volatilityFixPath = resolve(
  root,
  "supabase/migrations/024_fixture_cleanup_canonicalizer_stable.sql",
);
const manifestRaw = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw) as {
  fixture_tables: Record<string, { fingerprint_fields: string[] }>;
};
const migration = readFileSync(migrationPath, "utf8");
const volatilityFix = readFileSync(volatilityFixPath, "utf8");
const manifestHash = createHash("sha256").update(manifestRaw).digest("hex");

describe("atomic fixture cleanup migration", () => {
  it("is bound to the exact machine-readable manifest", () => {
    expect(readFileSync(`${manifestPath}.sha256`, "utf8")).toBe(
      `${manifestHash}  fixture-boundary-manifest.json\n`,
    );
    expect(migration).toContain(`Manifest SHA-256: ${manifestHash}`);
    expect(migration).toContain(`p_manifest_sha256 <> '${manifestHash}'`);
  });

  it("guards fields added after the production capture", () => {
    expect(manifest.fixture_tables.programs.fingerprint_fields).toContain("thumbnail_path");
    expect(manifest.fixture_tables.programs.fingerprint_fields).toContain("content_import_id");
    expect(manifest.fixture_tables.courses.fingerprint_fields).toContain("thumbnail_path");
    expect(manifest.fixture_tables.courses.fingerprint_fields).toContain("content_import_id");
    expect(manifest.fixture_tables.lessons.fingerprint_fields).toContain("thumbnail_path");
    expect(manifest.fixture_tables.lessons.fingerprint_fields).toContain("content_import_id");
    expect(manifest.fixture_tables.assignments.fingerprint_fields).toContain("rubric");
    expect(manifest.fixture_tables.invites.fingerprint_fields).toContain("accepted_at");
    expect(manifest.fixture_tables.user_course_resume.fingerprint_fields).toContain("updated_at");
    for (const table of ["programs", "courses", "lessons"]) {
      expect(manifest.fixture_tables[table].fingerprint_fields).toEqual(
        expect.arrayContaining([
          "content_import_id",
          "thumbnail_asset_key",
          "thumbnail_approved_path",
          "thumbnail_approved_sha256",
        ]),
      );
    }
    expect(migration).toContain("thumbnail_path");
    expect(migration).toContain("content_import_id");
    expect(migration).toContain("rubric");
  });

  it("locks and revalidates dependents inside one transaction before deleting", () => {
    const lockAt = migration.indexOf("lock table");
    const driftAt = migration.indexOf("row drift");
    const referenceAt = migration.indexOf("unexplained reference");
    const deleteAt = migration.indexOf("delete from public.%I");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(lockAt).toBeGreaterThan(0);
    expect(driftAt).toBeGreaterThan(lockAt);
    expect(referenceAt).toBeGreaterThan(driftAt);
    expect(deleteAt).toBeGreaterThan(referenceAt);
    expect(migration).toContain("partial fixture state");
    expect(migration).toContain("get diagnostics v_present = row_count");
    expect(migration).toContain("from pg_constraint constraint_row");
    expect(migration).toContain("unnest(constraint_row.conkey, constraint_row.confkey)");
    expect(migration).toContain("unknown foreign key");
    expect(migration).toContain("column-set drift");
    expect(migration).toContain("cross-schema foreign key");
    expect(migration).toContain("migration 020 artwork provenance prerequisite is missing");
    expect(migration).not.toContain("and child_schema.nspname = 'public'");
  });

  it("preserves accounts and audit history and exposes no broad execution grant", () => {
    const functionTail = migration.slice(migration.indexOf("create or replace function public.admin_cleanup"));
    expect(functionTail).not.toMatch(/delete from (?:auth\.users|public\.profiles|public\.audit_log)/i);
    expect(migration.match(/fixture_cleanup_assert_retained_v1\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain(
      "revoke all on function public.admin_cleanup_fixture_catalog_v1(text, text) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_cleanup_fixture_catalog_v1(text, text) to service_role;",
    );
  });

  it("does not delete storage in the database transaction", () => {
    expect(migration).not.toMatch(/delete from storage\./i);
    expect(migration).not.toMatch(/storage\.objects/i);
  });

  it("corrects the canonicalizer volatility without rewriting the applied cleanup migration", () => {
    expect(volatilityFix).toContain(
      "alter function private.fixture_cleanup_canonical_jsonb_v1(jsonb) stable;",
    );
    expect(readFileSync(resolve(root, "scripts/fixture-boundary/build-atomic-migration.mjs"), "utf8"))
      .toMatch(/language plpgsql\s+stable\s+strict/);
  });
});
