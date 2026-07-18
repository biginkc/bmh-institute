import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CLOSER_LAB_CATALOG_RAW_SHA256,
  CLOSER_LAB_CATALOG_SOURCE_COMMIT,
  CLOSER_LAB_PRODUCTION_PROJECT_REF,
  buildScenarioReconciliationEvidence,
  clientStableJsonSha256,
  fetchCloserProductionGraph,
  finalizeScenarioProductionMapping,
  postgresJsonbSha256,
  sha256,
  validateCloserCatalogProvenance,
  validateProductionGraphAttestation,
  validateScenarioMappingLedgerShape,
  validateScenarioProductionTrust,
} from "../../scripts/course-content/closer-lab-production-mapping.mjs";
import { assertDistinctFinalizationPaths } from "../../scripts/course-content/finalize-closer-lab-production-mapping.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const LEDGER_URL = new URL("../../docs/course-production/closer-lab-production-mapping.json", import.meta.url);
const CATALOG_URL = new URL("../../docs/course-production/closer-lab-production-catalog.json", import.meta.url);
const CATALOG_PROVENANCE_URL = new URL("../../docs/course-production/closer-lab-production-catalog.provenance.json", import.meta.url);
const CANONICAL_URL = `https://${CLOSER_LAB_PRODUCTION_PROJECT_REF}.supabase.co`;
const RPC_URL = `${CANONICAL_URL}/rest/v1/rpc/export_bmh_institute_production_graph`;

async function base() {
  const [manifestBytes, ledgerBytes, catalogBytes, provenanceBytes] = await Promise.all([
    readFile(MANIFEST_URL),
    readFile(LEDGER_URL),
    readFile(CATALOG_URL),
    readFile(CATALOG_PROVENANCE_URL),
  ]);
  return {
    manifestBytes,
    ledgerBytes,
    catalogBytes,
    manifest: JSON.parse(manifestBytes),
    ledger: JSON.parse(ledgerBytes),
    catalog: JSON.parse(catalogBytes),
    provenance: JSON.parse(provenanceBytes),
  };
}

