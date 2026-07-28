// Test-only fixture (spawned as a REAL subprocess by
// released-content-block-revision-v2-controller.test.ts's CLI exit-code
// test) -- not part of any npm script or the shipped CLI. It reproduces the
// exact tail the real CLI script (revise-released-content-blocks-v2.ts)
// runs: call the controller, then set process.exitCode from its status via
// the shared helper. Dependencies are fakes (no real Supabase network
// calls), driven entirely by the CLI_FIXTURE_STATUS env var, so this proves
// the real runtime wiring -- controller status -> exit-code helper ->
// process.exitCode -> actual OS exit status -- without needing a live
// database.
import {
  releasedContentBlockRevisionV2Confirmation,
  releasedContentBlockRevisionV2DatabasePayloadSha256,
} from "../../../src/lib/course-import/released-content-block-revision-v2";
import {
  releasedContentBlockRevisionV2ExitCode,
  runReleasedContentBlockRevisionV2Command,
  type ReleasedContentBlockRevisionV2Dependencies,
} from "../../../src/lib/course-import/released-content-block-revision-v2-controller";

async function main() {
  const requestedStatus = process.env.CLI_FIXTURE_STATUS ?? "revised";
  const importId = "cli-fixture-import";
  const manifestSha256 = "2".repeat(64);
  const priorManifestSha256 = "1".repeat(64);
  const priorCatalogSha256 = "3".repeat(64);
  const catalogSha256 = "4".repeat(64);
  const databasePayloadSha256 = releasedContentBlockRevisionV2DatabasePayloadSha256([]);
  const confirmation = releasedContentBlockRevisionV2Confirmation({
    importId,
    expectedPriorManifestSha256: priorManifestSha256,
    manifestSha256,
    expectedPriorCatalogSha256: priorCatalogSha256,
    databasePayloadSha256,
    mutationCount: 0,
  });

  let catalogCalls = 0;
  const dependencies: ReleasedContentBlockRevisionV2Dependencies<{ name: "fixture" }> = {
    classifyEnvironment: () => "test",
    createClient: () => ({ name: "fixture" as const }),
    loadActiveRevision: async () => ({
      import_id: importId,
      active_revision: 1,
      active_manifest_sha256: priorManifestSha256,
      active_catalog_sha256: priorCatalogSha256,
    }),
    // First call is the preflight (before the RPC); any later call is the
    // postflight check, which must observe the RPC's own resulting catalog.
    loadCatalogSha256: async () => {
      catalogCalls += 1;
      return catalogCalls === 1 ? priorCatalogSha256 : catalogSha256;
    },
    loadMutationRows: async () => [],
    loadAudit: async () => ({
      import_id: importId,
      revision: 2,
      prior_manifest_sha256: priorManifestSha256,
      manifest_sha256: manifestSha256,
      prior_catalog_sha256: priorCatalogSha256,
      catalog_sha256: catalogSha256,
      database_payload_sha256: databasePayloadSha256,
      client_payload_sha256: "6".repeat(64),
      mutation_count: 0,
      update_count: 0,
      insert_count: 0,
      evidence: {
        operation: "released_content_blocks_v2",
        manifest_sha256: manifestSha256,
        expected_prior_catalog_sha256: priorCatalogSha256,
      },
    }),
    callRevision: async () => ({
      data: {
        status: "revised",
        import_id: importId,
        revision: 2,
        mutation_count: 0,
        update_count: 0,
        insert_count: 0,
        catalog_sha256: catalogSha256,
      },
      error: null,
    }),
    classifyRevisionLineage: async () => (requestedStatus === "rolled_back" ? "reverted" : "active_head"),
    log: () => {},
  };

  const result = await runReleasedContentBlockRevisionV2Command(
    {
      options: { execute: true, allowProduction: false, confirmation },
      importId,
      expectedPriorManifestSha256: priorManifestSha256,
      manifestSha256,
      mutations: [],
      clientPayloadSha256: "6".repeat(64),
      environment: { url: "http://fixture.test", serviceRoleKey: "fixture-key" },
      plan: { phase: "cli_fixture_plan" },
    },
    dependencies,
  );

  // The exact real CLI script's tail.
  process.exitCode = releasedContentBlockRevisionV2ExitCode(result.status);
}

void main();
