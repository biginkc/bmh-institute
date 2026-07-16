import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadManifest,
  summarizeManifest,
  validateManifest,
} from "../../scripts/course-content/validate-manifest.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);

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
  });
});

test("the manifest passes structural and semantic content QA", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const report = validateManifest(manifest);

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
    report.publicationBlockers.some((blocker) =>
      blocker.includes("DialPad references"),
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
