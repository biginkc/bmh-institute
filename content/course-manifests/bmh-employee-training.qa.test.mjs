import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  loadManifest,
  STALE_FIXED_KPI_PATTERN,
  STALE_ROLE_BOUND_COURSE_PATTERN,
  summarizeManifest,
  validateManifest,
} from "../../scripts/course-content/validate-manifest.mjs";
import { normalizeRoleAgnosticCourseText } from "../../scripts/course-content/build-manifest.mjs";
import { UUID_PATTERN } from "../../scripts/course-content/closer-lab-production-mapping.mjs";

const MANIFEST_URL = new URL(
  "./bmh-employee-training.v1.json",
  import.meta.url,
);
const STACK_CONFIRMATION_URL = new URL(
  "./bmh-operating-stack-confirmation.v1.json",
  import.meta.url,
);
const VIDEO_ZERO_CAPTION_URL = new URL(
  "../../course-assets/captions/video-slot-01-welcome.vtt",
  import.meta.url,
);
const VIDEO_ZERO_TRANSCRIPT_URL = new URL(
  "../../docs/course-production/video-zero-release-2026-07-30/transcript.txt",
  import.meta.url,
);
const VIDEO_ZERO_CAPTION_EVIDENCE_URL = new URL(
  "../../docs/course-production/caption-evidence/video-zero-caption-validation-2026-07-30.json",
  import.meta.url,
);
const VIDEO_ZERO_TRANSCRIPT_BINDING_URL = new URL(
  "../../docs/course-production/video-zero-release-2026-07-30/transcript-binding.json",
  import.meta.url,
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSpokenText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function captionSpokenText(value) {
  return value
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .slice(1)
    .map((block) =>
      block
        .split("\n")
        .filter(
          (line) =>
            line.trim() &&
            !/^\d+$/.test(line.trim()) &&
            !/^\d{2}:\d{2}:\d{2}\.\d{3} --> /.test(line),
        )
        .join(" "),
    )
    .join(" ");
}

test("Video Zero caption text is checksum-bound to the verified transcript", async () => {
  const [caption, transcript, evidenceBytes] = await Promise.all([
    readFile(VIDEO_ZERO_CAPTION_URL, "utf8"),
    readFile(VIDEO_ZERO_TRANSCRIPT_URL),
    readFile(VIDEO_ZERO_CAPTION_EVIDENCE_URL, "utf8"),
  ]);
  const evidence = JSON.parse(evidenceBytes);
  const record = evidence.records.find(
    (candidate) => candidate.video_source_key === "video-slot-01-welcome",
  );
  assert.ok(record);
  assert.equal(record.transcript_sha256, null);
  assert.equal(
    sha256(transcript),
    "c5b4ec1c6756206f0ccde04ba2353f2d2566c8185ffa402f40339eef3c3d64ed",
  );
  assert.equal(
    evidence.technical_qa.caption_text_matches_verified_transcript,
    true,
  );
  assert.equal(
    normalizeSpokenText(captionSpokenText(caption)),
    normalizeSpokenText(transcript.toString("utf8")),
  );
});

test("Video Zero release independently binds the approved master, caption, and verified transcript", async () => {
  const binding = JSON.parse(
    await readFile(VIDEO_ZERO_TRANSCRIPT_BINDING_URL, "utf8"),
  );
  assert.deepEqual(binding, {
    schema_version: 1,
    video_source_key: "video-slot-01-welcome",
    video_sha256:
      "06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b",
    caption_sha256:
      "bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939",
    transcript_sha256:
      "c5b4ec1c6756206f0ccde04ba2353f2d2566c8185ffa402f40339eef3c3d64ed",
    verified_phrase: "Solve the problem, and the profit follows. Every time.",
    approved_by: "Jarrad Henry",
    approved_at: "2026-07-30",
  });
});

test("the draft contains the locked course structure", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const summary = summarizeManifest(manifest);

  assert.deepEqual(summary, {
    modules: 6,
    contentLessons: 19,
    quizLessons: 19,
    assignmentLessons: 6,
    videos: 29,
    quizQuestions: 920,
    flashcards: 152,
    rolePlays: 20,
    posterAssets: 29,
    posterReferences: 29,
    guideAssets: 19,
    guideBlocks: 19,
  });
});

