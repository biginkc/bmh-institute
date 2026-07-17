import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  CANONICAL_CHECKOUT,
  EXPECTED_HELD_SOURCE_KEYS,
  MEDIA_ROOT_ENV,
  assertLockedFileUnchanged,
  assertHeldAssetMatchesLock,
  captureFileSnapshot,
  createHeldVideoReviewServer,
  renderHeldVideoReview,
  resolveManifestMediaPath,
  resolveMediaRoot,
  resolveVerifiedMediaPath,
  verifyHeldVideoReview,
} from "../../scripts/course-content/verify-held-video-review.mjs";

const manifestPromise = readFile(
  new URL("./bmh-employee-training.v1.json", import.meta.url),
  "utf8",
).then(JSON.parse);
const configuredMediaRoot = resolveMediaRoot();
let canonicalMediaAvailable = true;
try {
  await realpath(configuredMediaRoot);
} catch {
  canonicalMediaAvailable = false;
}
const verificationPromise = canonicalMediaAvailable
  ? verifyHeldVideoReview({ mediaRoot: configuredMediaRoot })
  : null;

test("the local review surface is locked to every held manifest video", {
  skip: canonicalMediaAvailable ? false : "canonical held-video files are not present on this runner",
}, async () => {
  const result = await verificationPromise;

  assert.deepEqual(result.sourceKeys, EXPECTED_HELD_SOURCE_KEYS);
  assert.equal(result.videoCount, 9);
  assert.equal(result.evidenceFileCount, 6);
  assert.equal(result.approvalLedgerRecordCount, 9);
  assert.equal(result.htmlIsCurrent, true);
});

async function createSyntheticVerification(manifest) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "held-review-server-"));
  const reviewHtml = renderHeldVideoReview(manifest, {
    mode: "verified",
    mediaRoot: fixtureRoot,
    verification: {
      lockSha256: "a".repeat(64),
      verifiedAt: "2026-07-16T12:34:56.000Z",
    },
  });
  const routes = [...new Set(
    [
      ...[...reviewHtml.matchAll(/(?:src|href)="(\/(?:media|evidence|review)\/[^\"]+)"/g)]
        .map((match) => match[1]),
      "/approval-ledger.json",
    ],
  )];
  assert.equal(routes.length, 16, "synthetic verification must cover the exact locked route set");

  const records = EXPECTED_HELD_SOURCE_KEYS.map((sourceKey, index) => ({
    source_key: sourceKey,
    decision: index < 6 ? "pending" : "changes_requested",
  }));
  const files = [];
  for (const [index, route] of routes.entries()) {
    const absolutePath = join(fixtureRoot, `locked-${index}`);
    let contents = "synthetic held-video review evidence\n";
    let contentType = "text/markdown; charset=utf-8";
    let kind = "transcript";
    if (route.startsWith("/media/")) {
      contents = "0123456789abcdef0123456789abcdef";
      contentType = "video/mp4";
      kind = "video";
    } else if (route.endsWith(".vtt")) {
      contents = "WEBVTT\n\n00:00.000 --> 00:01.000\nSynthetic caption.\n";
      contentType = "text/vtt; charset=utf-8";
      kind = "vtt";
    } else if (route === "/approval-ledger.json") {
      contents = `${JSON.stringify({ records })}\n`;
      contentType = "application/json; charset=utf-8";
      kind = "approval-ledger";
    }
    await writeFile(absolutePath, contents, "utf8");
    files.push({
      absolutePath,
      contentType,
      kind,
      label: route,
      route,
      sha256: "b".repeat(64),
      snapshot: await captureFileSnapshot(absolutePath),
    });
  }

  return {
    cleanup: () => rm(fixtureRoot, { force: true, recursive: true }),
    verification: {
      sourceKeys: EXPECTED_HELD_SOURCE_KEYS,
      videoCount: 9,
      evidenceFileCount: 6,
      approvalLedgerRecordCount: 9,
      htmlIsCurrent: true,
      files,
      lockSha256: "b".repeat(64),
      mediaRoot: fixtureRoot,
      verifiedAt: "2026-07-16T12:34:56.000Z",
    },
  };
}

