import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildManifest } from "../../scripts/course-content/build-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ACTIVE_MANIFEST_PATH = path.join(
  ROOT,
  "content/course-manifests/bmh-employee-training.v1.json",
);
const LEGACY_MANIFEST_PATH = path.join(
  ROOT,
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.v1.json",
);
const LEGACY_METADATA_PATH = path.join(
  ROOT,
  "content/course-manifests/archive/bmh-employee-training.legacy-release-20260721.metadata.json",
);
const QUESTION_BANK_PATH = path.join(
  ROOT,
  "content/quiz-generation/question-bank.v1.json",
);
const LEGACY_MANIFEST_SHA256 =
  "71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c";

function quizzes(manifest) {
  return manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .filter((lesson) => lesson.type === "quiz")
    .map((lesson) => lesson.quiz);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("the exact released 342-question manifest is archived outside the active import path", async () => {
  const [bytes, metadata, bankBytes] = await Promise.all([
    readFile(LEGACY_MANIFEST_PATH),
    readFile(LEGACY_METADATA_PATH, "utf8").then(JSON.parse),
    readFile(QUESTION_BANK_PATH),
  ]);
  const manifest = JSON.parse(bytes.toString("utf8"));
  const legacyQuizzes = quizzes(manifest);

  assert.equal(sha256(bytes), LEGACY_MANIFEST_SHA256);
  assert.equal(manifest.quiz_bank_ref, undefined);
  assert.equal(legacyQuizzes.length, 19);
  assert.equal(
    legacyQuizzes.reduce((total, quiz) => total + quiz.questions.length, 0),
    342,
  );
  assert.ok(legacyQuizzes.every((quiz) => quiz.questions_per_attempt === 10));
  assert.equal(metadata.manifest_sha256, LEGACY_MANIFEST_SHA256);
  assert.equal(metadata.superseded_by.question_bank_sha256, sha256(bankBytes));
});

test("the sole active full manifest is the approved exhaustive 920-question bank", async () => {
  const [manifestBytes, bankBytes] = await Promise.all([
    readFile(ACTIVE_MANIFEST_PATH),
    readFile(QUESTION_BANK_PATH),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const bank = JSON.parse(bankBytes.toString("utf8"));
  const activeQuizzes = quizzes(manifest);
  const bankBySlot = new Map(bank.slots.map((slot) => [slot.slot, slot]));

  assert.deepEqual(manifest.quiz_bank_ref, {
    path: "content/quiz-generation/question-bank.v1.json",
    sha256: sha256(bankBytes),
  });
  assert.equal(activeQuizzes.length, 19);
  assert.equal(
    activeQuizzes.reduce((total, quiz) => total + quiz.questions.length, 0),
    920,
  );
  assert.ok(activeQuizzes.every((quiz) => quiz.approval_status === "approved"));
  assert.ok(activeQuizzes.every((quiz) => quiz.questions_per_attempt === null));

  for (const quiz of activeQuizzes) {
    const slot = Number(quiz.source_key.replace("quiz-slot-", ""));
    const bankSlot = bankBySlot.get(slot);
    assert.ok(bankSlot, `${quiz.source_key} has a question-bank slot`);
    assert.equal(quiz.questions.length, bankSlot.generated_count);
  }

  const humanizing = activeQuizzes.find(
    (quiz) => quiz.title === "Humanizing the Lead Checkpoint",
  );
  assert.equal(humanizing.questions.length, 70);
  assert.equal(humanizing.questions_per_attempt, null);
});

test("only one top-level manifest can import the BMH employee training release", async () => {
  const manifestDirectory = path.join(ROOT, "content/course-manifests");
  const candidates = [];
  for (const name of await readdir(manifestDirectory)) {
    if (!name.endsWith(".json")) continue;
    const absolutePath = path.join(manifestDirectory, name);
    try {
      const parsed = JSON.parse(await readFile(absolutePath, "utf8"));
      if (parsed.import_id === "bmh-employee-training-v1" && parsed.program?.courses) {
        candidates.push(name);
      }
    } catch {
      // Non-manifest JSON files are outside this identity check.
    }
  }
  assert.deepEqual(candidates, ["bmh-employee-training.v1.json"]);
});

test("the normal manifest builder reproduces the exhaustive active manifest", async () => {
  const tracked = await readFile(ACTIVE_MANIFEST_PATH, "utf8");
  const rebuilt = await buildManifest();

  assert.equal(
    `${JSON.stringify(rebuilt, null, 2).replaceAll("\u2014", "-")}\n`,
    tracked,
  );
});
