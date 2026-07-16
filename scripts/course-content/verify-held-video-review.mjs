#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const MANIFEST_PATH = join(REPO_ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const REVIEW_HTML_PATH = join(REPO_ROOT, "docs/course-production/held-video-review/index.html");

export const CANONICAL_CHECKOUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute";

export const EXPECTED_HELD_SOURCE_KEYS = [
  "video-slot-01-welcome",
  "video-slot-01-mindset",
  "video-slot-02-terms",
  "video-slot-10-objection-scripts",
  "video-slot-15-closing",
  "video-slot-16-kpis",
  "video-slot-17-compensation",
  "video-slot-18-operator",
  "video-slot-19-career",
];

const EXPECTED_ASSETS = {
  "video-slot-01-welcome": ["course-assets/review-lessonA/LESSON-1A-v7.mp4", "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72", 35190296],
  "video-slot-01-mindset": ["course-assets/review-lessonB/LESSON-1B-v4.mp4", "b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da", 107220021],
  "video-slot-02-terms": ["course-assets/review-lessonGLOA/LESSON-GLOA-v9.mp4", "17cac99f171edfb773f85eaaa6719e09ffe1295abec5b062554c72958747c0bb", 110768219],
  "video-slot-10-objection-scripts": ["course-assets/review-lesson7B/LESSON-7B-v5.mp4", "59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb", 572011027],
  "video-slot-15-closing": ["course-assets/review-lesson11A/LESSON-11A-v4.mp4", "6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2", 55329810],
  "video-slot-16-kpis": ["course-assets/review-lesson12A/LESSON-12A-v11.mp4", "439f8d06d2e449637509f0f21f9d0b4a5464c65aec1995fca7147e4e4e67310b", 56052870],
  "video-slot-17-compensation": ["course-assets/review-lesson17/LESSON-17-v1-QT.mp4", "cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846", 45346253],
  "video-slot-18-operator": ["course-assets/review-lesson18A/LESSON-18A-v10.mp4", "6e6a3f257ff8cf3ef201de775de47c6e7833e3abd673e44bb8d4d5ac3aafa048", 85657783],
  "video-slot-19-career": ["course-assets/review-lesson19/LESSON-19-v7.mp4", "1ddcf7b1b0b45bbc90ec14b3660b3d5f5a284b5095dd0d0682164924ce1a3da9", 77199756],
};