test("the review lock fails closed when a held cut changes", () => {
  assert.throws(
    () => assertHeldAssetMatchesLock({
      source_key: "video-slot-01-welcome",
      local_path: "course-assets/review-lessonA/LESSON-1A-v8.mp4",
      checksum_sha256: "0".repeat(64),
      size_bytes: 1,
    }),
    /Held cut changed in the manifest/,
  );
});

test("media-root selection honors CLI override, then environment, then the documented default", () => {
  assert.equal(
    resolveMediaRoot({ cliValue: "/tmp/held-cli", env: { [MEDIA_ROOT_ENV]: "/tmp/held-env" } }),
    resolve("/tmp/held-cli"),
  );
  assert.equal(
    resolveMediaRoot({ env: { [MEDIA_ROOT_ENV]: "/tmp/held-env" } }),
    resolve("/tmp/held-env"),
  );
  assert.equal(resolveMediaRoot({ env: {} }), resolve(CANONICAL_CHECKOUT));
});

test("media paths reject traversal, absolute paths, and symlinks outside the configured root", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "held-review-root-"));
  const outsideRoot = await mkdtemp(join(tmpdir(), "held-review-outside-"));
  try {
    const insidePath = join(fixtureRoot, "inside.mp4");
    const outsidePath = join(outsideRoot, "outside.mp4");
    await writeFile(insidePath, "inside", "utf8");
    await writeFile(outsidePath, "outside", "utf8");
    await symlink(outsidePath, join(fixtureRoot, "escaped.mp4"));

    assert.equal(resolveManifestMediaPath(fixtureRoot, "inside.mp4"), insidePath);
    assert.equal(await resolveVerifiedMediaPath(fixtureRoot, "inside.mp4"), await realpath(insidePath));
    assert.throws(
      () => resolveManifestMediaPath(fixtureRoot, "../outside.mp4"),
      /escapes the configured media root/,
    );
    assert.throws(
      () => resolveManifestMediaPath(fixtureRoot, outsidePath),
      /must be relative/,
    );
    await assert.rejects(
      resolveVerifiedMediaPath(fixtureRoot, "escaped.mp4"),
      /resolves outside the configured media root/,
    );
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
  }
});

test("a locked file is refused after its stat identity changes", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "held-review-stale-"));
  try {
    const fixturePath = join(fixtureRoot, "candidate.mp4");
    await writeFile(fixturePath, "first", "utf8");
    const record = {
      absolutePath: fixturePath,
      label: "test candidate",
      snapshot: await captureFileSnapshot(fixturePath),
    };
    await assert.doesNotReject(assertLockedFileUnchanged(record));
    await writeFile(fixturePath, "second", "utf8");
    await assert.rejects(
      assertLockedFileUnchanged(record),
      /Locked file stat changed after verification/,
    );
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});

