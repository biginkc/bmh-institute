import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { assertCourseImportEnvironment } from "../../src/lib/course-import/environment";
import { validateCourseManifest } from "../../src/lib/course-import/manifest";
import { buildImportPlan } from "../../src/lib/course-import/operations";
import {
  buildReleasedQuizGraph,
  extractQuizGraph,
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
const CANONICAL_MANIFEST = resolve("content/course-manifests/bmh-employee-training.v1.json");
const LEGACY_ROLLBACK_ARTIFACT = resolve(
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
);

async function sha256File(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export function assertReleasedQuizExecutionArguments(args: {
  command: string;
  confirm?: string;
  manifestSha256: string;
  rollbackArtifact?: string;
}) {
  if (args.command === "apply" && args.confirm !== args.manifestSha256) {
    throw new Error(`Execution confirmation must equal the exact manifest SHA-256: ${args.manifestSha256}`);
  }
  if ((args.command === "apply" || args.command === "rollback") && !args.rollbackArtifact) {
    throw new Error("--rollback-artifact=<path> is required for apply and rollback execution.");
  }
}

export async function loadLegacyRollbackArtifact(args: {
  rollbackArtifact: string;
  expectedImportId: string;
  expectedManifestSha256?: string;
}) {
  const absolutePath = resolve(args.rollbackArtifact);
  if (absolutePath !== LEGACY_ROLLBACK_ARTIFACT) {
    throw new Error(
      "Rollback artifact must be content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json.",
    );
  }
  const bytes = await readFile(absolutePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (args.expectedManifestSha256 && sha256 !== args.expectedManifestSha256) {
    throw new Error("Rollback artifact SHA-256 does not match the exact prior release manifest.");
  }
  const validated = validateCourseManifest(
    JSON.parse(bytes.toString("utf8")) as unknown,
    { gate: "draft" },
  );
  if (!validated.ok) {
    throw new Error(`Rollback artifact is not a valid course manifest: ${validated.errors.join("\n")}`);
  }
  const graph = extractQuizGraph(buildImportPlan(validated.value, {
    allowUnapprovedAssetPlaceholders: true,
  }));
  if (
    validated.value.import_id !== args.expectedImportId
    || graph.quizzes.length !== 19
    || graph.questions.length !== 342
    || graph.quizzes.some((quiz) => quiz.questions_per_attempt !== 10)
  ) {
    throw new Error(
      "Rollback artifact must be the exact 19-quiz, 342-question legacy manifest with a 10-question attempt cap.",
    );
  }
  return { graph, sha256 };
}

export function assertExactReleasedQuizGraph(
  expected: ReturnType<typeof extractQuizGraph>,
  actual: ReturnType<typeof extractQuizGraph>,
  label: string,
) {
  assertExactIds("quizzes", actual.quizzes.map((row) => String(row.id)), expected.quizzes.map((row) => String(row.id)));
  assertExactIds("questions", actual.questions.map((row) => String(row.id)), expected.questions.map((row) => String(row.id)));
  assertExactIds(
    "answer_options",
    actual.answer_options.map((row) => String(row.id)),
    expected.answer_options.map((row) => String(row.id)),
  );
  const expectedSha256 = releasedQuizGraphSha256(expected);
  const actualSha256 = releasedQuizGraphSha256(actual);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${label} quiz graph differs from the exact rollback artifact: expected ${expectedSha256}, received ${actualSha256}.`);
  }
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
  if (absoluteManifestPath !== CANONICAL_MANIFEST) {
    throw new Error("Released quiz revision accepts only content/course-manifests/bmh-employee-training.v1.json.");
  }
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
  assertReleasedQuizExecutionArguments({ command, confirm, manifestSha256, rollbackArtifact });

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
    if (!rollbackArtifact) throw new Error("Rollback artifact is required.");
    const rollback = await loadLegacyRollbackArtifact({
      rollbackArtifact,
      expectedImportId: validated.value.import_id,
    });
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
      .select("revision,prior_manifest_sha256,manifest_sha256,prior_catalog_sha256,catalog_sha256,evidence,question_count")
      .eq("import_id", validated.value.import_id)
      .eq("revision", expectedRevision)
      .single();
    if (revisionError || !revision) {
      throw new Error(`Released quiz rollback preflight failed: ${revisionError?.message ?? "revision not found"}`);
    }
    const revisionEvidence = revision.evidence as Record<string, unknown> | null;
    if (
      revision.manifest_sha256 !== active.active_manifest_sha256
      || revision.question_count !== 920
      || rollback.sha256 !== revision.prior_manifest_sha256
      || rollback.sha256 !== revisionEvidence?.rollback_sha256
    ) {
      throw new Error("Released quiz rollback preflight is not bound to the exact forward revision and legacy artifact.");
    }
    const rollbackConfirmation = releasedQuizRollbackConfirmation({
      importId: validated.value.import_id,
      expectedRevision,
      manifestSha256: String(revision.manifest_sha256),
      priorManifestSha256: String(revision.prior_manifest_sha256),
      rollbackSha256: rollback.sha256,
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
        rollback_sha256: rollback.sha256,
      },
      p_confirmation: rollbackConfirmation,
    });
    if (error) throw new Error(`Released quiz rollback failed: ${error.message}`);
    await verifyRolledBackQuizGraph(
      client,
      rollback.graph,
      validated.value.import_id,
      String(revision.prior_manifest_sha256),
      String(revision.prior_catalog_sha256),
    );
    console.log(JSON.stringify({ phase: "released_quiz_rollback", result: data }, null, 2));
    return;
  }

  if (command === "apply") {
    if (!rollbackArtifact) throw new Error("Rollback artifact is required.");
    let expectedPriorManifestSha256 = priorManifestSha256;
    if (priorManifestSha256 === manifestSha256) {
      const revisionQuery = client.from("content_import_release_revisions" as never) as unknown as {
        select(columns: string): {
          eq(column: string, value: string | number): {
            eq(column: string, value: string | number): {
              single(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
            };
          };
        };
      };
      const { data: committed, error: committedError } = await revisionQuery
        .select("prior_manifest_sha256")
        .eq("import_id", validated.value.import_id)
        .eq("revision", Number(active.active_revision))
        .single();
      if (committedError || !committed) {
        throw new Error(`Idempotent revision preflight failed: ${committedError?.message ?? "revision not found"}`);
      }
      expectedPriorManifestSha256 = String(committed.prior_manifest_sha256);
    }
    const rollback = await loadLegacyRollbackArtifact({
      rollbackArtifact,
      expectedImportId: validated.value.import_id,
      expectedManifestSha256: expectedPriorManifestSha256,
    });
    if (priorManifestSha256 !== manifestSha256) {
      const liveLegacyGraph = await readExactLiveQuizGraph(
        client,
        validated.value.import_id,
        rollback.graph,
      );
      assertExactReleasedQuizGraph(rollback.graph, liveLegacyGraph, "Live pre-revision");
    }
    const evidence = {
      operation: "release",
      question_bank_sha256: await sha256File(QUESTION_BANK),
      approval_request_sha256: await sha256File(APPROVAL_REQUEST),
      approval_ledger_sha256: await sha256File(APPROVAL_LEDGER),
      rollback_sha256: rollback.sha256,
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
      p_expected_prior_manifest_sha256: expectedPriorManifestSha256,
      p_manifest_sha256: manifestSha256,
      p_quizzes: graph.quizzes,
      p_questions: graph.questions,
      p_answer_options: graph.answer_options,
      p_evidence: evidence,
      p_confirmation: releasedQuizRevisionConfirmation({
        importId: validated.value.import_id,
        priorManifestSha256: expectedPriorManifestSha256,
        manifestSha256,
      }),
    });
    if (error) throw new Error(`Released quiz revision failed: ${error.message}`);
    console.log(JSON.stringify({ phase: "released_quiz_revision", result: data }, null, 2));
  }

  await verifyReleasedQuizGraph(client, graph, validated.value.import_id, manifestSha256);
}

async function readExactLiveQuizGraph(
  client: ReturnType<typeof createClient<Database>>,
  importId: string,
  expected: ReturnType<typeof extractQuizGraph>,
) {
  const rpc = client as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data: inventory, error: inventoryError } = await rpc.rpc(
    "fn_course_import_managed_ids",
    { p_import_id: importId },
  );
  if (inventoryError) throw new Error(`Live rollback inventory comparison failed: ${inventoryError.message}`);
  const managed = inventory as Record<string, string[]>;
  assertExactIds("quizzes", managed.quizzes, expected.quizzes.map((row) => String(row.id)));
  assertExactIds("questions", managed.questions, expected.questions.map((row) => String(row.id)));
  assertExactIds(
    "answer_options",
    managed.answer_options,
    expected.answer_options.map((row) => String(row.id)),
  );
  const [quizzes, questions, answerOptions] = await Promise.all([
    fetchRowsByIds(client, "quizzes", expected.quizzes),
    fetchRowsByIds(client, "questions", expected.questions),
    fetchRowsByIds(client, "answer_options", expected.answer_options),
  ]);
  return {
    quizzes: normalizeLiveRows(quizzes, expected.quizzes),
    questions: normalizeLiveRows(questions, expected.questions),
    answer_options: normalizeLiveRows(answerOptions, expected.answer_options),
  };
}

async function fetchRowsByIds(
  client: ReturnType<typeof createClient<Database>>,
  table: "quizzes" | "questions" | "answer_options",
  expectedRows: Record<string, unknown>[],
) {
  if (expectedRows.length === 0) return [];
  const columns = Object.keys(expectedRows[0]).join(",");
  const ids = expectedRows.map((row) => String(row.id));
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const query = client.from(table) as unknown as {
      select(columns: string): {
        in(column: string, values: string[]): PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
    };
    const { data, error } = await query.select(columns).in("id", ids.slice(offset, offset + 100));
    if (error) throw new Error(`Live ${table} rollback comparison failed: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

function normalizeLiveRows(actual: Record<string, unknown>[], expected: Record<string, unknown>[]) {
  const keys = Object.keys(expected[0]);
  return actual
    .map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function verifyRolledBackQuizGraph(
  client: ReturnType<typeof createClient<Database>>,
  graph: ReturnType<typeof extractQuizGraph>,
  importId: string,
  manifestSha256: string,
  expectedCatalogSha256: string,
) {
  const active = await verifyExactQuizGraph({
    client,
    graph,
    importId,
    manifestSha256,
    expectedCatalogSha256,
    expectedQuestionsPerAttempt: 10,
  });
  console.log(JSON.stringify({
    phase: "released_quiz_rollback_verified",
    active_revision: active.active_revision,
    active_manifest_sha256: active.active_manifest_sha256,
    active_catalog_sha256: active.active_catalog_sha256,
    quizzes: graph.quizzes.length,
    questions: graph.questions.length,
    answer_options: graph.answer_options.length,
  }, null, 2));
}

async function verifyReleasedQuizGraph(
  client: ReturnType<typeof createClient<Database>>,
  graph: ReturnType<typeof buildReleasedQuizGraph>,
  importId: string,
  manifestSha256: string,
) {
  const active = await verifyExactQuizGraph({
    client,
    graph,
    importId,
    manifestSha256,
    expectedQuestionsPerAttempt: null,
    expectedClientGraphSha256: releasedQuizGraphSha256(graph),
  });
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

async function verifyExactQuizGraph(args: {
  client: ReturnType<typeof createClient<Database>>;
  graph: ReturnType<typeof extractQuizGraph>;
  importId: string;
  manifestSha256: string;
  expectedCatalogSha256?: string;
  expectedQuestionsPerAttempt: number | null;
  expectedClientGraphSha256?: string;
}) {
  const rpc = args.client as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const [{ data: inventory, error: inventoryError }, { data: liveCatalog, error: catalogError }] = await Promise.all([
    rpc.rpc("fn_course_import_managed_ids", { p_import_id: args.importId }),
    rpc.rpc("fn_course_import_catalog_sha256", { p_import_id: args.importId }),
  ]);
  if (inventoryError) throw new Error(`Managed inventory verification failed: ${inventoryError.message}`);
  if (catalogError) throw new Error(`Live catalog checksum verification failed: ${catalogError.message}`);
  const managed = inventory as Record<string, string[]>;
  assertExactIds("quizzes", managed.quizzes, args.graph.quizzes.map((row) => String(row.id)));
  assertExactIds("questions", managed.questions, args.graph.questions.map((row) => String(row.id)));
  assertExactIds("answer_options", managed.answer_options, args.graph.answer_options.map((row) => String(row.id)));

  const activeApi = args.client.from("content_import_active_release_v1" as never) as unknown as {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
  const { data: active, error: activeError } = await activeApi
    .select("active_revision,active_manifest_sha256,active_catalog_sha256")
    .eq("import_id", args.importId)
    .single();
  if (activeError || !active || active.active_manifest_sha256 !== args.manifestSha256) {
    throw new Error(`Active release receipt verification failed: ${activeError?.message ?? "manifest mismatch"}`);
  }
  if (liveCatalog !== active.active_catalog_sha256) {
    throw new Error("Live catalog checksum differs from the immutable active revision receipt.");
  }
  if (args.expectedCatalogSha256 && liveCatalog !== args.expectedCatalogSha256) {
    throw new Error("Restored catalog checksum differs from the exact pre-revision catalog checksum.");
  }

  const revisionApi = args.client.from("content_import_release_revisions" as never) as unknown as {
    select(columns: string): {
      eq(column: string, value: string | number): {
        eq(column: string, value: string | number): {
          single(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data: revision, error: revisionError } = await revisionApi
    .select("catalog_sha256,question_count,option_count,evidence")
    .eq("import_id", args.importId)
    .eq("revision", Number(active.active_revision))
    .single();
  if (
    revisionError || !revision
    || revision.catalog_sha256 !== liveCatalog
    || revision.question_count !== args.graph.questions.length
    || revision.option_count !== args.graph.answer_options.length
  ) {
    throw new Error(`Active revision evidence verification failed: ${revisionError?.message ?? "row mismatch"}`);
  }
  if (
    args.expectedClientGraphSha256
    && (revision.evidence as Record<string, unknown>)?.client_graph_sha256 !== args.expectedClientGraphSha256
  ) {
    throw new Error("Active revision is not bound to the approved client quiz graph checksum.");
  }

  const quizApi = args.client.from("quizzes") as unknown as {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
  const { data: quizzes, error: quizError } = await quizApi
    .select("id,questions_per_attempt")
    .in("id", args.graph.quizzes.map((quiz) => String(quiz.id)));
  if (
    quizError || quizzes?.length !== args.graph.quizzes.length
    || quizzes.some((quiz) => quiz.questions_per_attempt !== args.expectedQuestionsPerAttempt)
  ) {
    throw new Error(`Quiz configuration verification failed: ${quizError?.message ?? "row mismatch"}`);
  }
  return active;
}

function assertExactIds(label: string, actual: string[] | undefined, expected: string[]) {
  const left = [...(actual ?? [])].sort();
  const right = [...expected].sort();
  if (left.length !== right.length || left.some((id, index) => id !== right[index])) {
    throw new Error(`${label} identity mismatch: expected ${right.length}, received ${left.length}.`);
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for --execute.`);
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
