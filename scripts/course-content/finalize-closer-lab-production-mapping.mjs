import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  fetchCloserProductionGraph,
  finalizeScenarioProductionMapping,
  writeJsonAtomically,
} from "./closer-lab-production-mapping.mjs";

function value(args, name) {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function assertDistinctFinalizationPaths(paths) {
  const canonical = await Promise.all(paths.filter(Boolean).map(async (candidate) => {
    const resolved = path.resolve(candidate);
    try {
      return await realpath(resolved);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return resolved;
      }
      throw error;
    }
  }));
  if (new Set(canonical).size !== canonical.length) {
    throw new Error("Closer Lab finalization input and output paths must all be distinct.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = value(args, "--manifest");
  const ledgerPath = value(args, "--mapping-ledger");
  const catalogPath = value(args, "--production-catalog");
  const catalogProvenancePath = value(args, "--catalog-provenance") ??
    catalogPath?.replace(/\.json$/i, ".provenance.json");
  const attestationOutputPath = value(args, "--attestation-output");
  if (!manifestPath || !ledgerPath || !catalogPath || !catalogProvenancePath) {
    throw new Error("Usage: node finalize-closer-lab-production-mapping.mjs --manifest=<manifest.json> --mapping-ledger=<mapping.json> --production-catalog=<catalog.json> [--catalog-provenance=<provenance.json>] [--attestation-output=<attestation.json>]");
  }

  const resolvedManifestPath = path.resolve(manifestPath);
  const resolvedLedgerPath = path.resolve(ledgerPath);
  await assertDistinctFinalizationPaths([
    resolvedManifestPath,
    resolvedLedgerPath,
    path.resolve(catalogPath),
    path.resolve(catalogProvenancePath),
    attestationOutputPath ? path.resolve(attestationOutputPath) : null,
  ]);
  const [manifestBytes, ledgerBytes, catalogBytes, provenanceBytes] = await Promise.all([
    readFile(resolvedManifestPath),
    readFile(resolvedLedgerPath),
    readFile(path.resolve(catalogPath)),
    readFile(path.resolve(catalogProvenancePath)),
  ]);
  const catalog = JSON.parse(catalogBytes.toString());
  const attestationBytes = await fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: JSON.parse(provenanceBytes.toString()),
    url: process.env.CLOSER_LAB_PRODUCTION_SUPABASE_URL,
    serviceRoleKey: process.env.CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY,
  });
  const result = finalizeScenarioProductionMapping({
    manifest: JSON.parse(manifestBytes.toString()),
    ledger: JSON.parse(ledgerBytes.toString()),
    catalog,
    closerExport: JSON.parse(attestationBytes.toString()),
  });

  await writeJsonAtomically(resolvedManifestPath, result.manifest, { mode: 0o644 });
  await writeJsonAtomically(resolvedLedgerPath, result.ledger, { mode: 0o644 });
  if (attestationOutputPath) {
    await writeJsonAtomically(path.resolve(attestationOutputPath), result.attestation);
  }
  console.log(JSON.stringify({
    status: "finalized",
    manifest: resolvedManifestPath,
    mapping_ledger: resolvedLedgerPath,
    production_scenarios: result.ledger.records.length,
    graph_checksum_sha256: result.attestation.graph_checksum_sha256,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
