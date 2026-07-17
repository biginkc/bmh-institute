#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { watchFile, unwatchFile } from "node:fs";
import {
  access,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  REPLACEMENT_REQUIRED_CUTS,
  approvalRecordKey,
  validateHeldVideoApprovalLedger,
} from "./held-video-approval-ledger.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const MANIFEST_PATH = join(REPO_ROOT, "content/course-manifests/bmh-employee-training.v1.json");
const REVIEW_HTML_PATH = join(REPO_ROOT, "docs/course-production/held-video-review/index.html");
const APPROVAL_LEDGER_PATH = join(REPO_ROOT, "docs/course-production/held-video-review/approvals.json");
const APPROVAL_LEDGER_ROUTE = "/approval-ledger.json";

export const CANONICAL_CHECKOUT = "/Users/jarradhenry/Sites/BMH apps/BMH Institute";
export const MEDIA_ROOT_ENV = "BMH_HELD_VIDEO_MEDIA_ROOT";

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
    reason: "Restores the missing cash-as-is paragraph and the training-starts-now line.",
  },
  "video-slot-01-mindset": {
    title: "Mindset",
    duration: "6:03",
    reason: "Repairs the stranded opener line.",
  },
  "video-slot-02-terms": {
    title: "Terms Glossary",
    duration: "7:32",
    reason: "Corrects the DOM pronunciation and the broken tease or sign-off.",
  },
  "video-slot-10-objection-scripts": {
    title: "Objection Scripts Playbook",
    duration: "25:09",
    reason: "Restores missing seller prompts and the tail word.",
  },
  "video-slot-15-closing": {
    title: "Closing and Deal Engineering",
    duration: "5:29",
    reason: "Removes the spoken dollar-X placeholder defect.",
  },
  "video-slot-16-kpis": {
    title: "KPIs and Sales Telemetry",
    duration: "6:42",
    reason: "Uses the selected non-finale closer after discarded hand-garbled takes.",
  },
  "video-slot-17-compensation": {
    title: "Compensation Engine",
    duration: "3:01",
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

function isPathInside(root, candidate) {
  const delta = relative(root, candidate);
  return delta === "" || (!delta.startsWith("..") && !isAbsolute(delta));
}

export function resolveMediaRoot({ cliValue, env = process.env } = {}) {
  return resolve(cliValue || env[MEDIA_ROOT_ENV] || CANONICAL_CHECKOUT);
}

export function resolveManifestMediaPath(mediaRoot, localPath) {
  if (typeof localPath !== "string" || localPath.length === 0 || localPath.includes("\0")) {
    throw new Error("Manifest media path must be a non-empty relative path");
  }
  if (isAbsolute(localPath)) {
    throw new Error(`Manifest media path must be relative: ${localPath}`);
  }
  const root = resolve(mediaRoot);
  const candidate = resolve(root, localPath);
  if (!isPathInside(root, candidate)) {
    throw new Error(`Manifest media path escapes the configured media root: ${localPath}`);
  }
  return candidate;
}

export async function resolveVerifiedMediaPath(mediaRoot, localPath) {
  const root = await realpath(resolve(mediaRoot));
  const lexicalCandidate = resolveManifestMediaPath(root, localPath);
  const candidate = await realpath(lexicalCandidate);
  if (!isPathInside(root, candidate)) {
    throw new Error(`Manifest media path resolves outside the configured media root: ${localPath}`);
  }
  return candidate;
}

function fileSnapshot(info) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    mode: String(info.mode),
    size: String(info.size),
    mtimeNs: String(info.mtimeNs),
    ctimeNs: String(info.ctimeNs),
  };
}