test("static and verified pages make trust state and caption availability explicit", async () => {
  const manifest = await manifestPromise;
  const staticHtml = renderHeldVideoReview(manifest);
  const verifiedHtml = renderHeldVideoReview(manifest, {
    mode: "verified",
    verification: {
      lockSha256: "a".repeat(64),
      verifiedAt: "2026-07-16T12:34:56.000Z",
    },
  });

  assert.match(staticHtml, /UNVERIFIED STATIC PAGE/);
  assert.match(staticHtml, /verify-held-video-review\.mjs --serve/);
  assert.match(staticHtml, /approvals\.json/);
  assert.match(staticHtml, /held-video-recuts\/README\.md/);
  assert.equal((staticHtml.match(/REPLACEMENT REQUIRED/g) || []).length, 3);
  assert.match(staticHtml, /Six corrected candidates await Jarrad review/);
  assert.match(staticHtml, /Orientation → Welcome and Mindset/);
  assert.match(staticHtml, /Objections and Questions → Objection Scripts Playbook/);
  assert.match(staticHtml, /Cadence, Scripts, and Close → Closing and Deal Engineering/);
  assert.match(staticHtml, /Performance and Career → KPIs and Sales Telemetry/);
  assert.match(staticHtml, /block-video-video-slot-16-kpis/);
  assert.doesNotMatch(staticHtml, /Uses the approved non-finale closer/);
  assert.match(staticHtml, /Uses the selected non-finale closer/);
  assert.doesNotMatch(staticHtml, /VERIFIED LOCAL SERVER/);
  assert.match(verifiedHtml, /VERIFIED LOCAL SERVER/);
  assert.match(verifiedHtml, /2026-07-16T12:34:56\.000Z/);
  assert.match(verifiedHtml, new RegExp("a{64}"));

  const ariaLabels = [...staticHtml.matchAll(/<video [^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ariaLabels.length, 9);
  assert.equal(new Set(ariaLabels).size, 9);
  assert.equal((staticHtml.match(/<track [^>]* default>/g) || []).length, 3);
  assert.equal(
    (staticHtml.match(/Captions and a transcript are intentionally not finalized/g) || []).length,
    6,
  );
});

test("the verified server serves only locked routes with no-store and byte ranges", async () => {
  const manifest = await manifestPromise;
  const fixture = await createSyntheticVerification(manifest);
  const { verification } = fixture;
  const runtime = createHeldVideoReviewServer({
    manifest,
    verification,
    watchIntervalMs: 60_000,
  });
  const url = await runtime.listen();
  try {
    const pageResponse = await fetch(url);
    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get("cache-control"), /no-store/);
    assert.match(await pageResponse.text(), /VERIFIED LOCAL SERVER/);

    const video = verification.files.find((file) => file.kind === "video");
    const rangeResponse = await fetch(new URL(video.route, url), {
      headers: { Range: "bytes=0-15" },
    });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("content-range"), `bytes 0-15/${video.snapshot.size}`);
    assert.match(rangeResponse.headers.get("cache-control"), /no-store/);
    assert.equal((await rangeResponse.arrayBuffer()).byteLength, 16);

    const evidence = verification.files.find((file) => file.kind === "vtt");
    const evidenceResponse = await fetch(new URL(evidence.route, url), { method: "HEAD" });
    assert.equal(evidenceResponse.status, 200);
    assert.match(evidenceResponse.headers.get("content-type"), /text\/vtt/);

    const approvalLedger = verification.files.find((file) => file.kind === "approval-ledger");
    const ledgerResponse = await fetch(new URL(approvalLedger.route, url));
    assert.equal(ledgerResponse.status, 200);
    assert.match(ledgerResponse.headers.get("cache-control"), /no-store/);
    const ledger = await ledgerResponse.json();
    assert.equal(ledger.records.length, 9);
    assert.equal(ledger.records.filter((record) => record.decision === "pending").length, 6);
    assert.equal(ledger.records.filter((record) => record.decision === "changes_requested").length, 3);

    const unknownResponse = await fetch(new URL("/media/not-locked.mp4", url));
    assert.equal(unknownResponse.status, 404);
    assert.match(unknownResponse.headers.get("cache-control"), /no-store/);
  } finally {
    await runtime.close();
    await fixture.cleanup();
  }
});

test("the verified server returns an integrity failure and stops for a stale stat lock", async () => {
  const manifest = await manifestPromise;
  const fixture = await createSyntheticVerification(manifest);
  const { verification } = fixture;
  const staleVerification = {
    ...verification,
    files: verification.files.map((file, index) => index === 0
      ? {
          ...file,
          snapshot: {
            ...file.snapshot,
            mtimeNs: String(BigInt(file.snapshot.mtimeNs) + 1n),
          },
        }
      : file),
  };
  const runtime = createHeldVideoReviewServer({
    manifest,
    verification: staleVerification,
    watchIntervalMs: 60_000,
  });
  const url = await runtime.listen();
  try {
    const response = await fetch(url);
    assert.equal(response.status, 409);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(await response.text(), /Integrity lock failed/);
  } finally {
    await runtime.close();
    await fixture.cleanup();
  }
});
