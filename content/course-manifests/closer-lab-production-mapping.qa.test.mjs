import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CLOSER_LAB_CATALOG_RAW_SHA256,
  CLOSER_LAB_CATALOG_SOURCE_COMMIT,
  CLOSER_LAB_PRODUCTION_PROJECT_REF,
  buildCloserServiceHeaders,
  buildScenarioReconciliationEvidence,
  clientStableJsonSha256,
  fetchCloserProductionGraph,
  finalizeScenarioProductionMapping,
  postgresJsonbSha256,
  sha256,
  validateCloserCatalogProvenance,
  validateProductionGraphAttestation,
  rolePlayBindings,
  validateScenarioMappingLedgerShape,
  validateScenarioProductionTrust,
  validateScenarioReconciliationEvidencePins,
} from "../../scripts/course-content/closer-lab-production-mapping.mjs";
import { assertDistinctFinalizationPaths } from "../../scripts/course-content/finalize-closer-lab-production-mapping.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const LEDGER_URL = new URL("../../docs/course-production/closer-lab-production-mapping.json", import.meta.url);
const CATALOG_URL = new URL("../../docs/course-production/closer-lab-production-catalog.json", import.meta.url);
const CATALOG_PROVENANCE_URL = new URL("../../docs/course-production/closer-lab-production-catalog.provenance.json", import.meta.url);
const CANONICAL_URL = `https://${CLOSER_LAB_PRODUCTION_PROJECT_REF}.supabase.co`;
const RPC_URL = `${CANONICAL_URL}/rest/v1/rpc/export_bmh_institute_production_graph`;
const APPROVED_VOICE_ID = "elevenlabs-approved-production-voice";
const OPAQUE_SERVICE_KEY = `sb_secret_${"A".repeat(32)}`;

function legacyServiceJwt(ref = CLOSER_LAB_PRODUCTION_PROJECT_REF) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ role: "service_role", ref })).toString("base64url"),
    "signature",
  ].join(".");
}

function attachDeferredRolePlayFixture(manifest, catalog) {
  for (const course of manifest.program.courses) {
    for (const courseModule of course.modules) {
      for (const lesson of courseModule.lessons) {
        if (!lesson.blocks) continue;
        lesson.blocks = lesson.blocks.filter((block) => block.type !== "role_play");
      }
    }
  }
  for (const [index, scenario] of catalog.rolePlays.entries()) {
    const section = Number.parseInt(scenario.assignmentSourceKey.match(/section-(\d+)$/)?.[1] ?? "", 10);
    const courseModule = manifest.program.courses[0].modules.find((candidate) =>
      candidate.source_key === `module-section-${section}`
    );
    const lesson = courseModule?.lessons.find((candidate) => candidate.type === "content");
    assert.ok(lesson, `${scenario.sourceKey} has a deferred fixture lesson`);
    lesson.blocks.push({
      source_key: scenario.sourceKey,
      type: "role_play",
      sort_order: 900 + index,
      required: true,
      content: {
        scenario_id: scenario.pendingScenarioId,
        title: scenario.title,
        height_px: 760,
        scenario_spec: {
          assignment_source_key: scenario.assignmentSourceKey,
          context: scenario.manifestSpec.context,
          learner_goal: scenario.manifestSpec.learnerGoal,
          success_criteria: scenario.manifestSpec.successCriteria,
          fail_conditions: scenario.manifestSpec.failConditions,
        },
      },
    });
  }
  return manifest;
}

function pendingLedgerFixture(ledger) {
  const pending = structuredClone(ledger);
  pending.status = "pending";
  for (const record of pending.records) {
    record.production_scenario_id = null;
    record.scenario_sha256 = null;
  }
  return pending;
}

async function base() {
  const [manifestBytes, ledgerBytes, catalogBytes, provenanceBytes] = await Promise.all([
    readFile(MANIFEST_URL),
    readFile(LEDGER_URL),
    readFile(CATALOG_URL),
    readFile(CATALOG_PROVENANCE_URL),
  ]);
  const catalog = JSON.parse(catalogBytes);
  const manifest = attachDeferredRolePlayFixture(JSON.parse(manifestBytes), catalog);
  const ledger = pendingLedgerFixture(JSON.parse(ledgerBytes));
  return {
    manifestBytes: Buffer.from(JSON.stringify(manifest)),
    ledgerBytes: Buffer.from(JSON.stringify(ledger)),
    catalogBytes,
    manifest,
    ledger,
    catalog,
    provenance: JSON.parse(provenanceBytes),
  };
}

