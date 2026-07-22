import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateCourseManifest } from "./manifest";
import { buildImportPlan } from "./operations";
import {
  buildReleasedQuizGraph,
  releasedQuizGraphSha256,
  releasedQuizRollbackConfirmation,
  releasedQuizRevisionConfirmation,
} from "./released-quiz-revision";
import {
  assertExactReleasedQuizGraph,
  assertReleasedQuizExecutionArguments,
  loadLegacyRollbackArtifact,
} from "../../../scripts/course-content/revise-released-quizzes";

describe("released quiz revision payload", () => {
  it("extracts only the exact deterministic 19/920 quiz graph", () => {
    const raw = JSON.parse(readFileSync(
      resolve("content/course-manifests/bmh-employee-training.v1.json"),
      "utf8",
    )) as unknown;
    const validated = validateCourseManifest(raw, { gate: "draft" });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error(validated.errors.join("\n"));

    const graph = buildReleasedQuizGraph(buildImportPlan(validated.value, {
      allowUnapprovedAssetPlaceholders: true,
    }));
    expect(graph.quizzes).toHaveLength(19);
    expect(graph.questions).toHaveLength(920);
    expect(graph.answer_options).toHaveLength(3678);
    expect(graph.quizzes.every((quiz) => quiz.questions_per_attempt === null)).toBe(true);
    expect(Object.keys(graph.quizzes[0]).sort()).toEqual([
      "description", "id", "max_attempts", "passing_score",
      "questions_per_attempt", "randomize_answers", "randomize_questions",
      "retake_cooldown_hours", "show_correct_answers_after", "title",
    ]);
    expect(Object.keys(graph.questions[0]).sort()).toEqual([
      "explanation", "id", "points", "question_text", "question_type", "quiz_id", "sort_order",
    ]);
    expect(Object.keys(graph.answer_options[0]).sort()).toEqual([
      "id", "is_correct", "option_text", "question_id", "sort_order",
    ]);
    expect(releasedQuizGraphSha256(graph)).toBe(
      "d2b9fc182b7ca72f76ce038eac8c5b37446ba999fce5a269699802812177c78a",
    );
    expect(graph.quizzes.map((quiz) => quiz.id)).toEqual([
      "01e25e50-1615-544e-a756-2bd21e736bbd",
      "0b5527a3-318c-5f6f-ad08-8d03a9cf7b61",
      "17a136bc-ffad-5adf-ab16-9a27cc4a1d74",
      "2e07e5ff-be7d-530c-a79f-29aa7044eebb",
      "36f20817-00c0-519b-af8c-6906fb5fef63",
      "4991ddaa-15c1-5f7b-ad07-e547a314a82f",
      "4b480002-ef1f-5dfc-ab08-27bdcfbc290b",
      "52d8e3b9-b747-59a6-af09-919786520d4b",
      "5c9cede8-b887-59de-a44a-5fb2c199ba09",
      "6405c327-6230-5c78-a755-6277c0cf3d74",
      "72c1151b-5537-5961-a79c-c1e3d046743a",
      "7c37b18c-ced1-509f-a85f-6125090a3740",
      "7ec7965e-75e6-557c-a88a-bd2a73621bb7",
      "8cf76876-d2bb-538c-a9e5-be6cee7ef54f",
      "8d2c7383-b68d-5c9a-aa37-caae01f30768",
      "91593194-2681-50c3-a1f3-84469510e975",
      "94d6d553-d098-5f0d-a610-cea2464c84a1",
      "a539f1af-279c-5131-afb9-4d99085b0a9b",
      "aac31633-7a15-5eda-a20a-17e6cd077195",
    ]);
    const countsByQuiz = new Map<string, number>();
    for (const question of graph.questions) {
      const quizId = String(question.quiz_id);
      countsByQuiz.set(quizId, (countsByQuiz.get(quizId) ?? 0) + 1);
    }
    expect(graph.quizzes.map((quiz) => countsByQuiz.get(String(quiz.id)))).toEqual([
      44, 51, 73, 38, 76, 57, 70, 32, 30, 50, 59, 39, 47, 48, 42, 40, 51, 36, 37,
    ]);
  });

  it("builds the exact compare-and-swap confirmation", () => {
    expect(releasedQuizRevisionConfirmation({
      importId: "bmh-employee-training-v1",
      priorManifestSha256: "a".repeat(64),
      manifestSha256: "b".repeat(64),
    })).toBe(
      `REVISE-RELEASED-QUIZZES:bmh-employee-training-v1:${"a".repeat(64)}:${"b".repeat(64)}:19:920`,
    );
  });

  it("refuses a non-920 graph and any restored attempt cap", () => {
    const raw = JSON.parse(readFileSync(
      resolve("content/course-manifests/bmh-employee-training.v1.json"),
      "utf8",
    )) as unknown;
    const validated = validateCourseManifest(raw, { gate: "draft" });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const plan = buildImportPlan(validated.value, {
      allowUnapprovedAssetPlaceholders: true,
    });

    const missingQuestion = structuredClone(plan);
    const questionIndex = missingQuestion.operations.findIndex((operation) =>
      operation.table === "questions"
    );
    missingQuestion.operations.splice(questionIndex, 1);
    expect(() => buildReleasedQuizGraph(missingQuestion)).toThrow(/exactly 19 quizzes and 920 questions/i);

    const capped = structuredClone(plan);
    const quiz = capped.operations.find((operation) => operation.table === "quizzes");
    if (!quiz) throw new Error("quiz operation missing");
    quiz.row.questions_per_attempt = 10;
    expect(() => buildReleasedQuizGraph(capped)).toThrow(/questions_per_attempt=null/i);
  });

  it("builds the exact rollback compare-and-swap confirmation", () => {
    expect(releasedQuizRollbackConfirmation({
      importId: "bmh-employee-training-v1",
      expectedRevision: 2,
      manifestSha256: "b".repeat(64),
      priorManifestSha256: "a".repeat(64),
      rollbackSha256: "c".repeat(64),
    })).toBe(
      `ROLLBACK-RELEASED-QUIZZES:bmh-employee-training-v1:2:${"b".repeat(64)}:${"a".repeat(64)}:${"c".repeat(64)}`,
    );
  });

  it("keeps forward and rollback confirmation gates mutually reachable", () => {
    expect(() => assertReleasedQuizExecutionArguments({
      command: "apply",
      confirm: "wrong",
      manifestSha256: "a".repeat(64),
      rollbackArtifact: "legacy.json",
    })).toThrow(/exact manifest SHA-256/i);
    expect(() => assertReleasedQuizExecutionArguments({
      command: "rollback",
      confirm: "ROLLBACK-RELEASED-QUIZZES:bmh-employee-training-v1:2:current:prior:artifact",
      manifestSha256: "a".repeat(64),
      rollbackArtifact: "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
    })).not.toThrow();
    expect(() => assertReleasedQuizExecutionArguments({
      command: "verify",
      manifestSha256: "a".repeat(64),
    })).not.toThrow();
  });

  it("requires the rollback artifact for every mutating rollback", () => {
    expect(() => assertReleasedQuizExecutionArguments({
      command: "rollback",
      confirm: "ROLLBACK-RELEASED-QUIZZES:anything",
      manifestSha256: "a".repeat(64),
    })).toThrow(/rollback-artifact/i);
  });

  it("binds apply and rollback to the exact archived legacy manifest", async () => {
    const artifact = await loadLegacyRollbackArtifact({
      rollbackArtifact: "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
      expectedImportId: "bmh-employee-training-v1",
      expectedManifestSha256: "71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c",
    });
    expect(artifact.graph.quizzes).toHaveLength(19);
    expect(artifact.graph.questions).toHaveLength(342);
    expect(artifact.graph.answer_options).toHaveLength(1292);
    expect(artifact.graph.quizzes.every((quiz) => quiz.questions_per_attempt === 10)).toBe(true);
    expect(() => assertExactReleasedQuizGraph(
      artifact.graph,
      structuredClone(artifact.graph),
      "fixture",
    )).not.toThrow();
    const drifted = structuredClone(artifact.graph);
    drifted.questions[0].question_text = `${drifted.questions[0].question_text} drift`;
    expect(() => assertExactReleasedQuizGraph(artifact.graph, drifted, "fixture")).toThrow(
      /differs from the exact rollback artifact/i,
    );
    const missing = structuredClone(artifact.graph);
    missing.answer_options.pop();
    expect(() => assertExactReleasedQuizGraph(artifact.graph, missing, "fixture")).toThrow(
      /answer_options identity mismatch/i,
    );
    await expect(loadLegacyRollbackArtifact({
      rollbackArtifact: "content/course-manifests/bmh-employee-training.v1.json",
      expectedImportId: "bmh-employee-training-v1",
    })).rejects.toThrow(/must be content\/course-manifests\/archive/i);
    await expect(loadLegacyRollbackArtifact({
      rollbackArtifact: "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
      expectedImportId: "bmh-employee-training-v1",
      expectedManifestSha256: "0".repeat(64),
    })).rejects.toThrow(/does not match the exact prior release manifest/i);
  });
});
