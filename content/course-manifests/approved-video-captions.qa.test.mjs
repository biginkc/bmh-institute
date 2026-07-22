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
import { DIRECT_APPROVAL_OVERRIDE_CUTS } from "../../scripts/course-content/held-video-approval-ledger.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const REPO_ROOT = new URL("../../", import.meta.url);

test("only approved video cuts have complete learner-facing caption assets", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const report = await inspectApprovedCaptionAssets(manifest, REPO_ROOT);

  assert.equal(report.approvedVideos, 29);
  assert.equal(report.heldVideos, 0);
  assert.equal(report.approvedCaptions, 29);
  assert.equal(report.approvedTranscripts, 0);
  assert.equal(report.heldDerivativeAssetsStillMissing, 0);
  assert.deepEqual(report.errors, []);
});

test("learner-facing transcripts cannot re-enter the canonical course", async () => {
  for (const mutation of ["asset", "asset_key", "path"]) {
    const manifest = await loadManifest(MANIFEST_URL);
    const videoBlock = manifest.program.courses
      .flatMap((course) => course.modules)
      .flatMap((courseModule) => courseModule.lessons)
      .flatMap((lesson) => lesson.blocks ?? [])
      .find((block) => block.type === "video");
    assert.ok(videoBlock);
    if (mutation === "asset") {
      manifest.assets.push({
        source_key: "transcript-forbidden",
        kind: "transcript",
        local_path: "course-assets/transcripts/forbidden.md",
        storage_path: "courses/bmh-employee-training/v1/transcripts/forbidden.md",
        mime_type: "text/markdown",
        checksum_sha256: "a".repeat(64),
        size_bytes: 1,
        approval_status: "approved",
      });
    } else if (mutation === "asset_key") {
      videoBlock.content.transcript_asset_key = "transcript-forbidden";
    } else {
      videoBlock.content.transcript_path = "courses/bmh-employee-training/v1/transcripts/forbidden.md";
    }
    const report = await inspectApprovedCaptionAssets(manifest, REPO_ROOT);
    assert.ok(
      report.errors.some((error) => error.includes("accessibility captions only")),
      `${mutation} transcript mutation was not rejected`,
    );
  }
});

test("file-backed release QA refuses absolute, traversal, and escaping caption paths", async () => {
  for (const localPath of ["/etc/passwd", "../../outside.md"]) {
    const manifest = await loadManifest(MANIFEST_URL);
    const caption = manifest.assets.find((asset) =>
      asset.source_key === "caption-video-slot-04-humanizing-a",
    );
    caption.local_path = localPath;
    const report = await inspectApprovedCaptionAssets(manifest, REPO_ROOT);
    assert.ok(report.errors.some((error) =>
      error.includes("local path escapes the repository trust root"),
    ));
  }
});

test("approved captions are readable and legacy reviewed captions match their internal QA text", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const approvedVideos = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "approved",
  );

  for (const video of approvedVideos) {
    const caption = await readFile(
      new URL(`../../course-assets/captions/${video.source_key}.vtt`, import.meta.url),
      "utf8",
    );
    const parsed = parseWebVtt(caption);

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
    if (!DIRECT_APPROVAL_OVERRIDE_CUTS.has(`${video.source_key}:${video.checksum_sha256}`)) {
      const transcript = await readFile(
        new URL(`../../course-assets/transcripts/${video.source_key}.md`, import.meta.url),
        "utf8",
      );
      const captionProse = parsed.cues.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim();
      const transcriptProse = transcript.split("\n").slice(4).join(" ").replace(/\s+/g, " ").trim();
      assert.equal(captionProse, transcriptProse, `${video.source_key} caption and internal QA text disagree`);
    }
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

test("approved transcripts without a checksum-specific override do not hard-code learner dial quotas", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const approvedVideos = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "approved",
  );
  const fixedDialQuota = /\b(?:\d{2,3}(?:\s*(?:to|-|plus|\+))\s*\d{2,3}|\d{2,3}\s*(?:plus|\+))\s+(?:total\s+)?dials?\b|\bdial target\b/i;

  for (const video of approvedVideos) {
    if (DIRECT_APPROVAL_OVERRIDE_CUTS.has(`${video.source_key}:${video.checksum_sha256}`)) continue;
    const transcript = await readFile(
      new URL(`../../course-assets/transcripts/${video.source_key}.md`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(transcript, fixedDialQuota, `${video.source_key} contains a fixed dial quota`);
  }
});

test("direct exact-cut accessibility captions preserve the verified wording", async () => {
  const operator = await readFile(
    new URL("../../course-assets/captions/video-slot-18-operator.vtt", import.meta.url),
    "utf8",
  );
  const compensation = await readFile(
    new URL("../../course-assets/captions/video-slot-17-compensation.vtt", import.meta.url),
    "utf8",
  );
  const operatorProse = parseWebVtt(operator).cues.map((cue) => cue.text).join(" ");

  assert.match(operatorProse, /Liens, tax status/i);
  assert.match(operatorProse, /110 to\s+150 dials/i);
  assert.doesNotMatch(operatorProse, /Leans, tax status|100, 10 to/i);
  assert.match(compensation, /(?:performance pay|milestone bonus|commission)/i);
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
