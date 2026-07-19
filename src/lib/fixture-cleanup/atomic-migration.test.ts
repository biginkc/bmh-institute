import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const manifestPath = resolve(
  root,
  "docs/course-production/fixture-boundary-manifest.json",
);
const migrationPath = resolve(
  root,
  "supabase/migrations/021_atomic_fixture_catalog_cleanup.sql",
);
const ownershipPath = resolve(
  root,
  "docs/course-production/FIXTURE-OWNERSHIP.md",
);
const volatilityFixPath = resolve(
  root,
  "supabase/migrations/024_fixture_cleanup_canonicalizer_stable.sql",
);
const contractRefreshPath = resolve(
  root,
  "supabase/migrations/035_refresh_fixture_cleanup_manifest_contract.sql",
);
const controllerGatePath = resolve(
  root,
  "supabase/migrations/036_controller_verified_fixture_cleanup_gate.sql",
);
const progressFingerprintRefreshPath = resolve(
  root,
  "supabase/migrations/038_refresh_fixture_progress_fingerprints.sql",
);
const controllerGateSqlTestPath = resolve(
  root,
  "supabase/tests/036_controller_verified_fixture_cleanup_gate.sql",
);
const controllerGateHostedSqlTestPath = resolve(
  root,
  "supabase/tests/036_controller_verified_fixture_cleanup_gate_hosted.sql",
);
const controllerGatePrDestructiveTestPath = resolve(
  root,
  "scripts/fixture-boundary/controller-gate-pr-destructive-test.sql",
);
const manifestRaw = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw) as {
  fixture_tables: Record<
    string,
    {
      fingerprint_fields: string[];
      rows: Array<{ identity: { id: string }; row_sha256: string }>;
    }
  >;
};
const migration = readFileSync(migrationPath, "utf8");
const ownership = readFileSync(ownershipPath, "utf8");
const volatilityFix = readFileSync(volatilityFixPath, "utf8");
const contractRefresh = readFileSync(contractRefreshPath, "utf8");
const controllerGate = readFileSync(controllerGatePath, "utf8");
const progressFingerprintRefresh = readFileSync(
  progressFingerprintRefreshPath,
  "utf8",
);
const controllerGateSqlTest = readFileSync(controllerGateSqlTestPath, "utf8");
const controllerGateHostedSqlTest = readFileSync(
  controllerGateHostedSqlTestPath,
  "utf8",
);
const controllerGatePrDestructiveTest = readFileSync(
  controllerGatePrDestructiveTestPath,
  "utf8",
);
const manifestHash = createHash("sha256").update(manifestRaw).digest("hex");