function snapshotsMatch(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

export async function captureFileSnapshot(path) {
  const info = await stat(path, { bigint: true });
  if (!info.isFile()) throw new Error(`Not a regular file: ${path}`);
  return fileSnapshot(info);
}

export async function assertLockedFileUnchanged(record) {
  let current;
  try {
    current = await captureFileSnapshot(record.absolutePath);
  } catch (error) {
    throw new Error(`Locked file is unavailable: ${record.label || record.absolutePath} (${error.message})`);
  }
  if (!snapshotsMatch(record.snapshot, current)) {
    throw new Error(`Locked file stat changed after verification: ${record.label || record.absolutePath}`);
  }
}

async function sha256OpenFile(fileHandle) {
  const hash = createHash("sha256");
  for await (const chunk of fileHandle.createReadStream({ autoClose: false })) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyAndSnapshotFile({ absolutePath, expectedSha256, expectedSize, label }) {
  const fileHandle = await open(absolutePath, "r");
  try {
    const beforeInfo = await fileHandle.stat({ bigint: true });
    if (!beforeInfo.isFile()) throw new Error(`Not a regular file: ${absolutePath}`);
    const before = fileSnapshot(beforeInfo);
    if (expectedSize !== undefined && before.size !== String(expectedSize)) {
      throw new Error(`Size mismatch for ${label}: expected ${expectedSize}, got ${before.size}`);
    }
    const actualSha256 = await sha256OpenFile(fileHandle);
    const after = fileSnapshot(await fileHandle.stat({ bigint: true }));
    if (!snapshotsMatch(before, after)) {
      throw new Error(`File stat changed while hashing ${label}`);
    }
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Checksum mismatch for ${label}: expected ${expectedSha256}, got ${actualSha256}`);
    }
    return { snapshot: before, sha256: actualSha256 };
  } finally {
    await fileHandle.close();
  }
}

function evidenceStaticUrl(path) {
  return relative(dirname(REVIEW_HTML_PATH), join(REPO_ROOT, path)).split("\\").join("/");
}

function mediaRoute(sourceKey) {
  return `/media/${encodeURIComponent(sourceKey)}.mp4`;
}

function evidenceRoute(sourceKey, kind) {
  return `/evidence/${encodeURIComponent(sourceKey)}/${kind === "vtt" ? "review-captions.vtt" : "review-transcript.md"}`;
}

export function assertHeldAssetMatchesLock(asset) {
  const locked = EXPECTED_ASSETS[asset.source_key];
  const actual = [asset.local_path, asset.checksum_sha256, asset.size_bytes];
  if (!locked || JSON.stringify(actual) !== JSON.stringify(locked)) {
    throw new Error(`Held cut changed in the manifest for ${asset.source_key}; review metadata must be explicitly re-approved`);
  }
}

function buildVideoCourseLocations(manifest) {
  const locations = new Map();
  for (const course of manifest.program?.courses ?? []) {
    for (const courseModule of course.modules ?? []) {
      for (const lesson of courseModule.lessons ?? []) {
        for (const block of lesson.blocks ?? []) {
          if (block.type !== "video") continue;
          const assetKey = block.content?.asset_key;
          if (typeof assetKey !== "string" || !assetKey) continue;
          if (locations.has(assetKey)) {
            throw new Error(`Video asset is mapped to more than one course block: ${assetKey}`);
          }
          locations.set(assetKey, {
            courseTitle: course.title,
            moduleTitle: courseModule.title,
            lessonTitle: lesson.title,
            lessonSourceKey: lesson.source_key,
            blockSourceKey: block.source_key,
          });
        }
      }
    }
  }
  return locations;
}

export function renderHeldVideoReview(manifest, {
  mode = "static",
  mediaRoot = CANONICAL_CHECKOUT,
  verification,
} = {}) {
  if (mode === "verified" && (!verification?.verifiedAt || !verification?.lockSha256)) {
    throw new Error("Verified review rendering requires a verification timestamp and held-set SHA lock");
  }

  const held = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
  const videoCourseLocations = buildVideoCourseLocations(manifest);

  const cards = held.map((asset, index) => {
    const details = REVIEW_DETAILS[asset.source_key];
    if (!details) throw new Error(`No review details for ${asset.source_key}`);
    assertHeldAssetMatchesLock(asset);
    const absoluteVideoPath = resolveManifestMediaPath(mediaRoot, asset.local_path);
    const videoUrl = mode === "verified"
      ? mediaRoute(asset.source_key)
      : pathToFileURL(absoluteVideoPath).href;
    const vttUrl = details.evidence
      ? (mode === "verified" ? evidenceRoute(asset.source_key, "vtt") : evidenceStaticUrl(details.evidence.vtt))
      : null;
    const transcriptUrl = details.evidence
      ? (mode === "verified" ? evidenceRoute(asset.source_key, "transcript") : evidenceStaticUrl(details.evidence.transcript))
      : null;
    const evidence = details.evidence
      ? `\n      <div class="evidence"><strong>Review-only wording evidence:</strong> <a href="${escapeHtml(vttUrl)}">VTT captions</a> · <a href="${escapeHtml(transcriptUrl)}">transcript</a></div>`
      : "";
    const track = details.evidence
      ? `<track kind="captions" srclang="en" label="Review-only English captions for ${escapeHtml(details.title)}" src="${escapeHtml(vttUrl)}" default>`
      : "";
    const accessibilityNote = details.evidence
      ? "Review-only captions are available for wording verification. They are not approved learner captions."
      : "Captions and a transcript are intentionally not finalized for this cut while exact-file approval is pending.";
    const videoLabel = `${details.title} held video candidate ${index + 1} of ${held.length}`;
    const replacementRequired = REPLACEMENT_REQUIRED_CUTS.has(approvalRecordKey({
      source_key: asset.source_key,
      sha256: asset.checksum_sha256,
    }));
    const reviewStatus = replacementRequired
      ? '<p class="replacement"><strong>REPLACEMENT REQUIRED</strong> — this exact source cut is evidence only and cannot be approved.</p>'
      : '<p class="candidate"><strong>JARRAD REVIEW REQUIRED</strong> — approve or request changes on this corrected candidate.</p>';
    const location = videoCourseLocations.get(asset.source_key);
    if (!location) throw new Error(`Held video is not mapped to a course block: ${asset.source_key}`);

    return `<article class="card" data-source-key="${escapeHtml(asset.source_key)}" data-checksum="${asset.checksum_sha256}">
      <header><span class="number">${index + 1}</span><div><h2>${escapeHtml(details.title)}</h2><p class="meta">${details.duration} · ${asset.size_bytes.toLocaleString("en-US")} bytes</p></div></header>
      ${reviewStatus}
      <div class="course-location"><strong>Course location</strong><span>${escapeHtml(location.moduleTitle)} → ${escapeHtml(location.lessonTitle)}</span><code>${escapeHtml(location.lessonSourceKey)} · ${escapeHtml(location.blockSourceKey)}</code></div>
      <video controls preload="metadata" src="${escapeHtml(videoUrl)}" aria-label="${escapeHtml(videoLabel)}" title="${escapeHtml(videoLabel)}">${track}Your browser cannot play this local video.</video>
      <p class="captions-note"><strong>Accessibility:</strong> ${escapeHtml(accessibilityNote)}</p>
      <p class="reason"><strong>Why it is held:</strong> ${escapeHtml(details.reason)}</p>${evidence}
      <details><summary>Exact-file lock</summary><dl><dt>SHA-256</dt><dd><code>${asset.checksum_sha256}</code></dd><dt>Absolute source</dt><dd><code>${escapeHtml(absoluteVideoPath)}</code></dd><dt>Manifest key</dt><dd><code>${escapeHtml(asset.source_key)}</code></dd></dl></details>
    </article>`;
  }).join("\n");

  const verificationStatus = mode === "verified"
    ? `<div class="verification verified" role="status"><strong>VERIFIED LOCAL SERVER</strong><span>Verified at <time datetime="${escapeHtml(verification.verifiedAt)}">${escapeHtml(verification.verifiedAt)}</time>.</span><span>Held-set SHA-256 lock: <code>${escapeHtml(verification.lockSha256)}</code></span></div>`
    : `<div class="verification unverified" role="alert"><strong>UNVERIFIED STATIC PAGE</strong><span>Do not approve a cut from this file-only view. Run <code>node scripts/course-content/verify-held-video-review.mjs --serve</code> and review the verified local-server page.</span></div>`;
  const approvalLedgerUrl = mode === "verified" ? APPROVAL_LEDGER_ROUTE : "approvals.json";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BMH Institute — Held Video Review</title>
  <style>
    :root{color-scheme:dark;--bg:#11120f;--panel:#1c1e18;--ink:#f8f5e7;--muted:#b9b8ac;--accent:#f4cf45;--line:#3a3d32;--danger:#ff836f;--safe:#8fe388}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(1040px,calc(100% - 32px));margin:40px auto 80px}.intro{border-left:6px solid var(--accent);padding:4px 0 4px 20px;margin-bottom:30px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;color:var(--accent);font-weight:800;font-size:.76rem}h1{font-size:clamp(2rem,6vw,4rem);line-height:1;margin:.25rem 0 1rem}h2{margin:0;font-size:1.35rem}.intro p{max-width:76ch;color:var(--muted)}.warning,.replacement{color:var(--danger);font-weight:750}.candidate{color:var(--safe);font-weight:750}.verification{display:grid;gap:5px;margin:20px 0;padding:14px 16px;border:2px solid;border-radius:10px;overflow-wrap:anywhere}.verification.verified{border-color:var(--safe);color:var(--safe)}.verification.unverified{border-color:var(--danger);color:var(--danger)}.grid{display:grid;gap:22px}.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 18px 38px #0005}.card header{display:flex;gap:14px;align-items:center;margin-bottom:16px}.number{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--accent);color:#161710;font-weight:900}.meta{margin:2px 0 0;color:var(--muted)}.course-location{display:grid;gap:2px;margin:12px 0 16px;padding:10px 12px;border-left:3px solid var(--accent);background:#24261f}.course-location span{color:var(--ink)}.course-location code{color:var(--muted);overflow-wrap:anywhere}video{display:block;width:100%;max-height:70vh;border-radius:12px;background:#000}.captions-note{margin:10px 0;color:var(--muted)}.reason{margin:18px 0 8px}.evidence{margin:12px 0;padding:12px 14px;border-radius:10px;background:#2a2c24}a{color:var(--accent)}details{margin-top:14px;color:var(--muted)}summary{cursor:pointer;font-weight:700}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px}dt{font-weight:800}dd{margin:0;overflow-wrap:anywhere}code{font-size:.78rem}@media(max-width:600px){main{width:min(100% - 20px,1040px);margin-top:22px}.card{padding:14px}dl{grid-template-columns:1fr}.intro{padding-left:14px}}
  </style>
</head>
<body>
<main>
  <section class="intro">
    <div class="eyebrow">Local review only · 9 exact cuts</div>
    <h1>Held video review</h1>
    ${verificationStatus}
    <p>Six corrected candidates await Jarrad review. Approve or request changes only on those exact checksum-locked cuts; a filename alone is not approval.</p>
    <p>Compensation Engine, Operator Playbook, and Career Growth Path are policy-defective source evidence, already marked <strong>changes requested</strong>, and cannot be approved. Their replacements will receive new checksums and a separate review.</p>
    <p>Record decisions in the <a href="${approvalLedgerUrl}">checksum-keyed approval ledger</a>. Policy-safe replacement scripts and timecoded edit maps for the three blocked sources are prepared at <code>docs/course-production/held-video-recuts/README.md</code>.</p>
    <p class="warning">This page does not upload, publish, alter, caption, or approve anything.</p>
  </section>
  <section class="grid" aria-label="Held video candidates">
${cards}
  </section>
</main>
</body>
</html>
`;
}

async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
}

export async function writeHeldVideoReview() {
  const manifest = await readManifest();
  await mkdir(dirname(REVIEW_HTML_PATH), { recursive: true });
  await writeFile(
    REVIEW_HTML_PATH,
    renderHeldVideoReview(manifest, { mode: "static", mediaRoot: CANONICAL_CHECKOUT }),
    "utf8",
  );
}

export async function verifyHeldVideoReview({
  mediaRoot = resolveMediaRoot(),
  checkHtml = true,
} = {}) {
  const manifest = await readManifest();
  const held = manifest.assets.filter(
    (asset) => asset.kind === "video" && asset.approval_status === "hold",
  );
  const sourceKeys = held.map((asset) => asset.source_key);
  if (JSON.stringify(sourceKeys) !== JSON.stringify(EXPECTED_HELD_SOURCE_KEYS)) {
    throw new Error(`Held video set changed. Expected ${EXPECTED_HELD_SOURCE_KEYS.join(", ")}; got ${sourceKeys.join(", ")}`);
  }

  const files = [];
  let evidenceFileCount = 0;
  for (const asset of held) {
    const details = REVIEW_DETAILS[asset.source_key];
    if (!details) throw new Error(`Missing review details for ${asset.source_key}`);
    assertHeldAssetMatchesLock(asset);
    const absoluteVideoPath = await resolveVerifiedMediaPath(mediaRoot, asset.local_path);
    await access(absoluteVideoPath);
    const lockedVideo = await verifyAndSnapshotFile({
      absolutePath: absoluteVideoPath,
      expectedSha256: asset.checksum_sha256,
      expectedSize: asset.size_bytes,
      label: asset.source_key,
    });
    files.push({
      absolutePath: absoluteVideoPath,
      contentType: "video/mp4",
      kind: "video",
      label: asset.source_key,
      route: mediaRoute(asset.source_key),
      sha256: lockedVideo.sha256,
      snapshot: lockedVideo.snapshot,
    });

    if (details.evidence) {
      for (const [kind, expectedSha256] of [
        ["vtt", details.evidence.vttSha256],
        ["transcript", details.evidence.transcriptSha256],
      ]) {
        const relativeEvidencePath = details.evidence[kind];
        const absoluteEvidencePath = resolveManifestMediaPath(REPO_ROOT, relativeEvidencePath);
        const canonicalEvidencePath = await realpath(absoluteEvidencePath);
        if (!isPathInside(await realpath(REPO_ROOT), canonicalEvidencePath)) {
          throw new Error(`Review evidence resolves outside the repository: ${relativeEvidencePath}`);
        }
        const lockedEvidence = await verifyAndSnapshotFile({
          absolutePath: canonicalEvidencePath,
          expectedSha256,
          label: `${asset.source_key} ${kind}`,
        });
        files.push({
          absolutePath: canonicalEvidencePath,
          contentType: kind === "vtt" ? "text/vtt; charset=utf-8" : "text/markdown; charset=utf-8",
          kind,
          label: `${asset.source_key} ${kind}`,
          route: evidenceRoute(asset.source_key, kind),
          sha256: lockedEvidence.sha256,
          snapshot: lockedEvidence.snapshot,
        });
        evidenceFileCount += 1;
      }
    }
  }

  const approvalLedgerBuffer = await readFile(APPROVAL_LEDGER_PATH);
  let approvalLedger;
  try {
    approvalLedger = JSON.parse(approvalLedgerBuffer.toString("utf8"));
  } catch (error) {
    throw new Error(`Approval ledger is not valid JSON: ${error.message}`);
  }
  const approvalErrors = validateHeldVideoApprovalLedger(approvalLedger, held);
  if (approvalErrors.length) throw new Error(`Approval ledger is invalid: ${approvalErrors.join("; ")}`);
  const approvalLedgerSha256 = createHash("sha256").update(approvalLedgerBuffer).digest("hex");
  const lockedApprovalLedger = await verifyAndSnapshotFile({
    absolutePath: APPROVAL_LEDGER_PATH,
    expectedSha256: approvalLedgerSha256,
    expectedSize: approvalLedgerBuffer.length,
    label: "held video approval ledger",
  });
  files.push({
    absolutePath: APPROVAL_LEDGER_PATH,
    contentType: "application/json; charset=utf-8",
    kind: "approval-ledger",
    label: "held video approval ledger",
    route: APPROVAL_LEDGER_ROUTE,
    sha256: lockedApprovalLedger.sha256,
    snapshot: lockedApprovalLedger.snapshot,
  });

  if (checkHtml) {
    const expectedHtml = renderHeldVideoReview(manifest, {
      mode: "static",
      mediaRoot: CANONICAL_CHECKOUT,
    });
    const currentHtml = await readFile(REVIEW_HTML_PATH, "utf8");
    if (currentHtml !== expectedHtml) {
      throw new Error(`Review HTML is stale. Regenerate it before review: ${relative(REPO_ROOT, REVIEW_HTML_PATH)}`);
    }
  }

  const lockSha256 = createHash("sha256")
    .update(files
      .map((file) => `${file.route}\0${file.sha256}\0${file.snapshot.size}`)
      .sort()
      .join("\n"))
    .digest("hex");

  return {
    sourceKeys,
    videoCount: held.length,
    evidenceFileCount,
    approvalLedgerRecordCount: approvalLedger.records.length,
    htmlIsCurrent: checkHtml,
    files,
    lockSha256,
    mediaRoot: resolve(mediaRoot),
    verifiedAt: new Date().toISOString(),
  };
}

export async function assertVerificationFilesUnchanged(verification) {
  for (const file of verification.files) await assertLockedFileUnchanged(file);
}

function commonResponseHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Content-Security-Policy": "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2])) throw new Error("Invalid byte range");
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) throw new Error("Invalid suffix range");
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    throw new Error("Unsatisfiable byte range");
  }
  end = Math.min(end, size - 1);
  return { start, end };
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export function createExactlyOnceFileHandleCloser(fileHandle) {
  let closePromise;
  return () => {
    closePromise ??= fileHandle.close();
    return closePromise;
  };
}