test("learner-authored course text removes stale learner seats without rewriting real pipeline roles", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const serializedProgram = JSON.stringify(manifest.program);
  assert.doesNotMatch(serializedProgram, STALE_ROLE_BOUND_COURSE_PATTERN);
  assert.match(serializedProgram, /Closer Lab/);
  assert.match(serializedProgram, /block-role-play-/);
  assert.match(serializedProgram, /acquisition manager/i);
  assert.match(serializedProgram, /transaction team/i);

  assert.equal(
    normalizeRoleAgnosticCourseText(
      "The Navigator briefs the acquisition manager and the transaction coordinator.",
    ),
    "The Representative briefs the acquisition manager and the transaction coordinator.",
  );
  assert.equal(
    normalizeRoleAgnosticCourseText(
      "How does an SDR's work support Closer Lab?",
    ),
    "How does a representative's work support Closer Lab?",
  );
  assert.equal(
    normalizeRoleAgnosticCourseText(
      "Navigators, virtual onboarding specialists, lead sourcing specialists, lead generators, and SDRs follow the current SOP.",
    ),
    "Representatives, onboarding support, representatives, representatives, and representatives follow the current SOP.",
  );

  const questions = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.quiz?.questions ?? []);
  const stageFourBrief = questions.find(
    (question) =>
      question.question_text ===
      "What must the representative brief the acquisition manager on during Stage 4?",
  );
  assert.ok(
    stageFourBrief,
    "the Stage 4 brief names the representative as the actor",
  );
  assert.equal(
    stageFourBrief.explanation,
    "The seller's situation, expectations, and 'hot buttons'.",
  );

  const postContractOwner = questions.find(
    (question) =>
      question.question_text ===
      "Which team manages the deal once the contract has been signed?",
  );
  assert.ok(
    postContractOwner,
    "the post-contract team question remains in the quiz pool",
  );
  assert.deepEqual(
    postContractOwner.options
      .filter((option) => option.is_correct)
      .map((option) => option.option_text),
    ["The transaction team."],
  );

  const stale = structuredClone(manifest);
  stale.program.courses[0].modules[0].lessons[0].blocks[0].content.html +=
    "<p>The Navigator owns this step.</p>";
  assert.ok(
    validateManifest(stale).errors.some(
      (error) =>
        error.includes("Stale named-role wording detected") &&
        error.includes("Navigator"),
    ),
  );

  for (const stalePlural of [
    "Navigators",
    "virtual onboarding specialists",
    "lead sourcing specialists",
    "lead sourcing seats",
    "lead generators",
    "SDRs",
  ]) {
    const pluralManifest = structuredClone(manifest);
    pluralManifest.program.courses[0].modules[0].lessons[0].blocks[0].content.html += `<p>${stalePlural} own this step.</p>`;
    assert.ok(
      validateManifest(pluralManifest).errors.some((error) =>
        error.includes("Stale named-role wording detected"),
      ),
      `${stalePlural} must remain publication-invalid`,
    );
  }
});

test("every video has its own release-gated poster asset", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const assetsByKey = new Map(
    manifest.assets.map((asset) => [asset.source_key, asset]),
  );
  const videos = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "video");

  assert.equal(videos.length, 29);
  assert.equal(
    new Set(videos.map((block) => block.content.poster_asset_key)).size,
    29,
  );
  for (const video of videos) {
    const poster = assetsByKey.get(video.content.poster_asset_key);
    assert.ok(poster, `${video.source_key} poster is inventoried`);
    assert.equal(poster.kind, "image");
    assert.match(poster.source_key, /^poster-video-slot-/);
    assert.ok(["approved", "missing"].includes(poster.approval_status));
  }
});

