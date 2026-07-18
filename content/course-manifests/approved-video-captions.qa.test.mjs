import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  inspectApprovedCaptionAssets,
  loadManifest,
  MAX_CAPTION_CHARACTERS_PER_SECOND,
  MIN_CAPTION_DURATION_SECONDS,
  parseWebVtt,
} from "../../scripts/course-content/validate-caption-assets.mjs";
import {
  approvedMediaNamedRolePhrases,
  evaluateApprovedMediaRolePolicy,
} from "../../scripts/course-content/approved-media-role-policy.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const REPO_ROOT = new URL("../../", import.meta.url);

test("only approved video cuts have complete caption and transcript assets", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const report = await inspectApprovedCaptionAssets(manifest, REPO_ROOT);

  assert.equal(report.approvedVideos, 22);
  assert.equal(report.heldVideos, 7);
  assert.equal(report.approvedCaptions, 22);
  assert.equal(report.approvedTranscripts, 22);
  assert.equal(report.heldDerivativeAssetsStillMissing, 14);
  assert.equal(report.rolePolicyReviewVideos, 9);
  assert.equal(report.rolePolicyReviewedBindings, 9);
  assert.equal(report.rolePolicyApprovedExceptions, 0);
  assert.equal(report.policyBlockers.length, 9);
  assert.deepEqual(
    report.policyBlockers.map((blocker) => blocker.match(/^video-slot-[^ ]+/)?.[0]),
    [
      "video-slot-03-tech-stack",
      "video-slot-06-framework",
      "video-slot-06-pipeline",
      "video-slot-08-discovery",
      "video-slot-08-handoff",
      "video-slot-11-complex",
      "video-slot-12-faq-b",
      "video-slot-16-kpis",
      "video-slot-18-mission-control",
    ],
  );
  assert.ok(report.policyBlockers.some((blocker) =>
    blocker.includes("video-slot-16-kpis")
      && blocker.includes("3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a")
      && blocker.includes("acquisition team"),
  ));
  assert.deepEqual(report.errors, []);
});

test("named-role QA normalizes caption wrapping and includes transaction teams", () => {
  assert.deepEqual(
    approvedMediaNamedRolePhrases("Our acquisition\nteam briefs the transaction teams and team lead."),
    ["acquisition team", "team lead", "transaction teams"],
  );
  assert.deepEqual(
    approvedMediaNamedRolePhrases("Closer Lab preserves product identity."),
    [],
  );
});

test("only a complete checksum-bound exception can clear one exact media blocker", () => {
  const binding = {
    video: { source_key: "video-test", checksum_sha256: "a".repeat(64) },
    caption: { source_key: "caption-video-test", checksum_sha256: "b".repeat(64) },
    transcript: { source_key: "transcript-video-test", checksum_sha256: "c".repeat(64) },
    captionProse: "The transaction team handles this step.",
    transcriptProse: "The transaction team handles this step.",
  };
  const reviewRecord = {
    video_source_key: binding.video.source_key,
    video_sha256: binding.video.checksum_sha256,
    caption_source_key: binding.caption.source_key,
    caption_sha256: binding.caption.checksum_sha256,
    transcript_source_key: binding.transcript.source_key,
    transcript_sha256: binding.transcript.checksum_sha256,
    detected_phrases: ["transaction team"],
    cut_approval_status: "approved",
    policy_review_status: "pending_policy_exception_or_recut",
  };
  const reviewLedger = {
    schema_version: "1.0.0",
    policy_id: "approved-media-role-agnostic-v1",
    status: "pending_review",
    records: [reviewRecord],
  };
  const pending = evaluateApprovedMediaRolePolicy({
    bindings: [binding],
    reviewLedger,
    exceptionLedger: {
      schema_version: "1.0.0",
      policy_id: "approved-media-role-agnostic-v1",
      records: [],
    },
  });
  assert.deepEqual(pending.errors, []);
  assert.equal(pending.publicationBlockers.length, 1);

  const approved = evaluateApprovedMediaRolePolicy({
    bindings: [binding],
    reviewLedger,
    exceptionLedger: {
      schema_version: "1.0.0",
      policy_id: "approved-media-role-agnostic-v1",
      records: [{
        ...reviewRecord,
        status: "approved",
        approver: "Jarrad Henry",
        approved_at: "2026-07-18T00:00:00Z",
        rationale: "Explicit exception for this exact reviewed binding.",
        allowed_phrases: ["transaction team"],
      }],
    },
  });
  assert.deepEqual(approved.errors, []);
  assert.equal(approved.approvedExceptions, 1);
  assert.deepEqual(approved.publicationBlockers, []);

  const forged = evaluateApprovedMediaRolePolicy({
    bindings: [binding],
    reviewLedger,
    exceptionLedger: {
      schema_version: "1.0.0",
      policy_id: "approved-media-role-agnostic-v1",
      records: [{
        ...reviewRecord,
        transcript_sha256: "d".repeat(64),
        status: "approved",
        approver: "Jarrad Henry",
        approved_at: "2026-07-18T00:00:00Z",
        rationale: "Wrong transcript binding.",
        allowed_phrases: ["transaction team"],
      }],
    },
  });
  assert.equal(forged.publicationBlockers.length, 1);
  assert.ok(forged.errors.some((error) => error.includes("stale or does not match")));
});

