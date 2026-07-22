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
    expect(releasedQuizGraphSha256(graph)).toMatch(/^[a-f0-9]{64}$/);
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

  it("builds the exact rollback compare-and-swap confirmation", () => {
    expect(releasedQuizRollbackConfirmation({
      importId: "bmh-employee-training-v1",
      expectedRevision: 2,
      manifestSha256: "b".repeat(64),
      priorManifestSha256: "a".repeat(64),
    })).toBe(
      `ROLLBACK-RELEASED-QUIZZES:bmh-employee-training-v1:2:${"b".repeat(64)}:${"a".repeat(64)}`,
    );
  });
});