test("every grouped lesson has one accessible guide download that cannot block completion", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const assetsByKey = new Map(
    manifest.assets.map((asset) => [asset.source_key, asset]),
  );
  const contentLessons = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.type === "content");

  assert.equal(contentLessons.length, 19);
  for (const lesson of contentLessons) {
    const guides = lesson.blocks.filter(
      (block) =>
        block.type === "download" &&
        /^block-guide-pdf-slot-/.test(block.source_key),
    );
    assert.equal(
      guides.length,
      1,
      `${lesson.source_key} has one guide download`,
    );
    assert.equal(guides[0].required, false);
    const guide = assetsByKey.get(guides[0].content.asset_key);
    assert.ok(guide, `${lesson.source_key} guide is inventoried`);
    assert.equal(guide.kind, "pdf");
    assert.equal(guides[0].content.file_path, guide.storage_path);
    assert.ok(["approved", "missing"].includes(guide.approval_status));
  }
});

test("all six reviewed assignments carry usable reviewer rubrics", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const assignments = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.type === "assignment")
    .map((lesson) => lesson.assignment);

  assert.equal(assignments.length, 6);
  for (const assignment of assignments) {
    assert.equal(assignment.requires_review, true);
    assert.ok(
      assignment.rubric.length >= 3,
      `${assignment.source_key} has reviewer criteria`,
    );
    for (const item of assignment.rubric) {
      assert.ok(
        item.criterion.trim(),
        `${assignment.source_key} criterion has a name`,
      );
      assert.ok(
        item.description.trim(),
        `${assignment.source_key} criterion has guidance`,
      );
    }
  }
});

// Assessment coverage is counted against the 19 instructional lessons, NOT
// against the 44 required course rows that drive overall course completion
// (19 content + 19 quiz + 6 assignment). Both denominators are correct; they
// answer different questions. This test owns the 19 one: every instructional
// lesson ends in a spoken check, either a frozen sales role-play
// (block-role-play-*) or an Andrea Oral Check (block-oral-check-*). Objection
// Architecture and Objection Scripts Playbook were the last two lessons with
// no assessment of any kind; this locks the gap closed.
test("every instructional lesson ends in a voice check -- 19 of 19, no lesson left unassessed", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const contentLessons = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.type === "content");

  assert.equal(contentLessons.length, 19);
  for (const lesson of contentLessons) {
    const voiceChecks = (lesson.blocks ?? []).filter(
      (block) => block.type === "role_play",
    );
    assert.ok(
      voiceChecks.length >= 1,
      `${lesson.source_key} (${lesson.title}) has no role-play voice check`,
    );
    assert.ok(
      voiceChecks.every((block) => block.required === true),
      `${lesson.source_key} voice checks are all required for completion`,
    );
    assert.ok(
      voiceChecks.every((block) =>
        UUID_PATTERN.test(block.content.scenario_id),
      ),
      `${lesson.source_key} voice checks bind real production scenario UUIDs`,
    );
  }

  const oralChecks = contentLessons
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.source_key.startsWith("block-oral-check-"));
  assert.equal(
    oralChecks.length,
    14,
    "3 pilot + 9 expansion + 2 objection Andrea Oral Checks",
  );
  assert.ok(
    oralChecks.every((block) => block.content.mode === "oral_check"),
    "every block-oral-check-* block renders in oral_check mode",
  );
  assert.equal(
    new Set(oralChecks.map((block) => block.content.scenario_id.toLowerCase()))
      .size,
    14,
    "no two oral checks share a Closer Lab scenario",
  );

  // The two blocks this coverage gap was closed with, pinned to the same
  // lesson/scenario pairing the production migration inserts.
  const byLesson = new Map(
    contentLessons.map((lesson) => [
      lesson.source_key,
      (lesson.blocks ?? []).filter((block) => block.type === "role_play"),
    ]),
  );
  assert.deepEqual(
    byLesson
      .get("lesson-content-slot-09")
      .map((block) => [
        block.source_key,
        block.content.scenario_id,
        block.sort_order,
      ]),
    [["block-oral-check-slot-09", "c3642915-deab-4b3d-9479-0fc71afee9e6", 6]],
  );
  assert.deepEqual(
    byLesson
      .get("lesson-content-slot-10")
      .map((block) => [
        block.source_key,
        block.content.scenario_id,
        block.sort_order,
      ]),
    [["block-oral-check-slot-10", "c164bec1-fb24-46c7-8790-7ea3bf2fb7fb", 6]],
  );
});

