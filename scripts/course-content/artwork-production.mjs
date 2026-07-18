#!/usr/bin/env node

import {
  DEFAULT_PATHS,
  REPO_ROOT,
  approvePilots,
  buildFinalReviewRequest,
  createInitialLedger,
  deriveMaster,
  finalizeArtwork,
  ingestGeneration,
  isPristinePreapprovalLedger,
  loadWorkflow,
  promotePilots,
  preparePipelineReprocess,
  readJson,
  reconcileManifestFromLedger,
  recordApprovedTextureExceptions,
  resolveRepoPath,
  reviewMaster,
  summarizeLedger,
  validateLedger,
  withWorkflowLock,
  writeJsonAtomic,
  writeJsonAtomicCreateOrExact,
} from "./artwork-production-workflow.mjs";

function usage() {
  return `BMH artwork production workflow

Commands:
  status
  verify
  init
  approve-pilots --approved-by NAME --approved-at ISO --evidence REPO_PATH
  promote-pilots
  ingest --master-id ID --source FILE --call-id ID --tool-output-id ID --generated-at ISO --generated-by NAME [--correction-prompt REPO_PATH --parent-sha256 SHA --preserve-output KEY[,KEY]]
  ingest-pilot-remediation --master-id ID --source FILE --call-id ID --tool-output-id ID --generated-at ISO --generated-by NAME --correction-prompt REPO_PATH --parent-sha256 SHA --defect-evidence REPO_PATH
  derive (--master-id ID | --all)
  reprocess (--master-id ID | --all)
  record-texture-exceptions --evidence REPO_PATH
  prepare-final-review-request [--output REPO_PATH] [--contact-sheet REPO_PATH] [--contact-sheet-index REPO_PATH]
  review --master-id ID --decision approved --reviewed-by "Jarrad Henry" --reviewed-at ISO --evidence APPROVAL_JSON
  finalize --approved-by NAME --approved-at ISO --evidence REPO_PATH
  reconcile`;
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "all") {
      options.all = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  const value = options[key];
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

async function persistLedger(ledger) {
  await writeJsonAtomic(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.ledger), ledger, { root: REPO_ROOT });
}