const REVIEW_DETAILS = {
  "video-slot-01-welcome": {
    title: "Welcome",
    duration: "4:06",
    durationSeconds: 246.186,
    reason: "Restores the missing cash-as-is paragraph and the training-starts-now line.",
  },
  "video-slot-01-mindset": {
    title: "Mindset",
    duration: "6:03",
    durationSeconds: 362.688,
    reason: "Repairs the stranded opener line.",
  },
  "video-slot-02-terms": {
    title: "Terms Glossary",
    duration: "7:32",
    durationSeconds: 451.754,
    reason: "Corrects the DOM pronunciation and the broken tease or sign-off.",
  },
  "video-slot-10-objection-scripts": {
    title: "Objection Scripts Playbook",
    duration: "25:09",
    durationSeconds: 1508.757,
    reason: "Restores missing seller prompts and the tail word.",
  },
  "video-slot-15-closing": {
    title: "Closing and Deal Engineering",
    duration: "5:29",
    durationSeconds: 329.429,
    reason: "Removes the spoken dollar-X placeholder defect.",
  },
  "video-slot-16-kpis": {
    title: "KPIs and Sales Telemetry",
    duration: "6:42",
    durationSeconds: 402.154,
    reason: "Uses the approved non-finale closer after discarded hand-garbled takes.",
  },
  "video-slot-17-compensation": {
    title: "Compensation Engine",
    duration: "3:01",
    durationSeconds: 181.013,
    reason: "Audio promises a ramp-up base, performance pay, milestone bonuses, and deal commissions. This conflicts with the role-agnostic current-written-plan rule.",
    evidence: {
      vtt: "course-assets/held-caption-review/video-slot-17-compensation.vtt",
      vttSha256: "23199d674fd8b3d1176d39aa46dc89814b461bda07f67ffdb7c68e7e60f3e6b4",
      transcript: "course-assets/held-caption-review/video-slot-17-compensation.md",
      transcriptSha256: "822f8633a9f077234130d1289493331547254555b066347826d6f8b84a4c5916",
    },
  },
  "video-slot-18-operator": {
    title: "Operator Playbook",
    duration: "6:19",
    durationSeconds: 378.858,
    reason: "Audio hard-codes 60 to 80, 150 to 200, and 150-plus dial targets. This conflicts with the locked no-fixed-KPI rule.",
    evidence: {
      vtt: "course-assets/held-caption-review/video-slot-18-operator.vtt",
      vttSha256: "4517636feec4ae01ddaa7e6d210f999f97ca9345a94cd489544bfb98621c64a2",
      transcript: "course-assets/held-caption-review/video-slot-18-operator.md",
      transcriptSha256: "14cb8f4ace06322286a0b3fe1b41b83a8f0659ed092f94e3b30017c5e8bb79fe",
    },
  },
  "video-slot-19-career": {
    title: "Career Growth Path",
    duration: "4:13",
    durationSeconds: 252.949,
    reason: "Audio hard-codes a role ladder, a 90-day performance window, six-month and one-year promotion examples, higher earnings, commissions, and management compensation. This conflicts with reusable current-role-source-of-truth wording.",
    evidence: {
      vtt: "course-assets/held-caption-review/video-slot-19-career.vtt",
      vttSha256: "70c72c01fe8d18a392dac99633564c01f6505e107e2ca81452dc92e9e56404de",
      transcript: "course-assets/held-caption-review/video-slot-19-career.md",
      transcriptSha256: "717cff454a9b37383a80bedf705348f2b3759eb32bade9670061a71de5ce88cc",
    },
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function evidenceUrl(path) {
  return relative(dirname(REVIEW_HTML_PATH), join(REPO_ROOT, path)).split("\\").join("/");
}

export function assertHeldAssetMatchesLock(asset) {
  const locked = EXPECTED_ASSETS[asset.source_key];
  const actual = [asset.local_path, asset.checksum_sha256, asset.size_bytes];
  if (!locked || JSON.stringify(actual) !== JSON.stringify(locked)) {
    throw new Error(`Held cut changed in the manifest for ${asset.source_key}; review metadata must be explicitly re-approved`);
  }
}

export function renderHeldVideoReview(manifest) {
  const held = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );

  const cards = held.map((asset, index) => {
    const details = REVIEW_DETAILS[asset.source_key];
    if (!details) throw new Error(`No review details for ${asset.source_key}`);
    const absoluteVideoPath = join(CANONICAL_CHECKOUT, asset.local_path);
    const videoUrl = pathToFileURL(absoluteVideoPath).href;
    const evidence = details.evidence
      ? `\n      <div class="evidence"><strong>Review-only wording evidence:</strong> <a href="${escapeHtml(evidenceUrl(details.evidence.vtt))}">VTT captions</a> · <a href="${escapeHtml(evidenceUrl(details.evidence.transcript))}">transcript</a></div>`
      : "";
    const track = details.evidence
      ? `<track kind="captions" srclang="en" label="Review transcript" src="${escapeHtml(evidenceUrl(details.evidence.vtt))}">`
      : "";

    return `<article class="card" data-source-key="${escapeHtml(asset.source_key)}" data-checksum="${asset.checksum_sha256}">
      <header><span class="number">${index + 1}</span><div><h2>${escapeHtml(details.title)}</h2><p class="meta">${details.duration} · ${asset.size_bytes.toLocaleString("en-US")} bytes</p></div></header>
      <video controls preload="metadata" src="${escapeHtml(videoUrl)}">${track}Your browser cannot play this local video.</video>
      <p class="reason"><strong>Why it is held:</strong> ${escapeHtml(details.reason)}</p>${evidence}
      <details><summary>Exact-file lock</summary><dl><dt>SHA-256</dt><dd><code>${asset.checksum_sha256}</code></dd><dt>Absolute source</dt><dd><code>${escapeHtml(absoluteVideoPath)}</code></dd><dt>Manifest key</dt><dd><code>${escapeHtml(asset.source_key)}</code></dd></dl></details>
    </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BMH Institute — Held Video Review</title>
  <style>
    :root{color-scheme:dark;--bg:#11120f;--panel:#1c1e18;--ink:#f8f5e7;--muted:#b9b8ac;--accent:#f4cf45;--line:#3a3d32;--danger:#ff836f}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(1040px,calc(100% - 32px));margin:40px auto 80px}.intro{border-left:6px solid var(--accent);padding:4px 0 4px 20px;margin-bottom:30px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;color:var(--accent);font-weight:800;font-size:.76rem}h1{font-size:clamp(2rem,6vw,4rem);line-height:1;margin:.25rem 0 1rem}h2{margin:0;font-size:1.35rem}.intro p{max-width:76ch;color:var(--muted)}.warning{color:var(--danger);font-weight:750}.grid{display:grid;gap:22px}.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 18px 38px #0005}.card header{display:flex;gap:14px;align-items:center;margin-bottom:16px}.number{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--accent);color:#161710;font-weight:900}.meta{margin:2px 0 0;color:var(--muted)}video{display:block;width:100%;max-height:70vh;border-radius:12px;background:#000}.reason{margin:18px 0 8px}.evidence{margin:12px 0;padding:12px 14px;border-radius:10px;background:#2a2c24}a{color:var(--accent)}details{margin-top:14px;color:var(--muted)}summary{cursor:pointer;font-weight:700}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px}dt{font-weight:800}dd{margin:0;overflow-wrap:anywhere}code{font-size:.78rem}@media(max-width:600px){main{width:min(100% - 20px,1040px);margin-top:22px}.card{padding:14px}dl{grid-template-columns:1fr}.intro{padding-left:14px}}
  </style>
</head>
<body>
<main>
  <section class="intro">
    <div class="eyebrow">Local review only · 9 exact cuts</div>
    <h1>Held video review</h1>
    <p>Run <code>node scripts/course-content/verify-held-video-review.mjs</code> before watching. Review and decide on the exact cut shown; a filename alone is not approval.</p>
    <p class="warning">This page does not upload, publish, alter, or approve anything.</p>
  </section>
  <section class="grid" aria-label="Held video candidates">
${cards}
  </section>
</main>
</body>
</html>
`;
}

export async function writeHeldVideoReview() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  await mkdir(dirname(REVIEW_HTML_PATH), { recursive: true });
  await writeFile(REVIEW_HTML_PATH, renderHeldVideoReview(manifest), "utf8");
}

export async function verifyHeldVideoReview() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const held = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
  const sourceKeys = held.map((asset) => asset.source_key);
  if (JSON.stringify(sourceKeys) !== JSON.stringify(EXPECTED_HELD_SOURCE_KEYS)) {
    throw new Error(`Held video set changed. Expected ${EXPECTED_HELD_SOURCE_KEYS.join(", ")}; got ${sourceKeys.join(", ")}`);
  }

  let evidenceFileCount = 0;
  for (const asset of held) {
    const details = REVIEW_DETAILS[asset.source_key];
    if (!details) throw new Error(`Missing review details for ${asset.source_key}`);
    assertHeldAssetMatchesLock(asset);
    const absoluteVideoPath = join(CANONICAL_CHECKOUT, asset.local_path);
    await access(absoluteVideoPath);
    const info = await stat(absoluteVideoPath);
    if (!info.isFile()) throw new Error(`Not a file: ${absoluteVideoPath}`);
    if (info.size !== asset.size_bytes) {
      throw new Error(`Size mismatch for ${asset.source_key}: expected ${asset.size_bytes}, got ${info.size}`);
    }
    const videoChecksum = await sha256(absoluteVideoPath);
    if (videoChecksum !== asset.checksum_sha256) {
      throw new Error(`Checksum mismatch for ${asset.source_key}: expected ${asset.checksum_sha256}, got ${videoChecksum}`);
    }

    if (details.evidence) {
      for (const [kind, expected] of [
        ["vtt", details.evidence.vttSha256],
        ["transcript", details.evidence.transcriptSha256],
      ]) {
        const evidencePath = join(REPO_ROOT, details.evidence[kind]);
        await access(evidencePath);
        const actual = await sha256(evidencePath);
        if (actual !== expected) {
          throw new Error(`Review evidence changed for ${asset.source_key} ${kind}: expected ${expected}, got ${actual}`);
        }
        evidenceFileCount += 1;
      }
    }
  }

  const expectedHtml = renderHeldVideoReview(manifest);
  const currentHtml = await readFile(REVIEW_HTML_PATH, "utf8");
  if (currentHtml !== expectedHtml) {
    throw new Error(`Review HTML is stale. Regenerate it before review: ${relative(REPO_ROOT, REVIEW_HTML_PATH)}`);
  }

  return {
    sourceKeys,
    videoCount: held.length,
    evidenceFileCount,
    htmlIsCurrent: true,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const operation = process.argv.includes("--write")
    ? writeHeldVideoReview().then(() => verifyHeldVideoReview())
    : verifyHeldVideoReview();
  operation
    .then((result) => {
      console.log(`Verified ${result.videoCount} held videos and ${result.evidenceFileCount} review evidence files.`);
      console.log(`Review page: ${REVIEW_HTML_PATH}`);
    })
    .catch((error) => {
      console.error(`Held video review verification failed: ${error.message}`);
      process.exitCode = 1;
    });
}
