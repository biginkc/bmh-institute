import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { validateCanaryScope, validateCourseManifest } from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";
import { buildImportedLessonArtworkReplacements } from "../../src/lib/course-import/artwork-replacement";

const DEFAULT_LEDGER = "docs/course-production/thumbnail-pilots/production-ledger.json";

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args[0];
  if (!manifestPath) {
    throw new Error("Usage: npm run course:artwork:replace -- <manifest.json> [--execute] [--canary] [--allow-production] [--ledger=<path>]");
  }
  const canary = args.includes("--canary");
  const execute = args.includes("--execute");
  const allowProduction = args.includes("--allow-production");
  const ledgerPath = args.find((arg) => arg.startsWith("--ledger="))?.slice("--ledger=".length)
    ?? DEFAULT_LEDGER;

  const rawManifest = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as unknown;
  const validated = validateCourseManifest(rawManifest, { gate: canary ? "canary" : "release" });
  if (!validated.ok) {
    throw new Error(validated.errors.map((error) => `- ${error}`).join("\n"));
  }
  if (canary) {
    const errors = validateCanaryScope(validated.value);
    if (errors.length > 0) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  }

  const ledger = JSON.parse(await readFile(resolve(ledgerPath), "utf8")) as unknown;
  const plan = buildImportPlan(validated.value);
  const replacements = buildImportedLessonArtworkReplacements(plan, ledger);
  console.log(JSON.stringify({
    phase: "artwork_replacement_plan",
    import_id: plan.importId,
    count: replacements.length,
    lesson_ids: replacements.map((replacement) => replacement.lesson_id),
    execute,
  }, null, 2));
  if (!execute) return;

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertCourseImportEnvironment(url, allowProduction);
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await client.rpc("fn_replace_imported_lesson_artwork", {
    p_import_id: plan.importId,
    p_replacements: replacements,
  });
  if (error) throw new Error(`Imported lesson artwork replacement failed: ${error.message}`);
  console.log(JSON.stringify({ phase: "artwork_replaced", result: data }, null, 2));
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for --execute.`);
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
