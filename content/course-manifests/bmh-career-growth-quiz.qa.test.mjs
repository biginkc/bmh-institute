import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadManifest,
  validateCareerGrowthAssessment,
  validateManifest,
} from "../../scripts/course-content/validate-manifest.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const STACK_CONFIRMATION_URL = new URL(
  "./bmh-operating-stack-confirmation.v1.json",
  import.meta.url,
);

function lessons(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons);
}

function careerQuiz(manifest) {
  return lessons(manifest).find(
    (lesson) => lesson.source_key === "lesson-quiz-slot-19",
  ).quiz;
}

test("Career Growth uses the locked 18-question role-agnostic pool", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const quiz = careerQuiz(manifest);
  const typeCounts = Object.groupBy(
    quiz.questions,
    (question) => question.question_type,
  );

  assert.equal(quiz.questions.length, 18);
  assert.equal(quiz.questions_per_attempt, 10);
  assert.equal(quiz.passing_score, 80);
  assert.equal(quiz.randomize_questions, true);
  assert.equal(quiz.randomize_answers, true);
  assert.equal(typeCounts.single_choice.length, 10);
  assert.equal(typeCounts.multi_select.length, 4);
  assert.equal(typeCounts.true_false.length, 4);
  assert.equal(
    new Set(quiz.questions.map((question) => question.question_text.trim().toLowerCase())).size,
    18,
  );
  assert.deepEqual(validateCareerGrowthAssessment(quiz), []);
});

test("every Career Growth flashcard is derived from the compliant quiz source", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const quiz = careerQuiz(manifest);
  const contentLesson = lessons(manifest).find(
    (lesson) => lesson.source_key === "lesson-content-slot-19",
  );
  const flashcards = contentLesson.blocks.find(
    (block) => block.source_key === "block-flashcards-slot-19",
  ).content.cards;

  assert.deepEqual(
    flashcards,
    quiz.questions.slice(0, 8).map((question) => ({
      front: question.question_text,
      back: question.options
        .filter((option) => option.is_correct)
        .map((option) => option.option_text)
        .join("; "),
    })),
  );
});

test("Career Growth QA fails closed on role ladders and outcome promises", async () => {
  const [manifest, stackConfirmation] = await Promise.all([
    loadManifest(MANIFEST_URL),
    loadManifest(STACK_CONFIRMATION_URL),
  ]);
  const forbiddenClaims = [
    "Promotion is guaranteed after six months on the role ladder.",
    "Readiness requires hitting daily numbers for 90-plus days.",
    "High performers receive first consideration and higher earnings.",
    "A closer path carries a pay increase and commission.",
    "A manager owns the entire team's performance.",
    "The role has a fixed daily quota.",
  ];

  for (const claim of forbiddenClaims) {
    const mutated = structuredClone(manifest);
    careerQuiz(mutated).questions[0].explanation = claim;
    const directIssues = validateCareerGrowthAssessment(careerQuiz(mutated));
    assert.ok(
      directIssues.some((issue) =>
        issue.includes("stale role-ladder or outcome promise"),
      ),
      claim,
    );
    assert.ok(
      validateManifest(mutated, { stackConfirmation }).errors.some((issue) =>
        issue.includes("stale role-ladder or outcome promise"),
      ),
      claim,
    );
  }
});

test("Career Growth QA rejects a question without a lesson-grounded answer", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const mutatedQuiz = structuredClone(careerQuiz(manifest));
  const question = mutatedQuiz.questions[0];
  question.explanation = "Memorize the selected response.";
  question.options = question.options.map((option, index) => ({
    ...option,
    option_text: index === 0 ? "Selected response" : `Alternative ${index}`,
  }));

  assert.ok(
    validateCareerGrowthAssessment(mutatedQuiz).some((issue) =>
      issue.includes("not grounded in the locked Career Growth lesson concepts"),
    ),
  );
});