export function createHeldVideoReviewServer({
  manifest,
  verification,
  host = "127.0.0.1",
  port = 0,
  watchIntervalMs = 250,
} = {}) {
  if (!isLoopbackHost(host)) throw new Error(`Review server must bind to loopback, not ${host}`);
  if (!manifest || !verification?.files?.length) throw new Error("Review server requires a verified manifest and locked files");

  const routeMap = new Map(verification.files.map((file) => [file.route, file]));
  const expectedRoutes = [];
  for (const sourceKey of EXPECTED_HELD_SOURCE_KEYS) {
    expectedRoutes.push(mediaRoute(sourceKey));
    const details = REVIEW_DETAILS[sourceKey];
    if (details.evidence) {
      expectedRoutes.push(evidenceRoute(sourceKey, "vtt"), evidenceRoute(sourceKey, "transcript"));
    }
  }
  expectedRoutes.push(APPROVAL_LEDGER_ROUTE);
  if (expectedRoutes.some((route) => !routeMap.has(route)) || routeMap.size !== expectedRoutes.length) {
    throw new Error("Review server refuses an incomplete or expanded verified-file route set");
  }

  let integrityError = null;
  let stopping = false;
  const activeResponses = new Set();
  const activeRequestCompletions = new Set();
  const activeMediaStreams = new Set();
  const activeFileHandleClosers = new Set();
  const pendingFileHandleCloses = new Set();
  const watchedPaths = verification.files.map((file) => file.absolutePath);
  const stopWatching = () => {
    for (const path of watchedPaths) unwatchFile(path);
  };

  let server;
  let serverListenPromise;
  let serverClosePromise;
  let runtimeClosePromise;
  const beginServerClose = () => {
    serverClosePromise ??= (async () => {
      if (serverListenPromise) {
        await serverListenPromise.catch(() => {});
      }
      if (server.listening) {
        await new Promise((resolveClose, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClose());
        });
      }
    })();
    return serverClosePromise;
  };
  const stopAfterResponse = (error, responseToFinish) => {
    if (stopping) return;
    stopping = true;
    stopWatching();
    for (const activeResponse of activeResponses) {
      if (activeResponse !== responseToFinish) activeResponse.destroy(error);
    }
    setImmediate(() => void beginServerClose().catch(() => {}));
  };
  const failIntegrity = (response, error) => {
    integrityError = error;
    response.writeHead(409, {
      ...commonResponseHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Integrity lock failed. The local review server is stopping. Re-verify the exact held files before review.\n");
    stopAfterResponse(error, response);
  };

  server = createServer(async (request, response) => {
    let resolveRequestCompletion;
    const requestCompletion = new Promise((resolveCompletion) => {
      resolveRequestCompletion = resolveCompletion;
    });
    activeRequestCompletions.add(requestCompletion);
    activeResponses.add(response);
    const forgetResponse = () => activeResponses.delete(response);
    response.once("close", forgetResponse);
    response.once("finish", forgetResponse);
    let closeFileHandle;
    try {
      if (stopping) {
        response.destroy();
        return;
      }
      if (integrityError) return failIntegrity(response, integrityError);
      await assertVerificationFilesUnchanged(verification);
      if (stopping) {
        response.destroy();
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, {
          ...commonResponseHeaders(),
          "Allow": "GET, HEAD",
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Method not allowed\n");
        return;
      }

      const pathname = new URL(request.url || "/", `http://${host}`).pathname;
      if (pathname === "/") {
        const html = renderHeldVideoReview(manifest, {
          mode: "verified",
          mediaRoot: verification.mediaRoot,
          verification,
        });
        response.writeHead(200, {
          ...commonResponseHeaders(),
          "Content-Length": Buffer.byteLength(html),
          "Content-Type": "text/html; charset=utf-8",
        });
        response.end(request.method === "HEAD" ? undefined : html);
        return;
      }

      const file = routeMap.get(pathname);
      if (!file) {
        response.writeHead(404, {
          ...commonResponseHeaders(),
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Not found\n");
        return;
      }

      const fileHandle = await open(file.absolutePath, "r");
      const closeFileHandleOnce = createExactlyOnceFileHandleCloser(fileHandle);
      closeFileHandle = () => {
        const closePromise = closeFileHandleOnce();
        if (!pendingFileHandleCloses.has(closePromise)) {
          pendingFileHandleCloses.add(closePromise);
          const forgetClose = () => {
            pendingFileHandleCloses.delete(closePromise);
            activeFileHandleClosers.delete(closeFileHandle);
          };
          closePromise.then(forgetClose, forgetClose);
        }
        return closePromise;
      };
      activeFileHandleClosers.add(closeFileHandle);
      if (stopping || response.destroyed) {
        await closeFileHandle();
        return;
      }
      const handleSnapshot = fileSnapshot(await fileHandle.stat({ bigint: true }));
      if (stopping || response.destroyed) {
        await closeFileHandle();
        return;
      }
      if (!snapshotsMatch(file.snapshot, handleSnapshot)) {
        await closeFileHandle();
        return failIntegrity(response, new Error(`Locked file changed before streaming: ${file.label}`));
      }
      const size = Number(handleSnapshot.size);
      let range;
      try {
        range = parseRange(request.headers.range, size);
      } catch {
        await closeFileHandle();
        response.writeHead(416, {
          ...commonResponseHeaders(),
          "Content-Range": `bytes */${size}`,
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Range not satisfiable\n");
        return;
      }
      const status = range ? 206 : 200;
      const start = range?.start ?? 0;
      const end = range?.end ?? size - 1;
      response.writeHead(status, {
        ...commonResponseHeaders(),
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": file.contentType,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      if (request.method === "HEAD") {
        await closeFileHandle();
        response.end();
        return;
      }
      if (stopping || response.destroyed) {
        await closeFileHandle();
        return;
      }
      const stream = fileHandle.createReadStream({ autoClose: false, start, end });
      activeMediaStreams.add(stream);
      stream.once("close", () => activeMediaStreams.delete(stream));
      const finishStreaming = () => {
        void closeFileHandle().catch((error) => {
          if (!response.destroyed) response.destroy(error);
          stopAfterResponse(error);
        });
      };
      const abortStreaming = () => {
        if (!stream.destroyed) stream.destroy();
        else finishStreaming();
      };
      request.once("aborted", abortStreaming);
      response.once("close", abortStreaming);
      stream.once("end", finishStreaming);
      stream.once("close", finishStreaming);
      stream.on("error", (error) => {
        finishStreaming();
        response.destroy(error);
        stopAfterResponse(error);
      });
      stream.pipe(response);
    } catch (error) {
      let failure = error;
      if (closeFileHandle) {
        try {
          await closeFileHandle();
        } catch (closeError) {
          failure = new AggregateError([error, closeError], "Review file failed and its handle could not be closed");
        }
      }
      if (!response.headersSent) failIntegrity(response, failure);
      else {
        response.destroy(failure);
        stopAfterResponse(failure);
      }
    } finally {
      activeRequestCompletions.delete(requestCompletion);
      resolveRequestCompletion();
    }
  });

  for (const file of verification.files) {
    watchFile(file.absolutePath, { interval: watchIntervalMs, persistent: false, bigint: true }, (current) => {
      const currentSnapshot = fileSnapshot(current);
      if (!snapshotsMatch(file.snapshot, currentSnapshot)) {
        integrityError = new Error(`Locked file stat changed after verification: ${file.label}`);
        stopAfterResponse(integrityError);
      }
    });
  }

  return {
    server,
    async listen() {
      if (stopping || runtimeClosePromise) {
        throw new Error("Held-video review runtime cannot listen after shutdown has started");
      }
      serverListenPromise ??= new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(port, host, () => {
          server.off("error", rejectListen);
          if (stopping) {
            rejectListen(new Error("Held-video review runtime shut down while starting"));
          } else {
            resolveListen();
          }
        });
      });
      await serverListenPromise;
      const address = server.address();
      const displayHost = host === "::1" ? "[::1]" : host;
      return `http://${displayHost}:${address.port}/`;
    },
    async close() {
      runtimeClosePromise ??= (async () => {
        stopping = true;
        stopWatching();
        if (serverListenPromise) {
          await serverListenPromise.catch(() => {});
        }
        const closingServer = beginServerClose();

        for (const stream of activeMediaStreams) stream.destroy();
        for (const response of activeResponses) response.destroy();
        server.closeAllConnections?.();

        while (activeRequestCompletions.size > 0) {
          await Promise.all([...activeRequestCompletions]);
        }
        for (const stream of activeMediaStreams) stream.destroy();
        for (const response of activeResponses) response.destroy();

        const closeResults = await Promise.allSettled(
          [...activeFileHandleClosers].map((closeFileHandle) => closeFileHandle()),
        );
        const pendingResults = await Promise.allSettled([...pendingFileHandleCloses]);
        await closingServer;

        const closeErrors = [...closeResults, ...pendingResults]
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason);
        if (closeErrors.length > 0) {
          throw new AggregateError(closeErrors, "One or more held-video file handles could not be closed");
        }
      })();
      await runtimeClosePromise;
    },
    get integrityError() {
      return integrityError;
    },
    get activeResourceCounts() {
      return {
        requests: activeRequestCompletions.size,
        responses: activeResponses.size,
        streams: activeMediaStreams.size,
        fileHandles: activeFileHandleClosers.size,
        pendingFileHandleCloses: pendingFileHandleCloses.size,
      };
    },
  };
}

export async function serveHeldVideoReview({
  mediaRoot = resolveMediaRoot(),
  host = "127.0.0.1",
  port = 0,
} = {}) {
  const manifest = await readManifest();
  const verification = await verifyHeldVideoReview({ mediaRoot });
  const runtime = createHeldVideoReviewServer({ manifest, verification, host, port });
  const url = await runtime.listen();
  return { ...runtime, url, verification };
}

function parseCliArgs(argv) {
  const options = { host: "127.0.0.1", port: 0, serve: false, write: false };
  const nextValue = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--serve") options.serve = true;
    else if (arg === "--write") options.write = true;
    else if (arg === "--media-root") options.mediaRoot = nextValue(index++, arg);
    else if (arg.startsWith("--media-root=")) options.mediaRoot = arg.slice("--media-root=".length);
    else if (arg === "--host") options.host = nextValue(index++, arg);
    else if (arg.startsWith("--host=")) options.host = arg.slice("--host=".length);
    else if (arg === "--port") options.port = Number(nextValue(index++, arg));
    else if (arg.startsWith("--port=")) options.port = Number(arg.slice("--port=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.write && options.serve) throw new Error("--write and --serve cannot be combined");
  if (options.mediaRoot === "") throw new Error("--media-root requires a path");
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error("--port must be an integer from 0 to 65535");
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let cliOptions;
  try {
    cliOptions = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Held video review configuration failed: ${error.message}`);
    process.exitCode = 1;
  }

  if (cliOptions) {
    const mediaRoot = resolveMediaRoot({ cliValue: cliOptions.mediaRoot });
    const operation = cliOptions.serve
      ? serveHeldVideoReview({ mediaRoot, host: cliOptions.host, port: cliOptions.port })
      : (cliOptions.write
          ? writeHeldVideoReview().then(() => verifyHeldVideoReview({ mediaRoot }))
          : verifyHeldVideoReview({ mediaRoot }));
    operation
      .then((result) => {
        if (cliOptions.serve) {
          console.log(`Verified ${result.verification.videoCount} held videos and ${result.verification.evidenceFileCount} review evidence files.`);
          console.log(`Held-set SHA-256 lock: ${result.verification.lockSha256}`);
          console.log(`Review server: ${result.url}`);
          console.log("Press Ctrl-C to stop. The server will also stop if a locked file changes.");
        } else {
          console.log(`Verified ${result.videoCount} held videos and ${result.evidenceFileCount} review evidence files.`);
          console.log(`Held-set SHA-256 lock: ${result.lockSha256}`);
          console.log(`Static page (unverified fallback only): ${REVIEW_HTML_PATH}`);
        }
      })
      .catch((error) => {
        console.error(`Held video review verification failed: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
