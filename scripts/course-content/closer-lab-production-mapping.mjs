import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CLOSER_LAB_PRODUCTION_PROJECT_REF = "xqrkugdxpwhjscrheuqo";
export const CLOSER_LAB_CATALOG_SOURCE_COMMIT = "6343fe4c2b72524457b758e23d77b944fcb7ead4";
export const CLOSER_LAB_CATALOG_RAW_SHA256 = "919a99bea1d0cba1d64933f575a548c1c682ebac628e58e1e3d46f731b2b73cc";
export const CLOSER_LAB_CATALOG_STABLE_SHA256 = "523e0cf19ba7eaa96be1ce64c85ad3f4f44c46fdb1333f6268c8e8cae841e196";
const CLOSER_LAB_PRODUCTION_HOST = `${CLOSER_LAB_PRODUCTION_PROJECT_REF}.supabase.co`;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// PostgreSQL jsonb text orders object keys by UTF-8 byte length, then by byte
// value, and inserts a space after separators. The production RPC hashes that
// representation, so reproducing it here lets the consumer verify the server's
// checksum claim rather than merely checking that it looks like a SHA-256.
export function postgresJsonbText(value) {
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(", ")}]`;
  if (value && typeof value === "object") {
    const compareJsonbKeys = ([left], [right]) => {
      const leftBytes = Buffer.from(left);
      const rightBytes = Buffer.from(right);
      return leftBytes.length - rightBytes.length || Buffer.compare(leftBytes, rightBytes);
    };
    return `{${Object.entries(value).sort(compareJsonbKeys).map(([key, item]) => `${JSON.stringify(key)}: ${postgresJsonbText(item)}`).join(", ")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Closer Lab production attestation cannot hash a non-finite JSON number.");
  }
  return JSON.stringify(value) ?? "null";
}

export function postgresJsonbSha256(value) {
  return sha256(postgresJsonbText(value));
}

export function clientStableJsonSha256(value) {
  return sha256(stableJson(value));
}

export function validateCloserCatalogProvenance({ catalogBytes, provenance }) {
  const expected = {
    schema_version: 1,
    source_repository: "biginkc/closer-lab",
    source_commit: CLOSER_LAB_CATALOG_SOURCE_COMMIT,
    source_module: "scripts/bmh-institute-scenarios/scenario-data.ts",
    catalog_path: "docs/course-production/closer-lab-production-catalog.json",
    catalog_sha256: CLOSER_LAB_CATALOG_RAW_SHA256,
    production_rpc: "export_bmh_institute_production_graph",
    production_project_ref: CLOSER_LAB_PRODUCTION_PROJECT_REF,
  };
  if (!isDeepStrictEqual(provenance, expected) || sha256(catalogBytes) !== CLOSER_LAB_CATALOG_RAW_SHA256) {
    throw new Error("Closer Lab production catalog provenance is missing, stale, or not exact.");
  }
  return provenance;
}

export function assertCloserProductionUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Closer Lab production URL must be the canonical Supabase project URL.");
  }
  if (
    url.protocol !== "https:" || url.hostname !== CLOSER_LAB_PRODUCTION_HOST ||
    url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error("Closer Lab production URL is outside the canonical production project boundary.");
  }
  return url;
}

