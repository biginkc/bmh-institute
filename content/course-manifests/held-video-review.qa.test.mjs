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
const verificationPromise = verifyHeldVideoReview();

test("the local review surface is locked to every held manifest video", async () => {
  const result = await verificationPromise;

  assert.deepEqual(result.sourceKeys, EXPECTED_HELD_SOURCE_KEYS);
  assert.equal(result.videoCount, 9);
  assert.equal(result.evidenceFileCount, 6);
  assert.equal(result.approvalLedgerRecordCount, 9);
  assert.equal(result.htmlIsCurrent, true);
});

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
  const [manifest, verification] = await Promise.all([manifestPromise, verificationPromise]);
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
    assert.ok(ledger.records.every((record) => record.decision === "pending"));

    const unknownResponse = await fetch(new URL("/media/not-locked.mp4", url));
    assert.equal(unknownResponse.status, 404);
    assert.match(unknownResponse.headers.get("cache-control"), /no-store/);
  } finally {
    await runtime.close();
  }
});

test("the verified server returns an integrity failure and stops for a stale stat lock", async () => {
  const [manifest, verification] = await Promise.all([manifestPromise, verificationPromise]);
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
  }
});
