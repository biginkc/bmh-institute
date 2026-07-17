import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadManifest,
  summarizeManifest,
  validateManifest,
} from "../../scripts/course-content/validate-manifest.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const STACK_CONFIRMATION_URL = new URL(
  "./bmh-operating-stack-confirmation.v1.json",
  import.meta.url,
);

test("the draft contains the locked course structure", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const summary = summarizeManifest(manifest);

  assert.deepEqual(summary, {
    modules: 6,
    contentLessons: 19,
    quizLessons: 19,
    assignmentLessons: 6,
    videos: 29,
    quizQuestions: 342,
    flashcards: 152,
    rolePlays: 6,
    posterAssets: 29,
    posterReferences: 29,
    guideAssets: 19,
    guideBlocks: 19,
  });
});

test("every video has its own release-gated poster asset", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const assetsByKey = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));
  const videos = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "video");

  assert.equal(videos.length, 29);
  assert.equal(new Set(videos.map((block) => block.content.poster_asset_key)).size, 29);
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
  const assetsByKey = new Map(manifest.assets.map((asset) => [asset.source_key, asset]));
  const contentLessons = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.type === "content");

  assert.equal(contentLessons.length, 19);
  for (const lesson of contentLessons) {
    const guides = lesson.blocks.filter((block) => block.type === "download" && /^block-guide-pdf-slot-/.test(block.source_key));
    assert.equal(guides.length, 1, `${lesson.source_key} has one guide download`);
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
    assert.ok(assignment.rubric.length >= 3, `${assignment.source_key} has reviewer criteria`);
    for (const item of assignment.rubric) {
      assert.ok(item.criterion.trim(), `${assignment.source_key} criterion has a name`);
      assert.ok(item.description.trim(), `${assignment.source_key} criterion has guidance`);
    }
  }
});

test("all six Closer Lab scenarios have substantive specs and explicit assignment alignment", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const modules = manifest.program.courses.flatMap((course) => course.modules);
  const assignments = new Set(
    modules
      .flatMap((module) => module.lessons)
      .filter((lesson) => lesson.type === "assignment")
      .map((lesson) => lesson.assignment.source_key),
  );
  const rolePlays = modules
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .filter((block) => block.type === "role_play");

  assert.equal(rolePlays.length, 6);
  assert.deepEqual(
    rolePlays.map((block) => block.content.scenario_spec.assignment_source_key),
    [
      "assignment-section-3",
      "assignment-section-3",
      "assignment-section-4",
      "assignment-section-5",
      "assignment-section-6",
      "assignment-section-6",
    ],
  );
  for (const block of rolePlays) {
    const spec = block.content.scenario_spec;
    assert.ok(assignments.has(spec.assignment_source_key));
    assert.ok(spec.context.trim());
    assert.ok(spec.learner_goal.trim());
    assert.equal(spec.success_criteria.length, 4);
    assert.ok(spec.fail_conditions.length >= 3);
    assert.ok(spec.success_criteria.every((criterion) => criterion.trim()));
    assert.ok(spec.fail_conditions.every((condition) => condition.trim()));
  }
});