function attachProductionIds(manifest, ledger) {
  ledger.status = "finalized";
  const records = new Map(ledger.records.map((record) => [record.block_source_key, record]));
  let ordinal = 1;
  for (const course of manifest.program.courses) for (const module of course.modules) for (const lesson of module.lessons) for (const block of lesson.blocks ?? []) {
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

test("pending mapping scaffold covers the exact six authored scenario and assignment keys", async () => {
  const { manifest, ledger } = await base();
  assert.deepEqual(validateScenarioMappingLedgerShape(manifest, ledger), []);
});

test("production attestation finalizes the manifest and ledger without hand-copied UUIDs", async () => {
  const { manifest, ledger, catalog } = await base();
  const expectedManifest = structuredClone(manifest);
  const expectedLedger = structuredClone(ledger);
  attachProductionIds(expectedManifest, expectedLedger);
  const attestation = productionAttestation(expectedLedger, catalog);

  const result = finalizeScenarioProductionMapping({ manifest, ledger, catalog, closerExport: attestation });

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
  });
  const repairedAfterLedgerOnly = finalizeScenarioProductionMapping({
    manifest,
    ledger: result.ledger,
    catalog,
    closerExport: attestation,
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
  const finalized = finalizeScenarioProductionMapping({ manifest, ledger, catalog, closerExport: attestation });

  const changedLedger = structuredClone(finalized.ledger);
  changedLedger.records[0].production_scenario_id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  assert.throws(() => finalizeScenarioProductionMapping({
    manifest: finalized.manifest,
    ledger: changedLedger,
    catalog,
    closerExport: attestation,
  }), /binding changed after finalization/);

  const changedManifest = structuredClone(finalized.manifest);
  const changedBlock = changedManifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .find((block) => block.type === "role_play");
  changedBlock.content.scenario_id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  assert.throws(() => finalizeScenarioProductionMapping({
    manifest: changedManifest,
    ledger: finalized.ledger,
    catalog,
    closerExport: attestation,
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

test("arbitrary non-pending scenario strings cannot clear production trust", async () => {
  const { manifest, ledger, manifestBytes, ledgerBytes, catalogBytes } = await base();
  for (const course of manifest.program.courses) for (const module of course.modules) for (const lesson of module.lessons) for (const block of lesson.blocks ?? []) {
    if (block.type === "role_play") block.content.scenario_id = "definitely-not-production";
  }
  const report = await validateScenarioProductionTrust({ manifest, manifestBytes, ledger, ledgerBytes, catalogBytes, evidence: null });
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
    serviceRoleKey: "test-service-credential",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return mockResponse(attestation);
    },
  });
  assert.deepEqual(JSON.parse(result), attestation);
  assert.equal(request.url, RPC_URL);
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers.Authorization, "Bearer test-service-credential");
  assert.deepEqual(JSON.parse(request.init.body), { p_catalog: catalog });

  await assert.rejects(fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: provenance,
    url: CANONICAL_URL,
    serviceRoleKey: "test-service-credential",
    fetchImpl: async () => mockResponse(attestation, `${CANONICAL_URL}/rest/v1/forged`),
  }), /did not originate from the exact canonical RPC/);

  await assert.rejects(fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: provenance,
    url: "https://wrong-project.supabase.co",
    serviceRoleKey: "test-service-credential",
    fetchImpl: async () => mockResponse(attestation),
  }), /outside the canonical production project boundary/);
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
    serviceRoleKey: "test-service-credential",
    fetchImpl: async () => { calls += 1; return mockResponse({}); },
  }), /provenance is missing, stale, or not exact/);
  assert.equal(calls, 0);

  await assert.rejects(fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: { ...provenance, source_commit: "171b2228be70c19d1a707407d26f16de201793a0" },
    url: CANONICAL_URL,
    serviceRoleKey: "test-service-credential",
    fetchImpl: async () => { calls += 1; return mockResponse({}); },
  }), /provenance is missing, stale, or not exact/);
  assert.equal(calls, 0);
});

test("server checksum claims are independently recomputed by the consumer", async () => {
  const { manifest, ledger, catalog } = await base();
  const attestation = finalize(manifest, ledger, catalog);
  assert.equal(validateProductionGraphAttestation(attestation, catalog), attestation);

  const forgedCatalogHash = structuredClone(attestation);
  forgedCatalogHash.catalog_sha256 = "a".repeat(64);
  forgedCatalogHash.checksum_binding.catalog_sha256 = "a".repeat(64);
  forgedCatalogHash.graph_checksum_sha256 = postgresJsonbSha256(forgedCatalogHash.checksum_binding);
  assert.throws(
    () => validateProductionGraphAttestation(forgedCatalogHash, catalog),
    /invalid or incomplete exact-graph shape/,
  );

  const forgedGraphHash = structuredClone(attestation);
  forgedGraphHash.graph_checksum_sha256 = "b".repeat(64);
  assert.throws(
    () => validateProductionGraphAttestation(forgedGraphHash, catalog),
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
    () => validateProductionGraphAttestation(wrongId, catalog),
    /invalid or incomplete exact-graph shape/,
  );

  const wrongKey = structuredClone(attestation);
  wrongKey.graph[0].goals[0].goal_key = "bmh-institute-v1:goal:unrelated-but-well-shaped";
  resignAttestation(wrongKey);
  assert.throws(
    () => validateProductionGraphAttestation(wrongKey, catalog),
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
  });
  assert.deepEqual(report, { errors: [], blockers: [] });

  const localOnlyReport = await validateScenarioProductionTrust({
    manifest,
    manifestBytes,
    ledger,
    ledgerBytes,
    catalogBytes,
    evidence,
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
  });
  assert.ok(duplicateReport.blockers.some((blocker) => blocker.includes("missing, stale, or not exact")));
});
