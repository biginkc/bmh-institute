import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { validateCourseManifest } from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";
import {
  buildReleasedQuizGraph,
  releasedQuizGraphSha256,
  releasedQuizRollbackConfirmation,
  releasedQuizRevisionConfirmation,
} from "../../src/lib/course-import/released-quiz-revision";
import type { Database } from "../../src/lib/supabase/types";
import {
  assertBmhImportInvocationScope,
  assertBmhImportSemanticGate,
  validateBmhImportSemanticGate,
} from "./import-semantic-gate.mjs";

const APPROVAL_REQUEST = resolve("docs/course-production/quiz-content-review-request.v1.json");
const APPROVAL_LEDGER = resolve("docs/course-production/quiz-approvals.json");
const QUESTION_BANK = resolve("content/quiz-generation/question-bank.v1.json");

async function sha256File(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
  const command = process.argv[2];
  const manifestPath = process.argv[3];
  if (!(["plan", "apply", "verify", "rollback"] as const).includes(command as "plan") || !manifestPath) {
    throw new Error(
      "Usage: npm run course:quizzes:revise -- <plan|apply|verify|rollback> <manifest.json> [--execute] [--allow-production] [--confirm=<manifest_sha256_or_rollback_confirmation>] [--rollback-artifact=<path>]",
    );
  }

  const execute = process.argv.includes("--execute");
  const allowProduction = process.argv.includes("--allow-production");
  const confirm = process.argv.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length);
  const rollbackArtifact = process.argv.find((arg) => arg.startsWith("--rollback-artifact="))
    ?.slice("--rollback-artifact=".length);
  const absoluteManifestPath = resolve(manifestPath);
  const manifestBytes = await readFile(absoluteManifestPath);
  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  const raw = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  const validated = validateCourseManifest(raw, { gate: "draft" });
  if (!validated.ok) throw new Error(validated.errors.join("\n"));
  const semantic = await validateBmhImportSemanticGate({ manifest: validated.value });
  if (!semantic) throw new Error("Released quiz revision is restricted to the canonical BMH manifest.");
  assertBmhImportInvocationScope(semantic, false);
  assertBmhImportSemanticGate(semantic, { enforcePublicationBlockers: true });

  const graph = buildReleasedQuizGraph(buildImportPlan(validated.value, {
    allowUnapprovedAssetPlaceholders: true,
  }));
  const graphSha256 = releasedQuizGraphSha256(graph);
  const summary = {
    import_id: validated.value.import_id,
    manifest_sha256: manifestSha256,
    graph_sha256: graphSha256,
    quizzes: graph.quizzes.length,
    questions: graph.questions.length,
    answer_options: graph.answer_options.length,
  };
  console.log(JSON.stringify({ command, execute, summary }, null, 2));
  if (command === "plan" || !execute) {
    if (command !== "plan") console.log("Dry run only. Add --execute after reviewing the exact checksums.");
    return;
  }
  if (confirm !== manifestSha256) {
    throw new Error(`Execution confirmation must equal the exact manifest SHA-256: ${manifestSha256}`);
  }
  if (!rollbackArtifact) {
    throw new Error("--rollback-artifact=<path> is required for apply and verify execution.");
  }

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertCourseImportEnvironment(url, allowProduction);
  const client = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const activeQuery = client.from("content_import_active_release_v1" as never) as unknown as {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
  const { data: active, error: activeError } = await activeQuery
    .select("import_id,active_revision,active_manifest_sha256,active_catalog_sha256")
    .eq("import_id", validated.value.import_id)
    .single();
  if (activeError || !active) {
    throw new Error(`Active release preflight failed: ${activeError?.message ?? "not found"}`);
  }
  const priorManifestSha256 = String(active.active_manifest_sha256);

  if (command === "rollback") {
    const expectedRevision = Number(active.active_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 2) {
      throw new Error(`Released quiz rollback requires an active revision of at least 2; found ${active.active_revision}.`);
    }
    const revisionQuery = client.from("content_import_release_revisions" as never) as unknown as {
      select(columns: string): {
        eq(column: string, value: string | number): {
          eq(column: string, value: string | number): {
            single(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data: revision, error: revisionError } = await revisionQuery
      .select("revision,prior_manifest_sha256,manifest_sha256")
      .eq("import_id", validated.value.import_id)
      .eq("revision", expectedRevision)
      .single();
    if (revisionError || !revision) {
      throw new Error(`Released quiz rollback preflight failed: ${revisionError?.message ?? "revision not found"}`);
    }
    const rollbackConfirmation = releasedQuizRollbackConfirmation({
      importId: validated.value.import_id,
      expectedRevision,
      manifestSha256: String(revision.manifest_sha256),
      priorManifestSha256: String(revision.prior_manifest_sha256),
    });
    if (confirm !== rollbackConfirmation) {
      throw new Error(`Rollback confirmation must equal: ${rollbackConfirmation}`);
    }
    const rpc = client as unknown as {
      rpc(name: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
    const { data, error } = await rpc.rpc("fn_rollback_released_quiz_revision_v1", {
      p_import_id: validated.value.import_id,
      p_expected_revision: expectedRevision,
      p_evidence: {
        operation: "rollback",
        rollback_sha256: await sha256File(resolve(rollbackArtifact)),
      },
      p_confirmation: rollbackConfirmation,
    });
    if (error) throw new Error(`Released quiz rollback failed: ${error.message}`);
    await verifyRolledBackQuizGraph(
      client,
      validated.value.import_id,
      String(revision.prior_manifest_sha256),
    );
    console.log(JSON.stringify({ phase: "released_quiz_rollback", result: data }, null, 2));
    return;
  }

  if (command === "apply") {
    const evidence = {
      operation: "release",
      question_bank_sha256: await sha256File(QUESTION_BANK),
      approval_request_sha256: await sha256File(APPROVAL_REQUEST),
      approval_ledger_sha256: await sha256File(APPROVAL_LEDGER),
      rollback_sha256: await sha256File(resolve(rollbackArtifact)),
      client_graph_sha256: graphSha256,
    };
    const rpc = client as unknown as {
      rpc(name: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
    const { data, error } = await rpc.rpc("fn_revise_released_quizzes_v1", {
      p_import_id: validated.value.import_id,
      p_expected_prior_manifest_sha256: priorManifestSha256,
      p_manifest_sha256: manifestSha256,
      p_quizzes: graph.quizzes,
      p_questions: graph.questions,
      p_answer_options: graph.answer_options,
      p_evidence: evidence,
      p_confirmation: releasedQuizRevisionConfirmation({
        importId: validated.value.import_id,
        priorManifestSha256,
        manifestSha256,
      }),
    });
    if (error) throw new Error(`Released quiz revision failed: ${error.message}`);
    console.log(JSON.stringify({ phase: "released_quiz_revision", result: data }, null, 2));
  }

  await verifyReleasedQuizGraph(client, graph, validated.value.import_id, manifestSha256);
}

async function verifyRolledBackQuizGraph(
  client: ReturnType<typeof createClient<Database>>,
  importId: string,
  manifestSha256: string,
) {
  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data: inventory, error: inventoryError } = await rpc.rpc("fn_course_import_managed_ids", {
    p_import_id: importId,
  });
  if (inventoryError) throw new Error(`Rollback inventory verification failed: ${inventoryError.message}`);
  const managed = inventory as Record<string, string[]>;
  if (managed.quizzes?.length !== 19 || managed.questions?.length !== 342) {
    throw new Error(`Rollback inventory mismatch: ${managed.quizzes?.length ?? 0} quizzes, ${managed.questions?.length ?? 0} questions.`);
  }
  const activeApi = client.from("content_import_active_release_v1" as never) as unknown as {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
  const { data: active, error: activeError } = await activeApi
    .select("active_revision,active_manifest_sha256,active_catalog_sha256")
    .eq("import_id", importId)
    .single();
  if (activeError || !active || active.active_manifest_sha256 !== manifestSha256) {
    throw new Error(`Rollback release receipt verification failed: ${activeError?.message ?? "manifest mismatch"}`);
  }
  console.log(JSON.stringify({
    phase: "released_quiz_rollback_verified",
    active_revision: active.active_revision,
    active_manifest_sha256: active.active_manifest_sha256,
    active_catalog_sha256: active.active_catalog_sha256,
    quizzes: 19,
    questions: 342,
  }, null, 2));
}

async function verifyReleasedQuizGraph(
  client: ReturnType<typeof createClient<Database>>,
  graph: ReturnType<typeof buildReleasedQuizGraph>,
  importId: string,
  manifestSha256: string,
) {
  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data: inventory, error: inventoryError } = await rpc.rpc("fn_course_import_managed_ids", {
    p_import_id: importId,
  });
  if (inventoryError) throw new Error(`Managed inventory verification failed: ${inventoryError.message}`);
  const managed = inventory as Record<string, string[]>;
  if (managed.quizzes?.length !== 19 || managed.questions?.length !== 920) {
    throw new Error(`Managed inventory mismatch: ${managed.quizzes?.length ?? 0} quizzes, ${managed.questions?.length ?? 0} questions.`);
  }

  const activeApi = client.from("content_import_active_release_v1" as never) as unknown as {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
  const { data: active, error: activeError } = await activeApi
    .select("active_revision,active_manifest_sha256,active_catalog_sha256")
    .eq("import_id", importId)
    .single();
  if (activeError || !active || active.active_manifest_sha256 !== manifestSha256) {
    throw new Error(`Active release receipt verification failed: ${activeError?.message ?? "manifest mismatch"}`);
  }

  const quizApi = client.from("quizzes") as unknown as {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
  const { data: quizzes, error: quizError } = await quizApi
    .select("id,questions_per_attempt")
    .in("id", graph.quizzes.map((quiz) => String(quiz.id)));
  if (quizError || quizzes?.length !== 19 || quizzes.some((quiz) => quiz.questions_per_attempt !== null)) {
    throw new Error(`Exhaustive quiz configuration verification failed: ${quizError?.message ?? "row mismatch"}`);
  }
  console.log(JSON.stringify({
    phase: "released_quiz_revision_verified",
    active_revision: active.active_revision,
    active_manifest_sha256: active.active_manifest_sha256,
    active_catalog_sha256: active.active_catalog_sha256,
    quizzes: 19,
    questions: 920,
    answer_options: graph.answer_options.length,
  }, null, 2));
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