describe("atomic fixture cleanup migration", () => {
  it("is bound to the exact machine-readable manifest", () => {
    expect(readFileSync(`${manifestPath}.sha256`, "utf8")).toBe(
      `${manifestHash}  fixture-boundary-manifest.json\n`,
    );
    expect(progressFingerprintRefresh).toContain(
      `v_new_manifest_sha constant text := '${manifestHash}'`,
    );
    expect(contractRefresh).toContain("Migration 021 is already applied");
    expect(contractRefresh).toContain(
      "v_old_occurrences <> 2 or v_new_occurrences <> 0",
    );
    expect(contractRefresh).toContain(
      "v_old_occurrences <> 0 or v_new_occurrences <> 2",
    );
    expect(contractRefresh).toContain(
      "grant execute on function public.admin_cleanup_fixture_catalog_v1(text, text)\n  to service_role;",
    );
  });

  it("guards fields added after the production capture", () => {
    expect(manifest.fixture_tables.programs.fingerprint_fields).toContain(
      "thumbnail_path",
    );
    expect(manifest.fixture_tables.programs.fingerprint_fields).toContain(
      "content_import_id",
    );
    expect(manifest.fixture_tables.courses.fingerprint_fields).toContain(
      "thumbnail_path",
    );
    expect(manifest.fixture_tables.courses.fingerprint_fields).toContain(
      "content_import_id",
    );
    expect(manifest.fixture_tables.lessons.fingerprint_fields).toContain(
      "thumbnail_path",
    );
    expect(manifest.fixture_tables.lessons.fingerprint_fields).toContain(
      "content_import_id",
    );
    expect(manifest.fixture_tables.assignments.fingerprint_fields).toContain(
      "rubric",
    );
    expect(manifest.fixture_tables.invites.fingerprint_fields).toContain(
      "accepted_at",
    );
    expect(
      manifest.fixture_tables.user_course_resume.fingerprint_fields,
    ).toContain("updated_at");
    expect(
      manifest.fixture_tables.user_block_progress.fingerprint_fields,
    ).toContain("asset_version");
    expect(progressFingerprintRefresh).toContain(
      "array['asset_version', 'block_id', 'completed_at', 'id', 'user_id']::text[]",
    );
    expect(progressFingerprintRefresh).toContain(
      "fixture_cleanup_legacy_contract_attestation_v1",
    );
    expect(progressFingerprintRefresh).toContain(
      "fixture_cleanup_controller_contract_attestation_v1",
    );
    expect(progressFingerprintRefresh).toContain(
      "v_live_progress_count not in (0, 67)",
    );
    expect(progressFingerprintRefresh).toMatch(
      /from public\.user_block_progress progress[\s\S]*join private\.fixture_cleanup_boundary_v1 boundary[\s\S]*boundary\.identity_key = progress\.id::text/i,
    );
    expect(progressFingerprintRefresh).toContain(
      "if v_live_progress_count = 67 then",
    );
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

  it("documents only the six checksum-locked fixture invites as deletion candidates", () => {
    const invites = manifest.fixture_tables.invites.rows;
    const sectionStart = ownership.indexOf("## Fixture-owned invites");
    const sectionEnd = ownership.indexOf("## Execution guard", sectionStart);
    const inviteSection = ownership.slice(sectionStart, sectionEnd);
    const documentedIds = [...inviteSection.matchAll(/`([0-9a-f-]{36})`/g)].map(
      ([, id]) => id,
    );

    expect(invites).toHaveLength(6);
    expect(documentedIds).toEqual(invites.map((row) => row.identity.id));
    for (const invite of invites) {
      expect(inviteSection).toContain(`\`${invite.row_sha256}\``);
      expect(migration).toContain(
        `('invites', '{"id":"${invite.identity.id}"}'::jsonb`,
      );
      expect(migration).toContain(`'${invite.row_sha256}'`);
    }
    expect(inviteSection).toContain(
      "Every other existing or future invite is retained.",
    );
    expect(inviteSection).toContain("only an exact ID above");
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
    expect(migration).toContain(
      "unnest(constraint_row.conkey, constraint_row.confkey)",
    );
    expect(migration).toContain("unknown foreign key");
    expect(migration).toContain("column-set drift");
    expect(migration).toContain("cross-schema foreign key");
    expect(migration).toContain(
      "migration 020 artwork provenance prerequisite is missing",
    );
    expect(migration).not.toContain("and child_schema.nspname = 'public'");
  });

  it("preserves accounts and audit history and exposes no broad execution grant", () => {
    const functionTail = migration.slice(
      migration.indexOf("create or replace function public.admin_cleanup"),
    );
    expect(functionTail).not.toMatch(
      /delete from (?:auth\.users|public\.profiles|public\.audit_log)/i,
    );
    expect(
      migration.match(/fixture_cleanup_assert_retained_v1\(\)/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(migration).toContain(
      "revoke all on function public.admin_cleanup_fixture_catalog_v1(text, text) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_cleanup_fixture_catalog_v1(text, text) to service_role;",
    );
  });

  it("moves the checksum-only RPC private and gates the public mutation with signed evidence", () => {
    expect(controllerGate).toContain(
      "alter function public.admin_cleanup_fixture_catalog_v1(text, text)\n  set schema private;",
    );
    expect(controllerGate).toContain(
      "private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text, text)",
    );
    expect(controllerGate).toContain(
      "fixture_cleanup_assert_controller_evidence_v1",
    );
    expect(controllerGate).toContain("extensions.hmac");
    expect(controllerGate).toContain("fixture_cleanup_execution_receipts_v1");
    expect(controllerGate).toContain("fixture_cleanup_canonical_evidence_v1");
    expect(controllerGate).toContain("fixture_cleanup_transport_probe_v1");
    expect(controllerGate).toContain("pg_advisory_xact_lock");
    expect(controllerGate).toContain(
      "controller execution evidence was already consumed",
    );
    expect(controllerGate).toContain("p_approval ->> 'execution_id'");
    expect(controllerGate).toContain("p_rollback ->> 'execution_id'");
    expect(controllerGate).toContain("fixture-cleanup-approval-v1:");
    expect(controllerGate).toContain("fixture-cleanup-rollback-v1:");
    expect(controllerGate).toContain(
      "ead06284652a54a583f42e59213845a816f37251f154c8d2d93f0f1258512471",
    );
    expect(controllerGate).toContain(
      "1f20fcb5390b85bd1ba3d45166e204bdc947e0ef3ea3f3214a16a1c6aef08b30",
    );
    expect(controllerGate).toContain(
      "fixture_cleanup_legacy_contract_attestation_v1",
    );
    expect(controllerGate).toContain(
      "fixture_cleanup_controller_contract_attestation_v1",
    );
    expect(controllerGate).toContain("controller_contract_safe");
    expect(controllerGate).toContain("controller_contracts");
    expect(controllerGate).toContain("controller_wrapper");
    expect(controllerGate).toContain("controller_evidence");
    expect(controllerGate).toContain("transport_probe");
    expect(controllerGate).toContain("pg_get_functiondef(proc.oid)");
    expect(controllerGate).toContain("owner_exact");
    expect(controllerGate).toContain("v_postgres_major in (15, 16)");
    expect(controllerGate).toContain('"privilege":"MAINTAIN"');
    expect(controllerGate).toContain(
      '{"role":"service_role","superuser":false,"inherit":true',
    );
    expect(controllerGate).toContain(
      "20230529180330_alter_api_roles_for_inherit.sql",
    );
    expect(controllerGate).toContain(
      "'inherit_option', membership.inherit_option",
    );
    expect(controllerGate).toContain("'set_option', membership.set_option");
    expect(controllerGate).toContain("security_definer");
    expect(controllerGate).toContain("search_path");
    expect(controllerGate).toContain("execute_acl");
    expect(controllerGate).toContain("destructive result contract mismatch");
    expect(controllerGate).toContain('order by key collate "C"');
    expect(controllerGate).toContain(
      "outcome in ('deleted', 'already_deleted')",
    );
    expect(controllerGate).toContain(
      "fixture_cleanup_one_active_controller_key_v1",
    );
    expect(controllerGate).toContain("v_approved_at < v_verified_at");
    expect(controllerGate).toContain("v_approved_at < v_rehearsed_at");
    expect(controllerGate).toContain(
      "grant execute on function public.admin_cleanup_fixture_catalog_v1(\n  text, text, jsonb, jsonb\n) to service_role;",
    );
    expect(controllerGate).toContain(
      "revoke all on table private.fixture_cleanup_controller_keys_v1\n  from public, anon, authenticated, service_role;",
    );
    expect(controllerGate).not.toMatch(
      /insert\s+into\s+private\.fixture_cleanup_controller_keys_v1/i,
    );
  });

  it("ships secret-safe controller operations without restoring the old RPC", () => {
    const provisioning = readFileSync(
      resolve(root, "scripts/fixture-boundary/provision-controller-key.sql"),
      "utf8",
    );
    const retirement = readFileSync(
      resolve(root, "scripts/fixture-boundary/retire-controller-key.sql"),
      "utf8",
    );
    const disable = readFileSync(
      resolve(
        root,
        "scripts/fixture-boundary/disable-controller-gated-cleanup.sql",
      ),
      "utf8",
    );
    expect(provisioning).toContain("\\getenv cleanup_hmac_secret");
    expect(provisioning).toContain("\\unset cleanup_hmac_secret");
    expect(provisioning).toContain("received invalid key material");
    expect(provisioning).toContain("an active key already exists");
    expect(provisioning).not.toMatch(
      /test-controller-secret|local-harness-controller-secret/,
    );
    expect(retirement).toContain("is_active = false");
    expect(disable).toContain(
      "drop function public.admin_cleanup_fixture_catalog_v1",
    );
    expect(disable).not.toMatch(
      /grant\s+execute[\s\S]*without_controller_gate/i,
    );
    expect(disable).not.toMatch(/set\s+schema\s+public/i);
  });

  it("runs adversarial direct-call SQL coverage for the controller evidence gate", () => {
    expect(controllerGateSqlTest).toContain(
      "fixture_cleanup_isolated_superuser",
    );
    expect(controllerGateSqlTest).toContain(
      "old checksum-only cleanup RPC is still public",
    );
    expect(controllerGateSqlTest).toContain(
      "missing controller evidence was accepted",
    );
    expect(controllerGateSqlTest).toContain(
      "forged controller evidence was accepted",
    );
    expect(controllerGateSqlTest).toContain(
      "forged rollback evidence was accepted",
    );
    expect(controllerGateSqlTest).toContain(
      "stale controller evidence was accepted",
    );
    expect(controllerGateSqlTest).toContain(
      "valid controller evidence did not pass the gate",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "restored boundary identity replay was accepted",
    );
    expect(controllerGateSqlTest).toContain(
      "opaque transport probe did not report the reviewed service contract",
    );
    expect(controllerGateSqlTest).toContain(
      "controller wrapper definition drift was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "controller evidence ACL drift was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "transport probe definition drift was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "transitive definition drift was not detected",
    );
    expect(controllerGateSqlTest).toContain("table ACL drift was not detected");
    expect(controllerGateSqlTest).toContain(
      "managed role attribute drift was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "managed role membership drift was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "membership inherit-option drift was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "membership set-option drift was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "inherited protected table access was not detected",
    );
    expect(controllerGateSqlTest).toContain(
      "inherited private helper execution was not detected",
    );
    expect(controllerGateSqlTest).not.toContain("fixture.pr_harness_minimal");
    expect(controllerGateSqlTest).not.toContain(
      "valid controller evidence failed before the legacy safety boundary",
    );
    expect(
      readFileSync(
        resolve(root, ".github/workflows/db-migrate-test.yml"),
        "utf8",
      ),
    ).toContain(
      "supabase/tests/036_controller_verified_fixture_cleanup_gate_hosted.sql",
    );
    const manualWorkflow = readFileSync(
      resolve(root, ".github/workflows/db-migrate-test.yml"),
      "utf8",
    );
    expect(manualWorkflow).toContain("pull_request:");
    expect(manualWorkflow).toContain('- "package.json"');
    expect(manualWorkflow).toContain('- "package-lock.json"');
    expect(manualWorkflow).toContain('- "scripts/cleanup-fixture-catalog.ts"');
    expect(manualWorkflow).toContain(
      '- "scripts/sign-fixture-cleanup-evidence.ts"',
    );
    expect(manualWorkflow).toContain('- "src/lib/fixture-cleanup/**"');
    expect(manualWorkflow).toContain("run-controller-gate-pr-harness.mjs");
    expect(manualWorkflow).toContain('postgres: ["15", "16", "17"]');
    expect(manualWorkflow).toContain("image: postgres:${{ matrix.postgres }}");
    const prHarness = readFileSync(
      resolve(
        root,
        "scripts/fixture-boundary/run-controller-gate-pr-harness.mjs",
      ),
      "utf8",
    );
    expect(prHarness).toContain("controller-gate-pr-destructive-test.sql");
    expect(prHarness).toContain("033_import_qa_access_and_delete_guards.sql");
    expect(prHarness).toContain(
      "034_import_release_and_fixture_dependency_guards.sql",
    );
    expect(prHarness).toContain("for (const migration of migrations)");
    expect(prHarness).toContain("FIXTURE_GATE_EXTERNAL_PG");
    expect(prHarness).toContain('fixture_cleanup_isolated_superuser: "on"');
    expect(prHarness).toContain(
      'migration === "038_refresh_fixture_progress_fingerprints.sql"',
    );
    expect(prHarness).toContain(
      "fixture-owned progress with non-null asset_version was accepted",
    );
    expect(prHarness).toContain(
      "fixture progress boundary count changed from exactly 67",
    );
    expect(prHarness).toContain(
      "unrelated progress row changed during migration 038",
    );
    const prJob = manualWorkflow.slice(
      manualWorkflow.indexOf("validate-pr-migrations:"),
      manualWorkflow.indexOf("migrate-test:"),
    );
    expect(prJob).not.toContain("secrets.");
    expect(prJob).toContain("github.event_name == 'pull_request'");
    expect(controllerGateHostedSqlTest).toContain(
      "fixture_cleanup_hosted_nonmutating",
    );
    expect(controllerGateHostedSqlTest).toContain("set transaction read only");
    expect(controllerGateHostedSqlTest).not.toMatch(
      /\b(?:alter|create|drop)\s+role\b|\bgrant\s+\w+\s+to\s+(?:anon|authenticated|authenticator|service_role)\b/i,
    );
    expect(manualWorkflow).toContain(
      "--set fixture_cleanup_hosted_nonmutating=on --file supabase/tests/036_controller_verified_fixture_cleanup_gate_hosted.sql",
    );
    expect(manualWorkflow).toContain("run-test-project-transport-canary.ts");
    const cleanupRunbook = readFileSync(
      resolve(root, "docs/course-production/FIXTURE-CLEANUP-BOUNDARY.md"),
      "utf8",
    );
    expect(cleanupRunbook).toContain("npm run cleanup:fixtures:key:provision");
    expect(cleanupRunbook).toContain("npm run cleanup:fixtures:key:retire");
    expect(cleanupRunbook).toContain("npm run cleanup:fixtures:disable");
    expect(cleanupRunbook).not.toMatch(
      /psql[\s\S]{0,200}(provision-controller-key|retire-controller-key|disable-controller-gated-cleanup)\.sql/,
    );
    const canary = readFileSync(
      resolve(
        root,
        "scripts/fixture-boundary/run-test-project-transport-canary.ts",
      ),
      "utf8",
    );
    expect(canary).toContain("createFixtureCleanupSupabaseClient");
    expect(canary).toContain("fixture_cleanup_transport_probe_v1");
    expect(canary).toContain("must be a modern opaque sb_secret_ key");
    expect(canary).toContain("assertFixtureCleanupTransportContract");
    expect(canary).not.toContain("PROD_SUPABASE");
    const cleanupCli = readFileSync(
      resolve(root, "scripts/cleanup-fixture-catalog.ts"),
      "utf8",
    );
    expect(cleanupCli).toContain("assertFixtureCleanupTransport(client)");
    expect(cleanupCli).toContain("assertFixtureCleanupTransportContract");
    const controllerContract = readFileSync(
      resolve(root, "src/lib/fixture-cleanup/controller-contract.ts"),
      "utf8",
    );
    expect(controllerGate).toContain(
      '{"member":"supabase_storage_admin","role":"authenticator","admin_option":false,"inherit_option":false,"set_option":true}',
    );
    expect(controllerContract).toMatch(
      /member: "supabase_storage_admin",[\s\S]*?role: "authenticator",[\s\S]*?inherit_option: false,/,
    );
    expect(controllerContract).toContain(
      "0a4ff6b98a86427016faee21d6b8a821944015b944317e9942bda11dd23de05e",
    );
    for (const hash of [
      "1766ff88e3dfaf4b37f3629406c6be1bbed32274e0937e1a4ab7257d715aa612",
      "79a0862a703d7d0698a6b179157bf4fef0fda58e52471e6efd77f66605eeceab",
      "6db0a612dc15cb21e0fd39317d87e4e103d0953f2ab5e8d759da39431fa5ad8d",
      "4e37b8d49d9c60097a2659c4c7fd2c8b162ef8f9a4f0b226431d2d08f61778ef",
      "9631a9eb83cb21f3c84faddc02c5cd08a33db51be410228590e02df99b4c6380",
      "f5574da2efc5aaaa9c9e063d380aed273a7e14be0d6de78ad46bffd178a5d141",
      "6a286ad85ab3b904675a0c1a86306bf3c389a30323d09c4f48dca06ef926181b",
    ]) {
      expect(controllerContract).toContain(hash);
      expect(controllerGate).toContain(hash);
    }
    expect(controllerGate).toContain(
      "c2830bd8f872ae71a94325295e35d7c6283df405f9d65feaff7192dc578203ad",
    );
    expect(controllerGate).toContain(
      "1f20fcb5390b85bd1ba3d45166e204bdc947e0ef3ea3f3214a16a1c6aef08b30",
    );
    expect(controllerContract).toContain(
      "e63f6f40802a11ddf0b855dd61b6a8844ab5259942f777c037d099bd7ef8f93e",
    );
    expect(controllerContract).toContain(
      "0a4ff6b98a86427016faee21d6b8a821944015b944317e9942bda11dd23de05e",
    );
    const localAdversarialTest = readFileSync(
      resolve(root, "scripts/fixture-boundary/atomic-cleanup-local-test.sql"),
      "utf8",
    );
    expect(localAdversarialTest).toContain(
      "absent-first authorization was not consumed",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "deterministic first cleanup did not return deleted with exact counts",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "same-transaction receipt was not exact",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "deterministic retry was not exactly already_deleted",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "restored boundary identity replay was accepted",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "malformed destructive result did not roll back",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "missing numeric result key did not roll back",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "extra numeric result key did not roll back",
    );
    expect(controllerGatePrDestructiveTest).toContain(
      "registered or later unregistered account/audit identity changed",
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
    expect(
      readFileSync(
        resolve(root, "scripts/fixture-boundary/build-atomic-migration.mjs"),
        "utf8",
      ),
    ).toMatch(/language plpgsql\s+stable\s+strict/);
  });
});