async function execute(command, options) {
  if (command === "init") {
    const inventory = await readJson(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.inventory));
    const expected = createInitialLedger(inventory);
    const ledgerPath = resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.ledger);
    try {
      const existing = await readJson(ledgerPath);
      if (JSON.stringify(existing) !== JSON.stringify(expected)) {
        if (!isPristinePreapprovalLedger(existing)) {
          throw new Error("Existing production ledger contains approval, generation, review, or output state; refusing to overwrite it");
        }
        await writeJsonAtomic(ledgerPath, expected, { root: REPO_ROOT });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await writeJsonAtomic(ledgerPath, expected, { root: REPO_ROOT });
    }
    process.stdout.write(`${JSON.stringify(summarizeLedger(expected), null, 2)}\n`);
    return;
  }
  const workflow = await loadWorkflow(REPO_ROOT);
  const validate = (overrides = {}) => validateLedger({ root: REPO_ROOT, ...workflow, ...overrides });

  if (command === "status" || command === "verify") {
    await validate();
    process.stdout.write(`${JSON.stringify(command === "status" ? summarizeLedger(workflow.ledger) : { valid: true }, null, 2)}\n`);
    return;
  }
  if (command === "approve-pilots") {
    await validate();
    await approvePilots({
      root: REPO_ROOT,
      ledger: workflow.ledger,
      approvedBy: required(options, "approved-by"),
      approvedAt: required(options, "approved-at"),
      evidence: required(options, "evidence"),
    });
    await validate();
    await persistLedger(workflow.ledger);
  } else if (command === "promote-pilots") {
    await validate({ inspectFiles: false });
    await promotePilots({ root: REPO_ROOT, ledger: workflow.ledger });
    await validate();
    await persistLedger(workflow.ledger);
  } else if (command === "ingest" || command === "ingest-pilot-remediation") {
    await validate({ inspectFiles: false });
    await ingestGeneration({
      root: REPO_ROOT,
      ledger: workflow.ledger,
      masterId: required(options, "master-id"),
      sourceFile: required(options, "source"),
      generationCallId: required(options, "call-id"),
      toolOutputId: required(options, "tool-output-id"),
      generatedAt: required(options, "generated-at"),
      generatedBy: required(options, "generated-by"),
      correctionPromptPath: options["correction-prompt"] ?? null,
      parentSha256: options["parent-sha256"] ?? null,
      allowPilotRemediation: command === "ingest-pilot-remediation",
      defectEvidencePath: options["defect-evidence"] ?? null,
      preserveOutputKeys: options["preserve-output"] ? options["preserve-output"].split(",").filter(Boolean) : [],
    });
    await validate();
    await persistLedger(workflow.ledger);
  } else if (command === "derive") {
    await validate({ inspectFiles: false });
    const ids = options.all
      ? workflow.ledger.masters.filter((master) => master.status !== "missing").map((master) => master.id)
      : [required(options, "master-id")];
    if (options.all && ids.length === 0) throw new Error("No source-ready masters to derive");
    for (const masterId of ids) await deriveMaster({ root: REPO_ROOT, ledger: workflow.ledger, masterId });
    await validate();
    await persistLedger(workflow.ledger);
  } else if (command === "reprocess") {
    await validate();
    const ids = options.all
      ? workflow.ledger.masters.filter((master) => !master.pilot && master.status === "derived").map((master) => master.id)
      : [required(options, "master-id")];
    if (ids.length === 0) throw new Error("No derived non-pilot masters to reprocess");
    for (const masterId of ids) await preparePipelineReprocess({ root: REPO_ROOT, ledger: workflow.ledger, masterId });
    await validate();
    for (const masterId of ids) await deriveMaster({ root: REPO_ROOT, ledger: workflow.ledger, masterId });
    await validate();
    await persistLedger(workflow.ledger);
  } else if (command === "record-texture-exceptions") {
    await validate();
    await recordApprovedTextureExceptions({
      root: REPO_ROOT,
      ledger: workflow.ledger,
      evidence: required(options, "evidence"),
    });
    await validate();
    await persistLedger(workflow.ledger);
  } else if (command === "prepare-final-review-request") {
    await validate();
    const request = await buildFinalReviewRequest({
      root: REPO_ROOT,
      ledger: workflow.ledger,
      contactSheetPath: options["contact-sheet"] ?? DEFAULT_PATHS.contactSheet,
      contactSheetIndexPath: options["contact-sheet-index"] ?? DEFAULT_PATHS.contactSheetIndex,
    });
    const output = options.output ?? DEFAULT_PATHS.finalReviewRequest;
    const write = await writeJsonAtomicCreateOrExact(resolveRepoPath(REPO_ROOT, output), request, { root: REPO_ROOT });
    process.stdout.write(`${JSON.stringify({
      status: request.status,
      write_status: write.status,
      output,
      request_id: request.request_id,
      request_sha256: write.checksum_sha256,
      bindings_sha256: request.bindings_sha256,
      contact_sheet_sha256: request.contact_sheet.sha256,
      masters: request.masters.length,
      assets: request.assets.length,
    }, null, 2)}\n`);
    return;
  } else if (command === "review") {
    await validate();
    await reviewMaster({
      root: REPO_ROOT,
      ledger: workflow.ledger,
      masterId: required(options, "master-id"),
      decision: required(options, "decision"),
      reviewedBy: required(options, "reviewed-by"),
      reviewedAt: required(options, "reviewed-at"),
      evidence: required(options, "evidence"),
    });
    await validate();
    await persistLedger(workflow.ledger);
  } else if (command === "finalize") {
    await validate();
    const result = await finalizeArtwork({
      root: REPO_ROOT,
      ledger: workflow.ledger,
      manifest: workflow.manifest,
      approvedBy: required(options, "approved-by"),
      approvedAt: required(options, "approved-at"),
      evidence: required(options, "evidence"),
    });
    await validateLedger({ root: REPO_ROOT, inventory: workflow.inventory, manifest: result.manifest, ledger: result.ledger });
    await persistLedger(result.ledger);
    await writeJsonAtomic(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.manifest), result.manifest, { root: REPO_ROOT });
  } else if (command === "reconcile") {
    if (workflow.ledger.status !== "finalized") throw new Error("Reconcile requires a finalized ledger");
    const reconciled = reconcileManifestFromLedger(workflow.ledger, workflow.manifest);
    await validateLedger({ root: REPO_ROOT, inventory: workflow.inventory, manifest: reconciled, ledger: workflow.ledger });
    await writeJsonAtomic(resolveRepoPath(REPO_ROOT, DEFAULT_PATHS.manifest), reconciled, { root: REPO_ROOT });
  } else {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
  process.stdout.write(`${JSON.stringify(summarizeLedger(workflow.ledger), null, 2)}\n`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const locked = new Set([
    "init",
    "approve-pilots",
    "promote-pilots",
    "ingest",
    "ingest-pilot-remediation",
    "derive",
    "reprocess",
    "record-texture-exceptions",
    "prepare-final-review-request",
    "review",
    "finalize",
    "reconcile",
    "status",
    "verify",
  ]);
  if (locked.has(command)) {
    await withWorkflowLock(REPO_ROOT, () => execute(command, options));
  } else {
    await execute(command, options);
  }
}

main().catch((error) => {
  process.stderr.write(`artwork-production: ${error.message}\n`);
  process.exitCode = 1;
});