test("file-backed release QA refuses absolute, traversal, and escaping caption paths", async () => {
  for (const localPath of ["/etc/passwd", "../../outside.md"]) {
    const manifest = await loadManifest(MANIFEST_URL);
    const transcript = manifest.assets.find((asset) =>
      asset.source_key === "transcript-video-slot-04-humanizing-a",
    );
    transcript.local_path = localPath;
    const report = await inspectApprovedCaptionAssets(manifest, REPO_ROOT);
    assert.ok(report.errors.some((error) =>
      error.includes("local path escapes the repository trust root"),
    ));
  }
});

test("approved captions do not split punctuation or disagree with their transcripts", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const approvedVideos = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "approved",
  );

  for (const video of approvedVideos) {
    const caption = await readFile(
      new URL(`../../course-assets/captions/${video.source_key}.vtt`, import.meta.url),
      "utf8",
    );
    const transcript = await readFile(
      new URL(`../../course-assets/transcripts/${video.source_key}.md`, import.meta.url),
      "utf8",
    );
    const parsed = parseWebVtt(caption);
    const captionProse = parsed.cues.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim();
    const transcriptProse = transcript.split("\n").slice(4).join(" ").replace(/\s+/g, " ").trim();

    assert.equal(
      parsed.cues.some((cue) => /^[-,.;:!?]/.test(cue.text)),
      false,
      `${video.source_key} starts a cue with detached punctuation`,
    );
    assert.ok(
      parsed.cues.every((cue) => cue.charactersPerSecond <= MAX_CAPTION_CHARACTERS_PER_SECOND + 0.000001),
      `${video.source_key} exceeds ${MAX_CAPTION_CHARACTERS_PER_SECOND} characters per second`,
    );
    assert.ok(
      parsed.cues.every((cue) => cue.durationSeconds >= MIN_CAPTION_DURATION_SECONDS - 0.000001),
      `${video.source_key} contains a cue shorter than ${MIN_CAPTION_DURATION_SECONDS.toFixed(1)} seconds`,
    );
    assert.equal(captionProse, transcriptProse, `${video.source_key} caption and transcript disagree`);
  }
});

test("caption parsing rejects unreadably fast cues", () => {
  const parsed = parseWebVtt("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n1234567890123456789012\n");
  assert.ok(parsed.errors.some((error) => error.includes("exceeds 21 characters per second")));
});

test("caption parsing rejects unreadably short and orphaned one-word cues", () => {
  const parsed = parseWebVtt("WEBVTT\n\n00:00:00.000 --> 00:00:00.500\nword\n");
  assert.ok(parsed.errors.some((error) => error.includes("shorter than 0.8 seconds")));
  assert.ok(parsed.errors.some((error) => error.includes("orphan one-word segment")));
});

test("approved transcripts do not hard-code learner dial quotas", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const approvedVideos = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "approved",
  );
  const fixedDialQuota = /\b(?:\d{2,3}(?:\s*(?:to|-|plus|\+))\s*\d{2,3}|\d{2,3}\s*(?:plus|\+))\s+(?:total\s+)?dials?\b|\bdial target\b/i;

  for (const video of approvedVideos) {
    const transcript = await readFile(
      new URL(`../../course-assets/transcripts/${video.source_key}.md`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(transcript, fixedDialQuota, `${video.source_key} contains a fixed dial quota`);
  }
});

test("Fact Find captions preserve the exact authored words at known ASR trouble spots", async () => {
  const transcript = await readFile(
    new URL("../../course-assets/transcripts/video-slot-07-fact-find.md", import.meta.url),
    "utf8",
  );

  assert.match(transcript, /it gives you a quick picture/i);
  assert.match(transcript, /this matters more than you probably think/i);
  assert.match(transcript, /Your energy on the call matters more than your words/i);
  assert.match(transcript, /giving up after one weak response/i);
  assert.doesNotMatch(transcript, /quick, quick picture|You're energy|one week response/i);
});

test("held Operator review evidence preserves the exact authored terms and numbers", async () => {
  const transcript = await readFile(
    new URL("../../course-assets/held-caption-review/video-slot-18-operator.md", import.meta.url),
    "utf8",
  );

  assert.match(transcript, /liens, tax status/i);
  assert.match(transcript, /around 110 to 150 dials/i);
  assert.doesNotMatch(transcript, /Leans, tax status|100, 10 to 150/i);
});
