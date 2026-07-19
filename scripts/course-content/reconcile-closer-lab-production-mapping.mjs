import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  buildScenarioReconciliationEvidence,
  fetchCloserProductionGraph,
  writeJsonAtomically,
} from "./closer-lab-production-mapping.mjs";

function value(args, name) {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = value(args, "--manifest");
  const ledgerPath = value(args, "--mapping-ledger");
  const catalogPath = value(args, "--production-catalog");
  const catalogProvenancePath = value(args, "--catalog-provenance") ??
    catalogPath?.replace(/\.json$/i, ".provenance.json");
  const outputPath = value(args, "--output");
  if (!manifestPath || !ledgerPath || !catalogPath || !catalogProvenancePath) {
    throw new Error("Usage: node reconcile-closer-lab-production-mapping.mjs --manifest=<manifest.json> --mapping-ledger=<mapping.json> --production-catalog=<catalog.json> [--catalog-provenance=<provenance.json>] [--output=<evidence.json>]");
  }
  const [manifestBytes, ledgerBytes, catalogBytes, catalogProvenanceBytes] = await Promise.all([
    readFile(path.resolve(manifestPath)),
    readFile(path.resolve(ledgerPath)),
    readFile(path.resolve(catalogPath)),
    readFile(path.resolve(catalogProvenancePath)),
  ]);
  const closerExportBytes = await fetchCloserProductionGraph({
    catalogBytes,
    catalogProvenance: JSON.parse(catalogProvenanceBytes.toString()),
    url: process.env.CLOSER_LAB_PRODUCTION_SUPABASE_URL,
    serviceRoleKey: process.env.CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY,
    approvedVoiceId: process.env.BMH_INSTITUTE_SCENARIOS_ELEVENLABS_VOICE_ID,
  });
  const evidence = buildScenarioReconciliationEvidence({
    manifestBytes,
    ledgerBytes,
    catalogBytes,
    closerExportBytes,
    approvedVoiceId: process.env.BMH_INSTITUTE_SCENARIOS_ELEVENLABS_VOICE_ID,
  });
  if (outputPath) await writeJsonAtomically(path.resolve(outputPath), evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
