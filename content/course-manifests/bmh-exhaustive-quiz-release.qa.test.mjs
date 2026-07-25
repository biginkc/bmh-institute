import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildManifest } from "../../scripts/course-content/build-manifest.mjs";
import { validateManifest } from "../../scripts/course-content/validate-manifest.mjs";

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

// The tracked manifest is the source-driven build PLUS the live, human-verified
// Closer Lab production binding: a fresh buildManifest() always emits pending:*
// placeholders for role-play scenario_id, since that binding only exists after
// the finalizer runs against a real production Supabase project. To prove the
// source-driven parts of the build are still byte-reproducible, apply the same
// production IDs the finalizer bound, then compare exactly -- this still fails
// closed on any other drift.
//
// Deliberately NOT sourced from closer-lab-production-mapping.json itself: a
// hand-edited manifest+ledger pair would trivially satisfy a test that just
// copies IDs from the ledger being tested. Instead this reads
// closer-lab-production-mapping-reconciliation.json -- evidence from a real,
// independent live fetch against Closer Lab production (course:reconcile:closer-lab)
// -- and first proves its manifest_sha256/mapping_ledger_sha256 pins match the
// CURRENT tracked files byte-for-byte, so a post-reconciliation hand edit to
// either file breaks this check before it ever reaches the ID comparison.
async function applyCheckedInProductionBindings(manifest) {
  const [manifestBytes, ledgerBytes, reconciliationBytes] = await Promise.all([
    readFile(path.join(ROOT, "content/course-manifests/bmh-employee-training.v1.json")),
    readFile(path.join(ROOT, "docs/course-production/closer-lab-production-mapping.json")),
    readFile(path.join(ROOT, "docs/course-production/closer-lab-production-mapping-reconciliation.json"), "utf8"),
  ]);
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  const reconciliation = JSON.parse(reconciliationBytes);
  assert.equal(reconciliation.status, "passed");
  assert.equal(reconciliation.exact, true);
  assert.equal(ledger.status, "finalized");
  assert.equal(
    createHash("sha256").update(manifestBytes).digest("hex"),
    reconciliation.manifest_sha256,
    "the tracked manifest has not drifted from its last live Closer Lab reconciliation",
  );
  assert.equal(
    createHash("sha256").update(ledgerBytes).digest("hex"),
    reconciliation.mapping_ledger_sha256,
    "the tracked mapping ledger has not drifted from its last live Closer Lab reconciliation",
  );
  const records = new Map(reconciliation.bindings.map((record) => [record.block_source_key, record]));
  let bound = 0;
  for (const course of manifest.program.courses) {
    for (const courseModule of course.modules) {
      for (const lesson of courseModule.lessons) {
        for (const block of lesson.blocks ?? []) {
          if (block.type !== "role_play") continue;
          const record = records.get(block.source_key);
          assert.ok(record, `${block.source_key} has a live-reconciled production binding`);
          assert.match(block.content.scenario_id, /^pending:/);
          block.content.scenario_id = record.production_scenario_id;
          bound += 1;
        }
      }
    }
  }
  assert.equal(bound, 6);
}

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
  assert.match(
    validateManifest(manifest).errors.join("\n"),
    /legacy embedded 342-question graph is archive-only/i,
  );
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

test("the normal manifest builder reproduces the exhaustive active manifest", async (t) => {
  try {
    await access("/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lessonA/LESSON-1A-v7.mp4");
  } catch (error) {
    if (error?.code === "ENOENT") {
      t.skip("canonical course media is not present on this runner");
      return;
    }
    throw error;
  }
  const tracked = await readFile(ACTIVE_MANIFEST_PATH, "utf8");
  const rebuilt = await buildManifest();
  await applyCheckedInProductionBindings(rebuilt);

  assert.equal(
    `${JSON.stringify(rebuilt, null, 2).replaceAll("\u2014", "-")}\n`,
    tracked,
  );
});

test("the committed database rehearsal evidence matches the current generated SQL", async () => {
  const evidence = JSON.parse(await readFile(path.join(
    ROOT,
    "docs/course-production/released-quiz-revision-rehearsal-2026-07-22.json",
  ), "utf8"));
  const result = spawnSync(
    path.join(ROOT, "node_modules/.bin/tsx"),
    ["scripts/course-content/build-released-quiz-revision-rehearsal-sql.ts"],
    { cwd: ROOT, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  // The current generator output is proven byte-reproducible, but this does
  // NOT claim it was executed live -- that claim lives only on
  // last_verified_live_execution, a frozen historical record against the
  // prior (pre-role-play) SQL. See regenerated_note for why the delta between
  // the two generated_sql_sha256 values is expected and inert.
  assert.equal(sha256(result.stdout), evidence.current_generated_sql_sha256);
  assert.equal(evidence.current_generation_status, "regenerated_not_yet_executed_live");
  assert.notEqual(
    evidence.current_generated_sql_sha256,
    evidence.last_verified_live_execution.generated_sql_sha256,
    "sanity: this test only has teeth while the two really differ",
  );

  const execution = evidence.last_verified_live_execution;
  assert.equal(execution.status, "passed");
  assert.equal(execution.target.transaction_rolled_back, true);
  assert.deepEqual(evidence.ci_contract.postgres_versions, ["15", "16", "17"]);
  for (const refusal of [
    "forward confirmation mismatch",
    "stale compare-and-swap prior manifest",
    "drifted legacy questions_per_attempt graph",
    "completed learner attempt",
    "release revision update",
    "release revision delete",
    "rollback with reviewer-authored answer-option evidence",
    "second rollback",
  ]) {
    assert.ok(execution.verified_refusals.includes(refusal), refusal);
  }

  // Mechanical proof (not just prose) that the quiz-revision graph the
  // executed SQL depends on cannot be affected by role_play content: the
  // builder it depends on has no role_play awareness at all.
  const releasedQuizRevisionSource = await readFile(
    path.join(ROOT, "src/lib/course-import/released-quiz-revision.ts"),
    "utf8",
  );
  assert.doesNotMatch(releasedQuizRevisionSource, /role_play/i);
});
