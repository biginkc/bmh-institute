import { readFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

import { atomicImportOperations } from "../src/lib/course-import/execute";
import { assertCourseImportEnvironment } from "../src/lib/course-import/environment";
import { validateCanaryScope, validateCourseManifest } from "../src/lib/course-import/manifest";
import { buildImportPlan } from "../src/lib/course-import/operations";

const MANIFEST_PATH = "content/course-manifests/bmh-employee-training-canary.v1.json";
const STALE_TRANSCRIPT_PATH =
  "courses/bmh-employee-training-canary/v1/transcripts/video-slot-03-tech-stack.f96bb3853919ebe2499c25c126fcebe71bae4b072d78df438f6195c8bf26cc4d.md";

async function main(): Promise<void> {
  const url = requiredEnv("TEST_SUPABASE_URL");
  const serviceRole = requiredEnv("TEST_SUPABASE_SERVICE_ROLE_KEY");
  if (assertCourseImportEnvironment(url, false) !== "test") {
    throw new Error("Canary reconciliation is restricted to the canonical test project.");
  }

  const raw = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown;
  const validation = validateCourseManifest(raw, { gate: "canary" });
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  const canaryErrors = validateCanaryScope(validation.value);
  if (canaryErrors.length > 0) throw new Error(canaryErrors.join("; "));
  const plan = buildImportPlan(validation.value);
  if (plan.importId !== "bmh-employee-training-canary-v1") {
    throw new Error(`Unexpected canary import id: ${plan.importId}`);
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const applied = await supabase.rpc("fn_apply_course_import", {
    p_import_id: plan.importId,
    p_operations: atomicImportOperations(plan),
  });
  if (applied.error) throw applied.error;

  const removed = await supabase.storage.from("content").remove([STALE_TRANSCRIPT_PATH]);
  if (removed.error) throw removed.error;
  console.log(JSON.stringify({
    status: "caption_only_canary_reconciled",
    import_id: plan.importId,
    operations: plan.operations.length,
    removed_paths: [STALE_TRANSCRIPT_PATH],
  }));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
