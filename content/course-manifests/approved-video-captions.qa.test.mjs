import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  inspectApprovedCaptionAssets,
  loadManifest,
  MAX_CAPTION_CHARACTERS_PER_SECOND,
  parseWebVtt,
} from "../../scripts/course-content/validate-caption-assets.mjs";

const MANIFEST_URL = new URL("./bmh-employee-training.v1.json", import.meta.url);
const REPO_ROOT = new URL("../../", import.meta.url);

test("only approved video cuts have complete caption and transcript assets", async () => {
  const manifest = await loadManifest(MANIFEST_URL);
  const report = await inspectApprovedCaptionAssets(manifest, REPO_ROOT);

  assert.equal(report.approvedVideos, 21);
  assert.equal(report.heldVideos, 8);
  assert.equal(report.approvedCaptions, 21);
  assert.equal(report.approvedTranscripts, 21);
  assert.equal(report.heldDerivativeAssetsStillMissing, 16);
  assert.deepEqual(report.errors, []);
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
    assert.equal(captionProse, transcriptProse, `${video.source_key} caption and transcript disagree`);
  }
});

test("caption parsing rejects unreadably fast cues", () => {
  const parsed = parseWebVtt("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n1234567890123456789012\n");
  assert.ok(parsed.errors.some((error) => error.includes("exceeds 21 characters per second")));
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