function decodeLegacyServiceJwt(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function buildCloserServiceHeaders(serviceRoleKey) {
  if (typeof serviceRoleKey !== "string") {
    throw new Error("Closer Lab production service credential is required for live attestation.");
  }
  const key = serviceRoleKey.trim();
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) {
    return { apikey: key, "Content-Type": "application/json" };
  }
  const claims = decodeLegacyServiceJwt(key);
  if (claims?.role !== "service_role" || claims.ref !== CLOSER_LAB_PRODUCTION_PROJECT_REF) {
    throw new Error("Closer Lab production service credential is not bound to the canonical production project.");
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function assertApprovedVoiceId(approvedVoiceId) {
  if (typeof approvedVoiceId !== "string" || !approvedVoiceId.trim()) {
    throw new Error("Closer Lab production approved voice ID is required for live attestation.");
  }
  return approvedVoiceId.trim();
}

export async function fetchCloserProductionGraph({ catalogBytes, catalogProvenance, url, serviceRoleKey, approvedVoiceId, fetchImpl = fetch }) {
  const canonicalUrl = assertCloserProductionUrl(url);
  const canonicalVoiceId = assertApprovedVoiceId(approvedVoiceId);
  validateCloserCatalogProvenance({ catalogBytes, provenance: catalogProvenance });
  const catalog = JSON.parse(catalogBytes.toString());
  if (
    catalog?.namespace !== "BMH Institute v1" || catalog.version !== 1 ||
    !Array.isArray(catalog.rolePlays) || catalog.rolePlays.length !== 6 ||
    catalog.rolePlays.flatMap((scenario) => scenario?.goals ?? []).length !== 24 ||
    clientStableJsonSha256(catalog) !== CLOSER_LAB_CATALOG_STABLE_SHA256
  ) {
    throw new Error("Closer Lab production catalog does not contain the exact 6/24 authored contract.");
  }
  const endpoint = new URL("/rest/v1/rpc/export_bmh_institute_production_graph", canonicalUrl);
  const response = await fetchImpl(
    endpoint,
    {
      method: "POST",
      redirect: "error",
      headers: buildCloserServiceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_catalog: catalog,
        p_approved_voice_id: canonicalVoiceId,
      }),
    },
  );
  if (response.url !== endpoint.href) {
    throw new Error("Closer Lab production attestation response did not originate from the exact canonical RPC.");
  }
  if (!response.ok) {
    throw new Error(`Closer Lab production attestation RPC failed with HTTP ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const attestation = JSON.parse(bytes.toString());
  validateProductionGraphAttestation(attestation, catalog, canonicalVoiceId);
  return bytes;
}

export function validateProductionGraphAttestation(attestation, catalog, approvedVoiceId) {
  const canonicalVoiceId = assertApprovedVoiceId(approvedVoiceId);
  if (clientStableJsonSha256(catalog) !== CLOSER_LAB_CATALOG_STABLE_SHA256) {
    throw new Error("Closer Lab production catalog is not the exact reviewed authored contract.");
  }
  const rolePlayKeys = Array.isArray(attestation?.role_plays)
    ? attestation.role_plays.map((record) => record?.source_key)
    : [];
  const rolePlaysAreExact = rolePlayKeys.length === 6 && new Set(rolePlayKeys).size === 6 &&
    attestation.role_plays.every((record) =>
      typeof record.source_key === "string" && record.source_key.startsWith("block-role-play-") &&
      UUID_PATTERN.test(record.scenario_id ?? "") && record.active === true &&
      typeof record.assignment_source_key === "string" && record.assignment_source_key.startsWith("assignment-section-") &&
      record.managed_source_key === `bmh-institute-v1:role-play:${record.source_key.replace(/^block-role-play-/, "")}`,
    );
  const catalogBySource = new Map((catalog?.rolePlays ?? []).map((scenario) => [scenario.sourceKey, scenario]));
  const graphByRolePlayKey = new Map((attestation?.graph ?? []).map((record) => [record?.role_play_key, record]));
  const graphIsExact = Array.isArray(attestation?.graph) && attestation.graph.length === 6 &&
    attestation.role_plays.every((exported) => {
      const scenario = catalogBySource.get(exported.source_key);
      const record = graphByRolePlayKey.get(exported.managed_source_key);
      const expectedGoals = scenario?.goals ?? [];
      return scenario && record &&
      exported.source_key === scenario.sourceKey &&
      exported.assignment_source_key === scenario.assignmentSourceKey &&
      exported.managed_source_key === `bmh-institute-v1:role-play:${scenario.key}` &&
      record.role_play_id === exported.scenario_id &&
      UUID_PATTERN.test(record?.role_play_id ?? "") && record.role_play_active === true &&
      UUID_PATTERN.test(record.persona_id ?? "") && record.persona_active === true &&
      record.persona_key === `bmh-institute-v1:persona:${scenario.persona.key}` &&
      record.voice_id === canonicalVoiceId &&
      Array.isArray(record.goals) && record.goals.length === 4 &&
      record.goals.reduce((total, goal) => total + Number(goal.weight), 0) === 100 &&
      record.goals.every((goal, index) =>
        UUID_PATTERN.test(goal?.goal_id ?? "") && goal.goal_active === true &&
        goal.goal_key === `bmh-institute-v1:goal:${expectedGoals[index]?.goal?.key}` &&
        typeof goal.weight === "number" && Number.isInteger(goal.weight) &&
        goal.weight === expectedGoals[index]?.weight &&
        Number.isInteger(goal.sort_order) && goal.sort_order === index,
      );
    });
  const graphRolePlayIds = graphIsExact ? attestation.graph.map((record) => record.role_play_id) : [];
  const graphPersonaIds = graphIsExact ? attestation.graph.map((record) => record.persona_id) : [];
  const graphGoalIds = graphIsExact ? attestation.graph.flatMap((record) => record.goals.map((goal) => goal.goal_id)) : [];
  const graphIdsAreUnique =
    new Set(graphRolePlayIds).size === 6 &&
    new Set(graphPersonaIds).size === 6 &&
    graphGoalIds.length === 24 && new Set(graphGoalIds).size === 24;
  const expectedChecksumBinding = {
    attestation_version: attestation?.attestation_version,
    project_ref: attestation?.project_ref,
    approved_voice_id: attestation?.approved_voice_id,
    catalog_sha256: attestation?.catalog_sha256,
    catalog_binding: attestation?.catalog_binding,
    counts: attestation?.counts,
    role_plays: attestation?.role_plays,
    graph: attestation?.graph,
  };
  const catalogChecksumIsExact =
    attestation?.catalog_sha256 === postgresJsonbSha256(catalog);
  const graphChecksumIsExact =
    attestation?.graph_checksum_sha256 === postgresJsonbSha256(expectedChecksumBinding);
  if (
    attestation?.attestation_version !== 1 ||
    attestation.project_ref !== CLOSER_LAB_PRODUCTION_PROJECT_REF ||
    attestation.approved_voice_id !== canonicalVoiceId ||
    attestation.checksum_algorithm !== "sha256-jsonb-text-v1" ||
    !SHA256_PATTERN.test(attestation.catalog_sha256 ?? "") || !catalogChecksumIsExact ||
    !SHA256_PATTERN.test(attestation.graph_checksum_sha256 ?? "") || !graphChecksumIsExact ||
    !isDeepStrictEqual(attestation.catalog_binding, catalog) ||
    attestation.counts?.role_plays !== 6 ||
    attestation.counts?.personas !== 6 ||
    attestation.counts?.goals !== 24 ||
    attestation.counts?.role_play_goal_links !== 24 ||
    !rolePlaysAreExact || !graphIsExact || !graphIdsAreUnique ||
    !isDeepStrictEqual(attestation.checksum_binding, expectedChecksumBinding)
  ) {
    throw new Error("Closer Lab production attestation has an invalid or incomplete exact-graph shape.");
  }
  return attestation;
}

export function rolePlayBindings(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "role_play" && block.required === true)
    .map((block) => ({
      block_source_key: block.source_key,
      scenario_source_key: block.source_key.replace(/^block-role-play-/, ""),
      assignment_source_key: block.content.scenario_spec?.assignment_source_key,
      production_scenario_id: block.content.scenario_id,
    }))
    .sort((left, right) => left.block_source_key.localeCompare(right.block_source_key));
}

export function validateScenarioMappingLedgerShape(manifest, ledger) {
  const errors = [];
  if (!ledger || ledger.schema_version !== 1 || !["pending", "finalized"].includes(ledger.status) || !Array.isArray(ledger.records)) {
    return ["Closer Lab production mapping ledger is missing or has an unsupported shape."];
  }
  const expected = rolePlayBindings(manifest);
  if (expected.length !== 6 || ledger.records.length !== expected.length) {
    errors.push("Closer Lab production mapping ledger must contain exactly the six required BMH scenarios.");
    return errors;
  }
  const records = new Map(ledger.records.map((record) => [record.block_source_key, record]));
  if (records.size !== ledger.records.length) errors.push("Closer Lab production mapping ledger has duplicate block source keys.");
  for (const binding of expected) {
    const record = records.get(binding.block_source_key);
    if (!record) {
      errors.push(`Closer Lab production mapping is missing ${binding.block_source_key}.`);
      continue;
    }
    if (record.scenario_source_key !== binding.scenario_source_key) {
      errors.push(`${binding.block_source_key} scenario source key drifted.`);
    }
    if (record.assignment_source_key !== binding.assignment_source_key) {
      errors.push(`${binding.block_source_key} assignment mapping drifted.`);
    }
    if (ledger.status === "pending") {
      if (record.production_scenario_id !== null || record.scenario_sha256 !== null) {
        errors.push(`${binding.block_source_key} pending mapping must not claim production evidence.`);
      }
    } else if (!UUID_PATTERN.test(record.production_scenario_id ?? "") || !SHA256_PATTERN.test(record.scenario_sha256 ?? "")) {
      errors.push(`${binding.block_source_key} finalized mapping needs a UUID production ID and scenario checksum.`);
    }
  }
  return errors;
}

export function finalizeScenarioProductionMapping({ manifest, ledger, catalog, closerExport, approvedVoiceId }) {
  const attestation = validateProductionGraphAttestation(closerExport, catalog, approvedVoiceId);
  const pendingErrors = validateScenarioMappingLedgerShape(manifest, ledger);
  if (pendingErrors.length > 0) throw new Error(pendingErrors.join("; "));

  const finalizedManifest = structuredClone(manifest);
  const finalizedLedger = structuredClone(ledger);
  const exported = new Map(attestation.role_plays.map((record) => [record.source_key, record]));
  if (exported.size !== 6 || attestation.role_plays.length !== 6) {
    throw new Error("Closer Lab production export must contain exactly six unique scenario bindings.");
  }
  const ledgerRecords = new Map(
    finalizedLedger.records.map((record) => [record.block_source_key, record]),
  );
  const graphBindingSha256 = clientStableJsonSha256(attestation.checksum_binding);
  let finalizedCount = 0;

  for (const course of finalizedManifest.program.courses) {
    for (const module of course.modules) {
      for (const lesson of module.lessons) {
        for (const block of lesson.blocks ?? []) {
          if (block.type !== "role_play" || block.required !== true) continue;
          const live = exported.get(block.source_key);
          const record = ledgerRecords.get(block.source_key);
          if (
            !live || !record || live.active !== true ||
            live.assignment_source_key !== record.assignment_source_key ||
            live.managed_source_key !== `bmh-institute-v1:role-play:${record.scenario_source_key}` ||
            !UUID_PATTERN.test(live.scenario_id ?? "")
          ) {
            throw new Error(`${block.source_key} is not an exact active production mapping.`);
          }
          const currentScenarioId = block.content.scenario_id;
          if (
            !/^pending\s*:/i.test(currentScenarioId ?? "") &&
            currentScenarioId !== live.scenario_id
          ) {
            throw new Error(`${block.source_key} manifest UUID changed after production binding.`);
          }
          if (
            (record.production_scenario_id !== null &&
              record.production_scenario_id !== live.scenario_id) ||
            (record.scenario_sha256 !== null &&
              record.scenario_sha256 !== graphBindingSha256)
          ) {
            throw new Error(`${block.source_key} ledger binding changed after finalization.`);
          }
          block.content.scenario_id = live.scenario_id;
          record.production_scenario_id = live.scenario_id;
          record.scenario_sha256 = graphBindingSha256;
          finalizedCount += 1;
        }
      }
    }
  }

  if (finalizedCount !== 6) {
    throw new Error(`Expected to finalize six role-play blocks, found ${finalizedCount}.`);
  }
  finalizedLedger.status = "finalized";
  const finalizedErrors = validateScenarioMappingLedgerShape(finalizedManifest, finalizedLedger);
  if (finalizedErrors.length > 0) throw new Error(finalizedErrors.join("; "));
  const finalizedBindings = rolePlayBindings(finalizedManifest);
  for (const binding of finalizedBindings) {
    const record = ledgerRecords.get(binding.block_source_key);
    if (binding.production_scenario_id !== record?.production_scenario_id) {
      throw new Error(`${binding.block_source_key} manifest and ledger IDs do not match.`);
    }
  }
  return { manifest: finalizedManifest, ledger: finalizedLedger, attestation };
}

export function buildScenarioReconciliationEvidence({ manifestBytes, ledgerBytes, catalogBytes, closerExportBytes, approvedVoiceId }) {
  const manifest = JSON.parse(manifestBytes.toString());
  const ledger = JSON.parse(ledgerBytes.toString());
  const catalog = JSON.parse(catalogBytes.toString());
  const closerExport = validateProductionGraphAttestation(
    JSON.parse(closerExportBytes.toString()),
    catalog,
    approvedVoiceId,
  );
  const clientCatalogSha256 = clientStableJsonSha256(catalog);
  const clientGraphBindingSha256 = clientStableJsonSha256(closerExport.checksum_binding);
  const shapeErrors = validateScenarioMappingLedgerShape(manifest, ledger);
  if (shapeErrors.length > 0) throw new Error(shapeErrors.join("; "));
  if (ledger.status !== "finalized") throw new Error("Closer Lab production mapping must be finalized before reconciliation.");
  const exported = new Map(closerExport.role_plays.map((record) => [record.source_key, record]));
  if (exported.size !== 6 || closerExport.role_plays.length !== 6) {
    throw new Error("Closer Lab export must contain exactly six unique BMH scenarios.");
  }
  const bindings = ledger.records.map((record) => {
    const live = exported.get(record.block_source_key);
    if (
      !live || live.active !== true ||
      live.scenario_id !== record.production_scenario_id ||
      live.assignment_source_key !== record.assignment_source_key ||
      clientGraphBindingSha256 !== record.scenario_sha256
    ) {
      throw new Error(`${record.block_source_key} does not exactly match the production Closer Lab export.`);
    }
    return {
      block_source_key: record.block_source_key,
      scenario_source_key: record.scenario_source_key,
      assignment_source_key: record.assignment_source_key,
      production_scenario_id: record.production_scenario_id,
      scenario_sha256: record.scenario_sha256,
    };
  }).sort((left, right) => left.block_source_key.localeCompare(right.block_source_key));
  return {
    schema_version: 1,
    status: "passed",
    exact: true,
    environment: "production",
    closer_lab_project_ref: closerExport.project_ref,
    approved_voice_id: closerExport.approved_voice_id,
    production_graph_checksum_sha256: closerExport.graph_checksum_sha256,
    client_catalog_sha256: clientCatalogSha256,
    client_graph_binding_sha256: clientGraphBindingSha256,
    manifest_sha256: sha256(manifestBytes),
    mapping_ledger_sha256: sha256(ledgerBytes),
    closer_export_sha256: sha256(closerExportBytes),
    bindings,
  };
}

export async function validateScenarioProductionTrust({
  manifest,
  manifestBytes,
  ledger,
  ledgerBytes,
  evidence,
  catalogBytes,
  liveAttestationBytes,
  approvedVoiceId,
}) {
  const errors = validateScenarioMappingLedgerShape(manifest, ledger);
  const blockers = [];
  const bindings = rolePlayBindings(manifest);
  if (bindings.some((binding) => /^pending\s*:/i.test(binding.production_scenario_id ?? ""))) {
    blockers.push("Closer Lab production scenarios are not yet attached to all six required role-play blocks.");
    return { errors, blockers };
  }
  if (!ledger || !Array.isArray(ledger.records) || ledger.status !== "finalized") {
    blockers.push("Closer Lab production mapping ledger is not finalized.");
    return { errors, blockers };
  }
  const records = new Map(ledger.records.map((record) => [record.block_source_key, record]));
  for (const binding of bindings) {
    const record = records.get(binding.block_source_key);
    if (!UUID_PATTERN.test(binding.production_scenario_id ?? "") || record?.production_scenario_id !== binding.production_scenario_id) {
      blockers.push(`${binding.block_source_key} is not bound to its verified production Closer Lab UUID.`);
    }
  }
  let expectedEvidence = null;
  try {
    if (liveAttestationBytes) {
      expectedEvidence = buildScenarioReconciliationEvidence({
        manifestBytes,
        ledgerBytes,
        catalogBytes,
        closerExportBytes: liveAttestationBytes,
        approvedVoiceId,
      });
    }
  } catch {
    expectedEvidence = null;
  }
  if (!expectedEvidence || JSON.stringify(evidence) !== JSON.stringify(expectedEvidence)) {
    blockers.push("Closer Lab production reconciliation evidence is missing, stale, or not exact.");
  }
  return { errors, blockers };
}

export async function writeJsonAtomically(outputPath, value, { mode = 0o600 } = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  await rename(temporary, outputPath);
}