test("the current release includes the six production-bound Closer Lab interactive scenarios", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const modules = manifest.program.courses.flatMap((course) => course.modules);
  // Scoped to the frozen sales-role-play chain (block-role-play-*) only --
  // matches rolePlayBindings() in closer-lab-production-mapping.mjs. The 3
  // Andrea Oral Check pilot blocks (block-oral-check-*, PR #130) are a
  // deliberately separate, structurally different Closer Lab namespace with
  // no equivalent production export RPC yet; they are covered by their own
  // test in oral-check-pilot-exact-reconciliation.test.ts and
  // oral-check-pilot-production-attestation.qa.test.mjs.
  const rolePlays = modules
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter(
      (block) =>
        block.type === "role_play" &&
        block.source_key.startsWith("block-role-play-"),
    );

  assert.equal(rolePlays.length, 6);
  assert.ok(rolePlays.every((block) => block.required === true));
  assert.ok(
    rolePlays.every((block) => UUID_PATTERN.test(block.content.scenario_id)),
    "every role-play block is bound to a real production scenario UUID",
  );
  assert.equal(
    new Set(rolePlays.map((block) => block.content.scenario_id.toLowerCase()))
      .size,
    6,
    "all six production scenario IDs are unique",
  );
  assert.doesNotMatch(JSON.stringify(manifest.program), /pending:[a-z0-9-]+/i);
});

test("a malformed or duplicated production scenario ID is a publication blocker, not a pass", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const rolePlayBlocks = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "role_play" && block.required === true);

  const malformed = structuredClone(manifest);
  const malformedBlocks = malformed.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "role_play" && block.required === true);
  malformedBlocks[0].content.scenario_id = "-".repeat(36);
  assert.ok(
    validateManifest(malformed).publicationBlockers.some(
      (blocker) =>
        blocker.includes(malformedBlocks[0].source_key) &&
        blocker.includes("not a valid production UUID"),
    ),
  );

  const duplicated = structuredClone(manifest);
  const duplicatedBlocks = duplicated.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "role_play" && block.required === true);
  duplicatedBlocks[1].content.scenario_id =
    duplicatedBlocks[0].content.scenario_id;
  assert.ok(
    validateManifest(duplicated).errors.some((error) =>
      error.includes("Duplicate role-play production scenario ID"),
    ),
  );
  assert.ok(
    rolePlayBlocks.length === 20,
    "sanity: fixture still has twenty role-play blocks to mutate (6 frozen sales role-plays + 14 Andrea Oral Check blocks: 3 pilot + 9 expansion + 2 objection)",
  );
});

test("marking a role-play block optional does not exempt it from scenario trust checks", async () => {
  const manifest = await loadManifest(MANIFEST_URL);

  // Making all six optional is a structural error on the canonical release,
  // independent of scenario-ID validity, so a builder regression can't
  // silently ship a manifest where every role-play block escapes production
  // binding checks just by flipping `required`.
  const allOptional = structuredClone(manifest);
  for (const course of allOptional.program.courses)
    for (const courseModule of course.modules)
      for (const lesson of courseModule.lessons)
        for (const block of lesson.blocks ?? []) {
          if (block.type === "role_play") block.required = false;
        }
  assert.ok(
    validateManifest(allOptional).errors.some((error) =>
      error.includes(
        "Every role-play block in the canonical BMH release must be required",
      ),
    ),
  );

  // A single optional block with a garbage scenario_id must still be
  // rejected on its own scenario-ID validity, not silently pass because
  // it's optional.
  const oneOptionalGarbage = structuredClone(manifest);
  const target = oneOptionalGarbage.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .find((block) => block.type === "role_play");
  target.required = false;
  target.content.scenario_id = "not-a-uuid";
  const report = validateManifest(oneOptionalGarbage);
  assert.ok(
    report.publicationBlockers.some(
      (blocker) =>
        blocker.includes(target.source_key) &&
        blocker.includes("not a valid production UUID"),
    ),
  );
});

