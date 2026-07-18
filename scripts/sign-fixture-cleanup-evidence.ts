import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  signControllerEvidence,
  type UnsignedControllerEvidence,
} from "../src/lib/fixture-cleanup/controller-evidence";
import { validateControllerVerifiedCleanupEvidence } from "../src/lib/fixture-cleanup/guards";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const approvalInput = requiredArg(args, "approval-input");
  const rollbackInput = requiredArg(args, "rollback-input");
  const approvalOutput = requiredArg(args, "approval-output");
  const rollbackOutput = requiredArg(args, "rollback-output");
  if (resolve(approvalOutput) === resolve(rollbackOutput)) {
    throw new Error("Approval and rollback outputs must be distinct files.");
  }

  const keyId = requiredEnv("FIXTURE_CLEANUP_CONTROLLER_KEY_ID");
  const secret = requiredEnv("FIXTURE_CLEANUP_CONTROLLER_HMAC_SECRET");
  const executionId = args.get("execution-id") ?? randomUUID();
  if (!isExecutionId(executionId)) {
    throw new Error("Execution id must be a lowercase UUID v4.");
  }

  const approval = prepareUnsignedRecord(
    await readJson(approvalInput),
    executionId,
    keyId,
  );
  const rollback = prepareUnsignedRecord(
    await readJson(rollbackInput),
    executionId,
    keyId,
  );
  const signedApproval = {
    ...approval,
    controller_signature: signControllerEvidence("approval", approval, secret),
  };
  const signedRollback = {
    ...rollback,
    controller_signature: signControllerEvidence("rollback", rollback, secret),
  };
  validateControllerVerifiedCleanupEvidence(
    signedApproval,
    signedRollback,
    requiredString(approval.manifest_sha256, "approval manifest_sha256"),
  );

  await writePrivateJson(approvalOutput, signedApproval);
  try {
    await writePrivateJson(rollbackOutput, signedRollback);
  } catch (error) {
    throw new Error(
      `Rollback output was not written. Remove the newly created approval output before retrying. ${String(error)}`,
    );
  }
  console.log(
    JSON.stringify({
      status: "signed",
      execution_id: executionId,
      approval_output: resolve(approvalOutput),
      rollback_output: resolve(rollbackOutput),
    }),
  );
}

function prepareUnsignedRecord(
  value: unknown,
  executionId: string,
  keyId: string,
): UnsignedControllerEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Controller evidence input must be a JSON object.");
  }
  if ("controller_signature" in value) {
    throw new Error("Unsigned input must not contain controller_signature.");
  }
  const record = value as Record<string, unknown>;
  for (const [field, fieldValue] of Object.entries(record)) {
    if (typeof fieldValue !== "string") {
      throw new Error(`Controller evidence field ${field} must be a string.`);
    }
  }
  return {
    ...(record as Record<string, string>),
    signature_version: "hmac-sha256-v1",
    execution_id: executionId,
    controller_key_id: keyId,
  };
}

async function readJson(path: string) {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function writePrivateJson(path: string, value: unknown) {
  await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function parseArgs(raw: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < raw.length; index += 1) {
    const match = raw[index].match(/^--([^=]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
    else if (raw[index].startsWith("--") && raw[index + 1]) {
      values.set(raw[index].slice(2), raw[++index]);
    } else throw new Error(`Unexpected argument ${raw[index]}.`);
  }
  return values;
}

function requiredArg(values: Map<string, string>, name: string) {
  const value = values.get(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} through the approved secret manager.`);
  return value;
}

function requiredString(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function isExecutionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