function attachProductionIds(manifest, ledger) {
  ledger.status = "finalized";
  const records = new Map(ledger.records.map((record) => [record.block_source_key, record]));
  let ordinal = 1;
  for (const course of manifest.program.courses) for (const courseModule of course.modules) for (const lesson of courseModule.lessons) for (const block of lesson.blocks ?? []) {
    if (block.type !== "role_play") continue;
    const id = `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
    records.get(block.source_key).production_scenario_id = id;
    block.content.scenario_id = id;
    ordinal += 1;
  }
}

function productionAttestation(ledger, catalog) {
  const scenarios = new Map(catalog.rolePlays.map((scenario) => [scenario.sourceKey, scenario]));
  const rolePlays = ledger.records.map((record) => ({
    source_key: record.block_source_key,
    scenario_id: record.production_scenario_id,
    active: true,
    assignment_source_key: record.assignment_source_key,
    managed_source_key: `bmh-institute-v1:role-play:${record.scenario_source_key}`,
  })).sort((left, right) => left.source_key.localeCompare(right.source_key));
  const graph = rolePlays.map((record, rolePlayIndex) => {
    const scenario = scenarios.get(record.source_key);
    return {
      role_play_id: record.scenario_id,
      role_play_key: record.managed_source_key,
      role_play_active: true,
      persona_id: `10000000-0000-4000-8000-${String(rolePlayIndex + 1).padStart(12, "0")}`,
      persona_key: `bmh-institute-v1:persona:${scenario.persona.key}`,
      persona_active: true,
      voice_id: APPROVED_VOICE_ID,
      goals: scenario.goals.map((entry, goalIndex) => ({
        goal_id: `20000000-0000-4000-8000-${String(rolePlayIndex * 4 + goalIndex + 1).padStart(12, "0")}`,
        goal_key: `bmh-institute-v1:goal:${entry.goal.key}`,
        goal_active: true,
        weight: entry.weight,
        sort_order: goalIndex,
      })),
    };
  });
  const checksumBinding = {
    attestation_version: 1,
    project_ref: CLOSER_LAB_PRODUCTION_PROJECT_REF,
    approved_voice_id: APPROVED_VOICE_ID,
    catalog_sha256: postgresJsonbSha256(catalog),
    catalog_binding: catalog,
    counts: { role_plays: 6, personas: 6, goals: 24, role_play_goal_links: 24 },
    role_plays: rolePlays,
    graph,
  };
  return {
    ...checksumBinding,
    checksum_algorithm: "sha256-jsonb-text-v1",
    graph_checksum_sha256: postgresJsonbSha256(checksumBinding),
    checksum_binding: structuredClone(checksumBinding),
  };
}

function finalize(manifest, ledger, catalog) {
  attachProductionIds(manifest, ledger);
  const attestation = productionAttestation(ledger, catalog);
  const clientGraphSha256 = clientStableJsonSha256(attestation.checksum_binding);
  for (const record of ledger.records) record.scenario_sha256 = clientGraphSha256;
  return attestation;
}

function resignAttestation(attestation) {
  attestation.checksum_binding = {
    attestation_version: attestation.attestation_version,
    project_ref: attestation.project_ref,
    approved_voice_id: attestation.approved_voice_id,
    catalog_sha256: attestation.catalog_sha256,
    catalog_binding: structuredClone(attestation.catalog_binding),
    counts: structuredClone(attestation.counts),
    role_plays: structuredClone(attestation.role_plays),
    graph: structuredClone(attestation.graph),
  };
  attestation.graph_checksum_sha256 = postgresJsonbSha256(attestation.checksum_binding);
  return attestation;
}

function mockResponse(payload, url = RPC_URL, status = 200) {
  const body = Buffer.from(JSON.stringify(payload));
  return {
    url,
    ok: status >= 200 && status < 300,
    status,
    async arrayBuffer() { return body; },
  };
}

test("deferred mapping scaffold covers the exact six authored scenario and assignment keys", async () => {
  const { manifest, ledger } = await base();
  assert.deepEqual(validateScenarioMappingLedgerShape(manifest, ledger), []);
});

test("production attestation finalizes the manifest and ledger without hand-copied UUIDs", async () => {
  const { manifest, ledger, catalog } = await base();
  const expectedManifest = structuredClone(manifest);
  const expectedLedger = structuredClone(ledger);
  attachProductionIds(expectedManifest, expectedLedger);
  const attestation = productionAttestation(expectedLedger, catalog);

  const result = finalizeScenarioProductionMapping({ manifest, ledger, catalog, closerExport: attestation, approvedVoiceId: APPROVED_VOICE_ID });

  assert.equal(ledger.status, "pending");
  assert.equal(result.ledger.status, "finalized");
  assert.deepEqual(validateScenarioMappingLedgerShape(result.manifest, result.ledger), []);
  assert.deepEqual(
    result.ledger.records.map((record) => record.production_scenario_id),
    expectedLedger.records.map((record) => record.production_scenario_id),
  );
  assert.ok(result.ledger.records.every((record) =>
    record.scenario_sha256 === clientStableJsonSha256(attestation.checksum_binding),
  ));

  const repairedAfterManifestOnly = finalizeScenarioProductionMapping({
    manifest: result.manifest,
    ledger,
    catalog,
    closerExport: attestation,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  const repairedAfterLedgerOnly = finalizeScenarioProductionMapping({
    manifest,
    ledger: result.ledger,
    catalog,
    closerExport: attestation,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  assert.deepEqual(repairedAfterManifestOnly.manifest, result.manifest);
  assert.deepEqual(repairedAfterManifestOnly.ledger, result.ledger);
  assert.deepEqual(repairedAfterLedgerOnly.manifest, result.manifest);
  assert.deepEqual(repairedAfterLedgerOnly.ledger, result.ledger);
});

test("finalization refuses to replace an existing production binding", async () => {
  const { manifest, ledger, catalog } = await base();
  const expectedManifest = structuredClone(manifest);
  const expectedLedger = structuredClone(ledger);
  attachProductionIds(expectedManifest, expectedLedger);
  const attestation = productionAttestation(expectedLedger, catalog);
  const finalized = finalizeScenarioProductionMapping({ manifest, ledger, catalog, closerExport: attestation, approvedVoiceId: APPROVED_VOICE_ID });

  const changedLedger = structuredClone(finalized.ledger);
  changedLedger.records[0].production_scenario_id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  assert.throws(() => finalizeScenarioProductionMapping({
    manifest: finalized.manifest,
    ledger: changedLedger,
    catalog,
    closerExport: attestation,
    approvedVoiceId: APPROVED_VOICE_ID,
  }), /binding changed after finalization/);

  const changedManifest = structuredClone(finalized.manifest);
  const changedBlock = changedManifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .find((block) => block.type === "role_play");
  changedBlock.content.scenario_id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  assert.throws(() => finalizeScenarioProductionMapping({
    manifest: changedManifest,
    ledger: finalized.ledger,
    catalog,
    closerExport: attestation,
    approvedVoiceId: APPROVED_VOICE_ID,
  }), /manifest UUID changed after production binding/);
});

test("finalization rejects aliased input and output paths before any live request", async () => {
  await assert.rejects(
    assertDistinctFinalizationPaths([
      new URL("./bmh-employee-training.v1.json", import.meta.url).pathname,
      new URL("./bmh-employee-training.v1.json", import.meta.url).pathname,
    ]),
    /must all be distinct/,
  );
});

test("the authenticated RPC catalog is byte-bound to the exact reviewed Closer commit", async () => {
  const { catalogBytes, catalog, provenance } = await base();
  assert.equal(CLOSER_LAB_CATALOG_SOURCE_COMMIT, "6343fe4c2b72524457b758e23d77b944fcb7ead4");
  assert.equal(provenance.source_commit, CLOSER_LAB_CATALOG_SOURCE_COMMIT);
  assert.equal(provenance.catalog_sha256, CLOSER_LAB_CATALOG_RAW_SHA256);
  assert.equal(sha256(catalogBytes), CLOSER_LAB_CATALOG_RAW_SHA256);
  assert.equal(provenance.production_project_ref, CLOSER_LAB_PRODUCTION_PROJECT_REF);
  assert.equal(catalog.namespace, "BMH Institute v1");
  assert.equal(catalog.rolePlays.length, 6);
  assert.equal(catalog.rolePlays.flatMap((scenario) => scenario.goals).length, 24);
  assert.equal(validateCloserCatalogProvenance({ catalogBytes, provenance }), provenance);
});

// This is the hermetic check that gates every PR's required CI job (no
// network, no credentials) -- it runs against the REAL checked-in files
// (never the media-dependent fixtures above), so unlike the builder-parity
// tests in bmh-artwork-ledger-integration.qa.test.mjs and
// bmh-exhaustive-quiz-release.qa.test.mjs (which skip on any runner missing
// Jarrad's local canonical video files, including every Linux CI runner),
// this one can never silently skip.
async function loadRealTrustQuartet() {
  const [manifestBytes, ledgerBytes, catalogBytes] = await Promise.all([
    readFile(MANIFEST_URL),
    readFile(LEDGER_URL),
    readFile(CATALOG_URL),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  const reconciliation = JSON.parse(
    await readFile(
      new URL("../../docs/course-production/closer-lab-production-mapping-reconciliation.json", import.meta.url),
      "utf8",
    ),
  );
  const attestation = JSON.parse(
    await readFile(
      new URL("../../docs/course-production/closer-lab-production-attestation.json", import.meta.url),
      "utf8",
    ),
  );
  return { manifest, manifestBytes, ledger, ledgerBytes, catalogBytes, reconciliation, attestation };
}

test("the real tracked manifest, ledger, reconciliation, and attestation are exactly cross-bound (runs on every CI runner, no local media required)", async () => {
  const { manifest, manifestBytes, ledger, ledgerBytes, catalogBytes, reconciliation, attestation } =
    await loadRealTrustQuartet();

  assert.deepEqual(
    validateScenarioReconciliationEvidencePins({
      manifest,
      manifestBytes,
      ledger,
      ledgerBytes,
      reconciliation,
      catalogBytes,
      attestation,
    }),
    [],
  );

  const firstBlockSourceKey = rolePlayBindings(manifest)[0].block_source_key;

  // Coordinated tamper #1: manifest, reconciliation, AND attestation all
  // agree on a fabricated UUID for one scenario; only the finalized ledger
  // still has the real one. Isolates that the ledger cross-check alone
  // catches this -- the manifest_sha256/reconciliation pins and the
  // attestation cross-check are all deliberately made to agree with the
  // fabrication, so only the ledger comparison can be what blocks it.
  {
    const fakeId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const tamperedManifest = structuredClone(manifest);
    const tamperedBlock = tamperedManifest.program.courses
      .flatMap((course) => course.modules)
      .flatMap((courseModule) => courseModule.lessons)
      .flatMap((lesson) => lesson.blocks ?? [])
      .find((block) => block.source_key === firstBlockSourceKey);
    tamperedBlock.content.scenario_id = fakeId;
    const tamperedManifestBytes = Buffer.from(JSON.stringify(tamperedManifest));

    const tamperedReconciliation = structuredClone(reconciliation);
    tamperedReconciliation.manifest_sha256 = sha256(tamperedManifestBytes);
    tamperedReconciliation.bindings.find((record) => record.block_source_key === firstBlockSourceKey)
      .production_scenario_id = fakeId;

    const tamperedAttestation = structuredClone(attestation);
    tamperedAttestation.role_plays.find((record) => record.source_key === firstBlockSourceKey).scenario_id = fakeId;

    assert.ok(
      validateScenarioReconciliationEvidencePins({
        manifest: tamperedManifest,
        manifestBytes: tamperedManifestBytes,
        ledger,
        ledgerBytes,
        reconciliation: tamperedReconciliation,
        catalogBytes,
        attestation: tamperedAttestation,
      }).length > 0,
      "manifest+reconciliation+attestation agreeing on a fabricated UUID must still be blocked by the unchanged ledger",
    );
  }

  // Coordinated tamper #2: manifest, reconciliation, AND ledger all agree on
  // a fabricated UUID; only the production attestation still has the real
  // one. Isolates that the attestation cross-check alone catches this.
  {
    const fakeId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const tamperedManifest = structuredClone(manifest);
    const tamperedBlock = tamperedManifest.program.courses
      .flatMap((course) => course.modules)
      .flatMap((courseModule) => courseModule.lessons)
      .flatMap((lesson) => lesson.blocks ?? [])
      .find((block) => block.source_key === firstBlockSourceKey);
    tamperedBlock.content.scenario_id = fakeId;
    const tamperedManifestBytes = Buffer.from(JSON.stringify(tamperedManifest));

    const tamperedLedger = structuredClone(ledger);
    tamperedLedger.records.find((record) => record.block_source_key === firstBlockSourceKey)
      .production_scenario_id = fakeId;
    const tamperedLedgerBytes = Buffer.from(JSON.stringify(tamperedLedger));

    const tamperedReconciliation = structuredClone(reconciliation);
    tamperedReconciliation.manifest_sha256 = sha256(tamperedManifestBytes);
    tamperedReconciliation.mapping_ledger_sha256 = sha256(tamperedLedgerBytes);
    tamperedReconciliation.bindings.find((record) => record.block_source_key === firstBlockSourceKey)
      .production_scenario_id = fakeId;

    assert.ok(
      validateScenarioReconciliationEvidencePins({
        manifest: tamperedManifest,
        manifestBytes: tamperedManifestBytes,
        ledger: tamperedLedger,
        ledgerBytes: tamperedLedgerBytes,
        reconciliation: tamperedReconciliation,
        catalogBytes,
        attestation,
      }).length > 0,
      "manifest+reconciliation+ledger agreeing on a fabricated UUID must still be blocked by the unchanged attestation",
    );
  }
});

test("attestation top-level fields cannot diverge from their own hashed checksum_binding copies", async () => {
  const { manifest, manifestBytes, ledger, ledgerBytes, catalogBytes, reconciliation, attestation } =
    await loadRealTrustQuartet();
  const firstBlockSourceKey = rolePlayBindings(manifest)[0].block_source_key;
  const fakeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  // Codex's exact demonstrated bypass: mutate the UUID across manifest,
  // ledger, reconciliation, AND the top-level attestation.role_plays array,
  // but leave attestation.checksum_binding.role_plays (the copy that's
  // actually hashed into client_graph_binding_sha256) untouched. Every prior
  // hash-pin check would have passed; only comparing the top-level array
  // against its own checksum_binding copy catches it.
  const tamperedManifest = structuredClone(manifest);
  tamperedManifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .find((block) => block.source_key === firstBlockSourceKey)
    .content.scenario_id = fakeId;
  const tamperedManifestBytes = Buffer.from(JSON.stringify(tamperedManifest));

  const tamperedLedger = structuredClone(ledger);
  tamperedLedger.records.find((record) => record.block_source_key === firstBlockSourceKey)
    .production_scenario_id = fakeId;
  const tamperedLedgerBytes = Buffer.from(JSON.stringify(tamperedLedger));

  const tamperedReconciliation = structuredClone(reconciliation);
  tamperedReconciliation.manifest_sha256 = sha256(tamperedManifestBytes);
  tamperedReconciliation.mapping_ledger_sha256 = sha256(tamperedLedgerBytes);
  tamperedReconciliation.bindings.find((record) => record.block_source_key === firstBlockSourceKey)
    .production_scenario_id = fakeId;

  const tamperedAttestation = structuredClone(attestation);
  tamperedAttestation.role_plays.find((record) => record.source_key === firstBlockSourceKey).scenario_id = fakeId;
  // checksum_binding.role_plays is deliberately left unchanged -- so its hash
  // still ties to tamperedReconciliation.client_graph_binding_sha256 (which
  // we don't even need to touch, since checksum_binding itself is untouched).

  assert.ok(
    validateScenarioReconciliationEvidencePins({
      manifest: tamperedManifest,
      manifestBytes: tamperedManifestBytes,
      ledger: tamperedLedger,
      ledgerBytes: tamperedLedgerBytes,
      reconciliation: tamperedReconciliation,
      catalogBytes,
      attestation: tamperedAttestation,
    }).length > 0,
    "a top-level attestation.role_plays mutation left out of checksum_binding must still be blocked",
  );

  // Mutating graph (voice/goal) data the same way -- independent of
  // role_plays -- must also be caught.
  const graphTamperedAttestation = structuredClone(attestation);
  graphTamperedAttestation.graph[0].voice_id = "some-other-voice-id";
  assert.ok(
    validateScenarioReconciliationEvidencePins({
      manifest,
      manifestBytes,
      ledger,
      ledgerBytes,
      reconciliation,
      catalogBytes,
      attestation: graphTamperedAttestation,
    }).length > 0,
    "a top-level attestation.graph mutation left out of checksum_binding must still be blocked",
  );
});

test("an arbitrary but internally-consistent scenario checksum cannot substitute for the real graph-binding hash", async () => {
  const { manifest, manifestBytes, ledger, ledgerBytes, catalogBytes, reconciliation, attestation } =
    await loadRealTrustQuartet();
  const arbitraryDigest = "a".repeat(64);

  // All six ledger and reconciliation scenario_sha256 values replaced with
  // the same arbitrary (but well-formed) digest -- internally consistent
  // with each other, but not the real clientStableJsonSha256(checksum_binding).
  const tamperedLedger = structuredClone(ledger);
  for (const record of tamperedLedger.records) record.scenario_sha256 = arbitraryDigest;
  const tamperedLedgerBytes = Buffer.from(JSON.stringify(tamperedLedger));

  const tamperedReconciliation = structuredClone(reconciliation);
  tamperedReconciliation.mapping_ledger_sha256 = sha256(tamperedLedgerBytes);
  for (const record of tamperedReconciliation.bindings) record.scenario_sha256 = arbitraryDigest;

  assert.ok(
    validateScenarioReconciliationEvidencePins({
      manifest,
      manifestBytes,
      ledger: tamperedLedger,
      ledgerBytes: tamperedLedgerBytes,
      reconciliation: tamperedReconciliation,
      catalogBytes,
      attestation,
    }).length > 0,
    "an arbitrary uniform scenario_sha256 across ledger and reconciliation must still be blocked",
  );
});

test("arbitrary non-pending scenario strings cannot clear production trust", async () => {
  const { manifest, ledger, manifestBytes, ledgerBytes, catalogBytes } = await base();
  for (const course of manifest.program.courses) for (const courseModule of course.modules) for (const lesson of courseModule.lessons) for (const block of lesson.blocks ?? []) {
    if (block.type === "role_play") block.content.scenario_id = "definitely-not-production";
  }
  const report = await validateScenarioProductionTrust({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    catalogBytes,
    evidence: null,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  assert.ok(report.blockers.some((blocker) => blocker.includes("not finalized")));
});

test("live attestation uses only the canonical final RPC response and exact service credential request", async () => {
  const { manifest, ledger, catalogBytes, catalog, provenance } = await base();
  const attestation = finalize(manifest, ledger, catalog);
  let request;
  const result = await fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: provenance,
    url: CANONICAL_URL,
    serviceRoleKey: OPAQUE_SERVICE_KEY,
    approvedVoiceId: APPROVED_VOICE_ID,
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return mockResponse(attestation);
    },
  });
  assert.deepEqual(JSON.parse(result), attestation);
  assert.equal(request.url, RPC_URL);
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers.apikey, OPAQUE_SERVICE_KEY);
  assert.equal("Authorization" in request.init.headers, false);
  assert.deepEqual(JSON.parse(request.init.body), {
    p_catalog: catalog,
    p_approved_voice_id: APPROVED_VOICE_ID,
  });

  await assert.rejects(fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: provenance,
    url: CANONICAL_URL,
    serviceRoleKey: OPAQUE_SERVICE_KEY,
    approvedVoiceId: APPROVED_VOICE_ID,
    fetchImpl: async () => mockResponse(attestation, `${CANONICAL_URL}/rest/v1/forged`),
  }), /did not originate from the exact canonical RPC/);

  await assert.rejects(fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: provenance,
    url: "https://wrong-project.supabase.co",
    serviceRoleKey: OPAQUE_SERVICE_KEY,
    approvedVoiceId: APPROVED_VOICE_ID,
    fetchImpl: async () => mockResponse(attestation),
  }), /outside the canonical production project boundary/);
});

test("service headers never send an opaque Supabase secret as bearer authentication", () => {
  assert.deepEqual(buildCloserServiceHeaders(OPAQUE_SERVICE_KEY), {
    apikey: OPAQUE_SERVICE_KEY,
    "Content-Type": "application/json",
  });

  const legacy = legacyServiceJwt();
  assert.deepEqual(buildCloserServiceHeaders(legacy), {
    apikey: legacy,
    Authorization: `Bearer ${legacy}`,
    "Content-Type": "application/json",
  });
  assert.throws(
    () => buildCloserServiceHeaders(legacyServiceJwt("moocmsisaopnznppqvsq")),
    /not bound to the canonical production project/,
  );
  assert.throws(
    () => buildCloserServiceHeaders("not-a-service-key"),
    /not bound to the canonical production project/,
  );
});

test("fabricated catalogs and changed provenance cannot reach production attestation", async () => {
  const { catalogBytes, provenance } = await base();
  const fabricated = JSON.parse(catalogBytes);
  fabricated.rolePlays[0].title = "Fabricated role play";
  const fabricatedBytes = Buffer.from(JSON.stringify(fabricated));
  let calls = 0;
  await assert.rejects(fetchCloserProductionGraph({
    catalogBytes: fabricatedBytes,
    catalogProvenance: { ...provenance, catalog_sha256: sha256(fabricatedBytes) },
    url: CANONICAL_URL,
    serviceRoleKey: OPAQUE_SERVICE_KEY,
    approvedVoiceId: APPROVED_VOICE_ID,
    fetchImpl: async () => { calls += 1; return mockResponse({}); },
  }), /provenance is missing, stale, or not exact/);
  assert.equal(calls, 0);

  await assert.rejects(fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: { ...provenance, source_commit: "171b2228be70c19d1a707407d26f16de201793a0" },
    url: CANONICAL_URL,
    serviceRoleKey: OPAQUE_SERVICE_KEY,
    approvedVoiceId: APPROVED_VOICE_ID,
    fetchImpl: async () => { calls += 1; return mockResponse({}); },
  }), /provenance is missing, stale, or not exact/);
  assert.equal(calls, 0);
});

test("server checksum claims are independently recomputed by the consumer", async () => {
  const { manifest, ledger, catalog } = await base();
  const attestation = finalize(manifest, ledger, catalog);
  assert.equal(validateProductionGraphAttestation(attestation, catalog, APPROVED_VOICE_ID), attestation);

  const forgedCatalogHash = structuredClone(attestation);
  forgedCatalogHash.catalog_sha256 = "a".repeat(64);
  forgedCatalogHash.checksum_binding.catalog_sha256 = "a".repeat(64);
  forgedCatalogHash.graph_checksum_sha256 = postgresJsonbSha256(forgedCatalogHash.checksum_binding);
  assert.throws(
    () => validateProductionGraphAttestation(forgedCatalogHash, catalog, APPROVED_VOICE_ID),
    /invalid or incomplete exact-graph shape/,
  );

  const forgedGraphHash = structuredClone(attestation);
  forgedGraphHash.graph_checksum_sha256 = "b".repeat(64);
  assert.throws(
    () => validateProductionGraphAttestation(forgedGraphHash, catalog, APPROVED_VOICE_ID),
    /invalid or incomplete exact-graph shape/,
  );
});

test("voice and integral goal weights remain externally bound after a valid re-sign", async () => {
  const { manifest, ledger, catalog } = await base();
  const attestation = finalize(manifest, ledger, catalog);

  const voiceDrift = structuredClone(attestation);
  voiceDrift.approved_voice_id = "different-approved-voice";
  voiceDrift.graph[0].voice_id = "different-approved-voice";
  resignAttestation(voiceDrift);
  assert.throws(
    () => validateProductionGraphAttestation(voiceDrift, catalog, APPROVED_VOICE_ID),
    /invalid or incomplete exact-graph shape/,
  );

  const fractionalWeight = structuredClone(attestation);
  fractionalWeight.graph[0].goals[0].weight = 24.5;
  fractionalWeight.graph[0].goals[1].weight = 25.5;
  resignAttestation(fractionalWeight);
  assert.throws(
    () => validateProductionGraphAttestation(fractionalWeight, catalog, APPROVED_VOICE_ID),
    /invalid or incomplete exact-graph shape/,
  );

  const stringWeight = structuredClone(attestation);
  stringWeight.graph[0].goals[0].weight = "25";
  resignAttestation(stringWeight);
  assert.throws(
    () => validateProductionGraphAttestation(stringWeight, catalog, APPROVED_VOICE_ID),
    /invalid or incomplete exact-graph shape/,
  );
});

test("unrelated graph UUIDs or managed keys cannot attest a well-shaped export", async () => {
  const { manifest, ledger, catalog } = await base();
  const attestation = finalize(manifest, ledger, catalog);

  const wrongId = structuredClone(attestation);
  wrongId.graph[0].role_play_id = "90000000-0000-4000-8000-000000000001";
  resignAttestation(wrongId);
  assert.throws(
    () => validateProductionGraphAttestation(wrongId, catalog, APPROVED_VOICE_ID),
    /invalid or incomplete exact-graph shape/,
  );

  const wrongKey = structuredClone(attestation);
  wrongKey.graph[0].goals[0].goal_key = "bmh-institute-v1:goal:unrelated-but-well-shaped";
  resignAttestation(wrongKey);
  assert.throws(
    () => validateProductionGraphAttestation(wrongKey, catalog, APPROVED_VOICE_ID),
    /invalid or incomplete exact-graph shape/,
  );
});

test("reconciliation binds finalized mappings to client-recomputed exact production evidence", async () => {
  const { manifest, ledger, catalogBytes, catalog } = await base();
  const closerExport = finalize(manifest, ledger, catalog);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const ledgerBytes = Buffer.from(JSON.stringify(ledger));
  const liveAttestationBytes = Buffer.from(JSON.stringify(closerExport));
  const evidence = buildScenarioReconciliationEvidence({
    manifestBytes,
    ledgerBytes,
    catalogBytes,
    closerExportBytes: liveAttestationBytes,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  assert.equal(evidence.client_catalog_sha256, clientStableJsonSha256(catalog));
  assert.equal(evidence.client_graph_binding_sha256, clientStableJsonSha256(closerExport.checksum_binding));
  assert.ok(evidence.bindings.every((binding) => binding.scenario_sha256 === evidence.client_graph_binding_sha256));
  const report = await validateScenarioProductionTrust({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    catalogBytes,
    evidence,
    liveAttestationBytes,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  assert.deepEqual(report, { errors: [], blockers: [] });

  const localOnlyReport = await validateScenarioProductionTrust({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    catalogBytes,
    evidence,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  assert.ok(localOnlyReport.blockers.some((blocker) => blocker.includes("missing, stale, or not exact")));

  const forgedEvidence = structuredClone(evidence);
  forgedEvidence.bindings[0].scenario_sha256 = "f".repeat(64);
  const forgedReport = await validateScenarioProductionTrust({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    catalogBytes,
    evidence: forgedEvidence,
    liveAttestationBytes,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  assert.ok(forgedReport.blockers.some((blocker) => blocker.includes("missing, stale, or not exact")));

  const duplicateEvidence = structuredClone(evidence);
  duplicateEvidence.bindings[1] = structuredClone(duplicateEvidence.bindings[0]);
  const duplicateReport = await validateScenarioProductionTrust({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    catalogBytes,
    evidence: duplicateEvidence,
    liveAttestationBytes,
    approvedVoiceId: APPROVED_VOICE_ID,
  });
  assert.ok(duplicateReport.blockers.some((blocker) => blocker.includes("missing, stale, or not exact")));
});