test("the manifest passes structural and semantic content QA", async () => {
  const [manifest, stackConfirmation] = await Promise.all([
    loadManifest(MANIFEST_URL),
    loadManifest(STACK_CONFIRMATION_URL),
  ]);
  const report = validateManifest(manifest, { stackConfirmation });

  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.publicationBlockers, []);
  assert.equal(
    report.publicationBlockers.filter((blocker) =>
      blocker.includes("pending Jarrad approval"),
    ).length,
    0,
  );
  assert.equal(
    report.publicationBlockers.filter((blocker) =>
      blocker.includes("requires a policy-safe replacement cut"),
    ).length,
    0,
  );
  assert.ok(
    report.publicationBlockers.every(
      (blocker) => !blocker.includes("DialPad references"),
    ),
  );
  assert.ok(
    report.warnings.some((warning) =>
      warning.includes("DialPad employee workflow confirmation"),
    ),
  );
});

test("a reintroduced required Closer Lab block remains publication-blocked", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const rolePlay = {
    source_key: "block-role-play-deferred-test",
    type: "role_play",
    sort_order: 99,
    required: true,
    content: {
      scenario_id: "  PeNdInG :replacement  ",
      scenario_spec: {
        assignment_source_key: "assignment-section-3",
        context: "Deferred test context",
        learner_goal: "Deferred test goal",
        success_criteria: ["one", "two", "three", "four"],
        fail_conditions: ["one", "two", "three"],
      },
    },
  };
  manifest.program.courses[0].modules[0].lessons[0].blocks.push(rolePlay);

  const report = validateManifest(manifest);
  assert.ok(
    report.publicationBlockers.includes(
      `${rolePlay.source_key} needs a production Closer Lab scenario ID`,
    ),
  );
});

test("directly approved exact cuts are immutable and never replaced by older files", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const approvedKpis = manifest.assets.find(
    (asset) => asset.source_key === "video-slot-16-kpis",
  );
  assert.deepEqual(
    {
      approval_status: approvedKpis?.approval_status,
      local_path: approvedKpis?.local_path,
      checksum_sha256: approvedKpis?.checksum_sha256,
      size_bytes: approvedKpis?.size_bytes,
    },
    {
      approval_status: "approved",
      local_path:
        "course-assets/review-lesson12A/LESSON-12A-v12-LOCAL-POLICY-CUT.mp4",
      checksum_sha256:
        "3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a",
      size_bytes: 53799917,
    },
  );
  const directApprovalKeys = new Set([
    "video-slot-01-welcome",
    "video-slot-01-mindset",
    "video-slot-10-objection-scripts",
    "video-slot-15-closing",
    "video-slot-17-compensation",
    "video-slot-18-operator",
    "video-slot-19-career",
  ]);
  const directlyApprovedVideos = manifest.assets
    .filter(
      (asset) =>
        asset.kind === "video" && directApprovalKeys.has(asset.source_key),
    )
    .map(({ source_key, local_path, checksum_sha256, size_bytes }) => ({
      source_key,
      local_path,
      checksum_sha256,
      size_bytes,
    }));

  assert.deepEqual(directlyApprovedVideos, [
    {
      source_key: "video-slot-01-welcome",
      local_path:
        "course-assets/review-lessonA/LESSON-1A-v11-VIDEO-ZERO-FINAL-AUDIO-QC.mp4",
      checksum_sha256:
        "06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b",
      size_bytes: 74404741,
    },
    {
      source_key: "video-slot-01-mindset",
      local_path: "course-assets/review-lessonB/LESSON-1B-v4.mp4",
      checksum_sha256:
        "b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da",
      size_bytes: 107220021,
    },
    {
      source_key: "video-slot-10-objection-scripts",
      local_path: "course-assets/review-lesson7B/LESSON-7B-v5.mp4",
      checksum_sha256:
        "59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb",
      size_bytes: 572011027,
    },
    {
      source_key: "video-slot-15-closing",
      local_path: "course-assets/review-lesson11A/LESSON-11A-v4.mp4",
      checksum_sha256:
        "6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2",
      size_bytes: 55329810,
    },
    {
      source_key: "video-slot-17-compensation",
      local_path: "course-assets/review-lesson17/LESSON-17-v1-QT.mp4",
      checksum_sha256:
        "cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846",
      size_bytes: 45346253,
    },
    {
      source_key: "video-slot-18-operator",
      local_path: "course-assets/review-lesson18A/LESSON-18A-v10.mp4",
      checksum_sha256:
        "6e6a3f257ff8cf3ef201de775de47c6e7833e3abd673e44bb8d4d5ac3aafa048",
      size_bytes: 85657783,
    },
    {
      source_key: "video-slot-19-career",
      local_path: "course-assets/review-lesson19/LESSON-19-v7.mp4",
      checksum_sha256:
        "1ddcf7b1b0b45bbc90ec14b3660b3d5f5a284b5095dd0d0682164924ce1a3da9",
      size_bytes: 77199756,
    },
  ]);
  for (const asset of manifest.assets.filter(
    (candidate) => candidate.kind === "video",
  )) {
    assert.match(
      asset.storage_path,
      new RegExp(`${asset.checksum_sha256}\\.mp4$`),
    );
  }
});