test("the manifest passes structural and semantic content QA", async () => {
  const [manifest, stackConfirmation] = await Promise.all([
    loadManifest(MANIFEST_URL),
    loadManifest(STACK_CONFIRMATION_URL),
  ]);
  const report = validateManifest(manifest, { stackConfirmation });

  assert.deepEqual(report.errors, []);
  assert.ok(report.publicationBlockers.length > 0);
  assert.ok(
    report.publicationBlockers.some((blocker) =>
      blocker.includes("pending Jarrad approval"),
    ),
  );
  assert.ok(
    report.publicationBlockers.some((blocker) =>
      blocker.includes("Closer Lab scenario"),
    ),
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

test("Closer Lab publication blockers are trim and case robust", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const rolePlay = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((courseModule) => courseModule.lessons)
    .flatMap((lesson) => lesson.blocks ?? [])
    .find((block) => block.type === "role_play" && block.required === true);
  assert.ok(rolePlay);
  rolePlay.content.scenario_id = "  PeNdInG :replacement  ";

  const report = validateManifest(manifest);
  assert.ok(
    report.publicationBlockers.includes(
      `${rolePlay.source_key} needs a production Closer Lab scenario ID`,
    ),
  );
});

test("known held cuts are immutable and never replaced by older files", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const heldVideos = manifest.assets
    .filter((asset) => asset.kind === "video" && asset.approval_status === "hold")
    .map(({ source_key, local_path, checksum_sha256, size_bytes }) => ({
      source_key,
      local_path,
      checksum_sha256,
      size_bytes,
    }));

  assert.deepEqual(heldVideos, [
    {
      source_key: "video-slot-01-welcome",
      local_path: "course-assets/review-lessonA/LESSON-1A-v7.mp4",
      checksum_sha256: "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72",
      size_bytes: 35190296,
    },
    {
      source_key: "video-slot-01-mindset",
      local_path: "course-assets/review-lessonB/LESSON-1B-v4.mp4",
      checksum_sha256: "b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da",
      size_bytes: 107220021,
    },
    {
      source_key: "video-slot-02-terms",
      local_path: "course-assets/review-lessonGLOA/LESSON-GLOA-v9.mp4",
      checksum_sha256: "17cac99f171edfb773f85eaaa6719e09ffe1295abec5b062554c72958747c0bb",
      size_bytes: 110768219,
    },
    {
      source_key: "video-slot-10-objection-scripts",
      local_path: "course-assets/review-lesson7B/LESSON-7B-v5.mp4",
      checksum_sha256: "59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb",
      size_bytes: 572011027,
    },
    {
      source_key: "video-slot-15-closing",
      local_path: "course-assets/review-lesson11A/LESSON-11A-v4.mp4",
      checksum_sha256: "6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2",
      size_bytes: 55329810,
    },
    {
      source_key: "video-slot-16-kpis",
      local_path: "course-assets/review-lesson12A/LESSON-12A-v11.mp4",
      checksum_sha256: "439f8d06d2e449637509f0f21f9d0b4a5464c65aec1995fca7147e4e4e67310b",
      size_bytes: 56052870,
    },
    {
      source_key: "video-slot-17-compensation",
      local_path: "course-assets/review-lesson17/LESSON-17-v1-QT.mp4",
      checksum_sha256: "cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846",
      size_bytes: 45346253,
    },
    {
      source_key: "video-slot-18-operator",
      local_path: "course-assets/review-lesson18A/LESSON-18A-v10.mp4",
      checksum_sha256: "6e6a3f257ff8cf3ef201de775de47c6e7833e3abd673e44bb8d4d5ac3aafa048",
      size_bytes: 85657783,
    },
    {
      source_key: "video-slot-19-career",
      local_path: "course-assets/review-lesson19/LESSON-19-v7.mp4",
      checksum_sha256: "1ddcf7b1b0b45bbc90ec14b3660b3d5f5a284b5095dd0d0682164924ce1a3da9",
      size_bytes: 77199756,
    },
  ]);
  for (const asset of manifest.assets.filter((candidate) => candidate.kind === "video")) {
    assert.match(asset.storage_path, new RegExp(`${asset.checksum_sha256}\\.mp4$`));
  }
});

test("wrong-track and stale compensation content cannot enter the learner draft", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const serialized = JSON.stringify(manifest);
  const compensationAndCareer = manifest.program.courses
    .flatMap((course) => course.modules)
    .flatMap((module) => module.lessons)
    .filter((lesson) => /slot-(?:17|19)$/.test(lesson.source_key))
    .map((lesson) => JSON.stringify(lesson))
    .join(" ");

  assert.doesNotMatch(serialized, /Cold Call Blueprint/i);
  assert.doesNotMatch(compensationAndCareer, /\$\s*\d/);
  assert.doesNotMatch(compensationAndCareer, /\b(?:hourly base|appointment bonus|commission tier|tiered commission)\b/i);
});