test("unapproved compensation claims cannot enter instructional content", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const serialized = JSON.stringify(manifest);
  const compensationAndCareerInstruction = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter(
      (lesson) =>
        lesson.type === "content" && /slot-(?:17|19)$/.test(lesson.source_key),
    )
    .map((lesson) =>
      JSON.stringify({
        ...lesson,
        blocks: lesson.blocks.filter((block) => block.type !== "flashcard"),
      }),
    )
    .join(" ");

  assert.doesNotMatch(serialized, /Cold Call Blueprint/i);
  assert.doesNotMatch(compensationAndCareerInstruction, /\$\s*\d/);
  assert.doesNotMatch(
    compensationAndCareerInstruction,
    /\b(?:hourly base|appointment bonus|commission tier|tiered commission)\b/i,
  );
});

test("the checksum-approved KPI assessment is exhaustive and remains validator-bound", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const lessons = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons);
  const quizzes = lessons.filter((lesson) => lesson.type === "quiz");
  const kpiQuiz = quizzes.find(
    (lesson) => lesson.source_key === "lesson-quiz-slot-16",
  )?.quiz;
  const kpiLesson = lessons.find(
    (lesson) => lesson.source_key === "lesson-content-slot-16",
  );

  assert.equal(quizzes.length, 19);
  assert.ok(
    quizzes.every((lesson) => lesson.quiz.approval_status === "approved"),
  );
  assert.ok(
    quizzes.every(
      (lesson) =>
        lesson.quiz.description ===
        "Each attempt includes every question in the lesson pool in randomized order.",
    ),
  );
  assert.ok(kpiQuiz);
  assert.equal(kpiQuiz.questions.length, 38);
  assert.equal(kpiQuiz.questions_per_attempt, null);
  assert.doesNotMatch(
    JSON.stringify(kpiQuiz.questions),
    STALE_FIXED_KPI_PATTERN,
  );
  assert.ok(
    kpiQuiz.questions.some(
      (question) =>
        question.question_text ===
        "In what direction are the six metrics tracked through the pipeline?",
    ),
  );
  assert.equal(
    kpiLesson.blocks.find(
      (block) => block.source_key === "block-flashcards-slot-16",
    ).content.cards[6].front,
    "Which metric measures the total number of outbound calls made in a single day?",
  );

  const stale = structuredClone(manifest);
  const staleKpiQuiz = stale.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .find((lesson) => lesson.source_key === "lesson-quiz-slot-16").quiz;
  staleKpiQuiz.questions[0].explanation =
    "This unreviewed sentence changes the approved question pool.";
  assert.ok(
    validateManifest(stale).errors.some((error) =>
      error.includes(
        "questions do not exactly match the referenced question bank",
      ),
    ),
  );
});
