import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  CANONICAL_CHECKOUT,
  MEDIA_ROOT_ENV,
  assertLockedFileUnchanged,
  assertHeldAssetMatchesLock,
  captureFileSnapshot,
  createExactlyOnceFileHandleCloser,
  createHeldVideoReviewServer,
  renderHeldVideoReview,
  resolveManifestMediaPath,
  resolveMediaRoot,
  resolveVerifiedMediaPath,
  verifyHeldVideoReview,
} from "../../scripts/course-content/verify-held-video-review.mjs";
import {
  REPLACEMENT_REQUIRED_CUTS,
} from "../../scripts/course-content/held-video-approval-ledger.mjs";

const manifestPromise = readFile(
  new URL("./bmh-employee-training.v1.json", import.meta.url),
  "utf8",
).then(JSON.parse);
const approvalLedgerPromise = readFile(
  new URL("../../docs/course-production/held-video-review/approvals.json", import.meta.url),
  "utf8",
).then(JSON.parse);
const localPolicyCandidatesPromise = readFile(
  new URL("../../docs/course-production/held-video-review/local-policy-candidates.json", import.meta.url),
  "utf8",
).then(JSON.parse);
const heldReviewDocPromise = readFile(
  new URL("../../docs/course-production/HELD-VIDEO-REVIEW.md", import.meta.url),
  "utf8",
);
const recutReadmePromise = readFile(
  new URL("../../docs/course-production/held-video-recuts/README.md", import.meta.url),
  "utf8",
);
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

const EXPECTED_QC_ROUTES = [
  [
    "video-slot-01-welcome",
    "29249f2093ae76daf8e4c6425398b6708b3252539c66fc059cdc6f0bf49bf901",
  ],
  [
    "video-slot-01-mindset",
    "8184b9dcf4e424294843523a7480fd8afef215d627dffa46ef3a3a257c910ee1",
  ],
  [
    "video-slot-02-terms",
    "e5b41f3003d45eb5ddfc0a43234965c4a0fab4ec547b830abed9bc6db58f535a",
  ],
  [
    "video-slot-10-objection-scripts",
    "2ab1372ebb65592326403a5df78b8aefeb7d29f90a0f8d743096b359c8b32368",
  ],
  [
    "video-slot-15-closing",
    "4bdb2786b9b5565a259c66df3ff0aa3af2a6ad6c7ae7d909af437309090bf5ac",
  ],
  [
    "video-slot-16-kpis",
    "1caee68cd969142939138676d66494a16cfd4ab67682535ac445fdccd1100ee2",
  ],
].map(([sourceKey, sha256]) => ({
  route: `/evidence/${sourceKey}/qc-report.md`,
  sha256,
}));

test("held-video prose stays aligned with the checksum-keyed approval ledger", async () => {
  const [ledger, candidates, heldReviewDoc, recutReadme] = await Promise.all([
    approvalLedgerPromise,
    localPolicyCandidatesPromise,
    heldReviewDocPromise,
    recutReadmePromise,
  ]);
  const pending = ledger.records.filter((record) => record.decision === "pending");
  const changesRequested = ledger.records.filter(
    (record) => record.decision === "changes_requested",
  );
  const approved = ledger.records.filter((record) => record.decision === "approved");

  assert.equal(pending.length, 0);
  assert.equal(changesRequested.length, 2);
  assert.equal(approved.length, 9);
  assert.equal(
    candidates.candidates.filter(
      (candidate) => candidate.approval_status === "pending_unapproved",
    ).length,
    pending.length,
  );
  assert.match(heldReviewDoc, /Nine exact cuts are approved/);
  assert.match(heldReviewDoc, /no corrected candidate remains pending/i);
  assert.match(heldReviewDoc, /two historical source records remain `changes_requested`/i);
  assert.match(recutReadme, /none remains pending/i);
  assert.doesNotMatch(heldReviewDoc, /five corrected candidates? remain pending/i);
  assert.doesNotMatch(recutReadme, /Two local policy-cut candidates? remain pending/i);
});

test(
  "the local review surface locks both candidates and all nine original source-evidence videos",
  {
    skip: canonicalMediaAvailable
      ? false
      : "canonical held-video files are not present on this runner",
  },
  async () => {
    const result = await verificationPromise;
    assert.deepEqual(result.sourceKeys, [
      "video-slot-02-terms",
      "video-slot-16-kpis",
      "video-slot-01-welcome",
      "video-slot-01-mindset",
      "video-slot-02-terms",
      "video-slot-10-objection-scripts",
      "video-slot-15-closing",
      "video-slot-16-kpis",
      "video-slot-17-compensation",
      "video-slot-18-operator",
      "video-slot-19-career",
    ]);
    assert.equal(result.videoCount, 11);
    assert.equal(result.evidenceFileCount, 12);
    assert.equal(result.approvedDerivativeFileCount, 9);
    assert.equal(result.approvalLedgerRecordCount, 11);
    assert.equal(result.localPolicyCandidateCount, 2);
    assert.equal(result.pendingCandidateCount, 0);
    assert.equal(result.approvedExactCutCount, 9);
    assert.equal(result.htmlIsCurrent, true);
    assert.deepEqual(
      result.files
        .filter((file) => file.kind === "qc-report")
        .map(({ route, sha256 }) => ({ route, sha256 })),
      EXPECTED_QC_ROUTES,
    );
  },
);

async function createSyntheticVerification(manifest) {
  const [approvalLedger, localPolicyCandidates] = await Promise.all([
    approvalLedgerPromise,
    localPolicyCandidatesPromise,
  ]);
  const fixtureRoot = await mkdtemp(join(tmpdir(), "held-review-server-"));
  const reviewHtml = renderHeldVideoReview(manifest, {
    mode: "verified",
    mediaRoot: fixtureRoot,
    verification: {
      lockSha256: "a".repeat(64),
      verifiedAt: "2026-07-16T12:34:56.000Z",
    },
    approvalLedger,
    localPolicyCandidates,
  });
  const routes = [
    ...new Set([
      ...[
        ...reviewHtml.matchAll(
          /(?:src|href)="(\/(?:media|evidence|review|learner-derivatives)\/[^\"]+)"/g,
        ),
      ].map((match) => match[1]),
      "/approval-ledger.json",
      "/local-policy-candidates.json",
    ]),
  ];
  assert.equal(
    routes.length,
    34,
    "synthetic verification must cover the exact locked route set",
  );

  const records = approvalLedger.records.map((record) => ({
    source_key: record.source_key,
    decision: record.decision,
  }));
  const files = [];
  for (const [index, route] of routes.entries()) {
    const absolutePath = join(fixtureRoot, `locked-${index}`);
    let contents = "synthetic held-video review evidence\n";
    let contentType = "text/markdown; charset=utf-8";
    let kind = "transcript";
    if (route.startsWith("/media/")) {
      contents = Buffer.alloc(512 * 1024, index);
      contentType = "video/mp4";
      kind = "video";
    } else if (route.endsWith(".vtt")) {
      contents = "WEBVTT\n\n00:00.000 --> 00:01.000\nSynthetic caption.\n";
      contentType = "text/vtt; charset=utf-8";
      kind = "vtt";
    } else if (route.endsWith("/qc-report.md")) {
      contents = "# Synthetic QC report\n\nQC: PASS\n";
      kind = "qc-report";
    } else if (route === "/approval-ledger.json") {
      contents = `${JSON.stringify({ records })}\n`;
      contentType = "application/json; charset=utf-8";
      kind = "approval-ledger";
    } else if (route === "/local-policy-candidates.json") {
      contents = `${JSON.stringify(localPolicyCandidates)}\n`;
      contentType = "application/json; charset=utf-8";
      kind = "local-policy-candidate-inventory";
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
      sourceKeys: records.map((record) => record.source_key),
      videoCount: 11,
      evidenceFileCount: 12,
      approvalLedgerRecordCount: 11,
      htmlIsCurrent: true,
      files,
      lockSha256: "b".repeat(64),
      mediaRoot: fixtureRoot,
      verifiedAt: "2026-07-16T12:34:56.000Z",
      approvalLedger,
      localPolicyCandidates,
    },
  };
}

function abortRangeRequest(url, route) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = get(new URL(route, url), {
      headers: { Range: "bytes=0-524287" },
    });
    request.once("error", (error) => {
      if (error.code === "ECONNRESET") resolveRequest();
      else rejectRequest(error);
    });
    request.once("response", (response) => {
      response.once("error", (error) => {
        if (error.code === "ECONNRESET") resolveRequest();
        else rejectRequest(error);
      });
      response.once("close", resolveRequest);
      response.destroy();
    });
  });
}

test("the file-handle closer invokes close exactly once across competing completion paths", async () => {
  let closeCalls = 0;
  const close = createExactlyOnceFileHandleCloser({
    async close() {
      closeCalls += 1;
    },
  });

  await Promise.all([close(), close(), close()]);
  assert.equal(closeCalls, 1);
});

test("the review lock fails closed when a held cut changes", () => {
  const approvalLedger = {
    records: [{
      source_key: "video-slot-01-welcome",
      sha256: "1".repeat(64),
      candidate_local_path: "course-assets/review-lessonA/LESSON-1A-v7.mp4",
      decision: "pending",
    }],
  };
  assert.throws(
    () =>
      assertHeldAssetMatchesLock({
        source_key: "video-slot-01-welcome",
        local_path: "course-assets/review-lessonA/LESSON-1A-v8.mp4",
        checksum_sha256: "0".repeat(64),
        size_bytes: 1,
      }, approvalLedger),
    /Held cut changed in the manifest/,
  );
});

test("media-root selection honors CLI override, then environment, then the documented default", () => {
  assert.equal(
    resolveMediaRoot({
      cliValue: "/tmp/held-cli",
      env: { [MEDIA_ROOT_ENV]: "/tmp/held-env" },
    }),
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

    assert.equal(
      resolveManifestMediaPath(fixtureRoot, "inside.mp4"),
      insidePath,
    );
    assert.equal(
      await resolveVerifiedMediaPath(fixtureRoot, "inside.mp4"),
      await realpath(insidePath),
    );
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
  const [manifest, approvalLedger, localPolicyCandidates] = await Promise.all([
    manifestPromise,
    approvalLedgerPromise,
    localPolicyCandidatesPromise,
  ]);
  const staticHtml = renderHeldVideoReview(manifest, {
    approvalLedger,
    localPolicyCandidates,
  });
  const verifiedHtml = renderHeldVideoReview(manifest, {
    mode: "verified",
    verification: {
      lockSha256: "a".repeat(64),
      verifiedAt: "2026-07-16T12:34:56.000Z",
    },
    approvalLedger,
    localPolicyCandidates,
  });

  assert.match(staticHtml, /UNVERIFIED STATIC PAGE/);
  assert.match(staticHtml, /verify-held-video-review\.mjs --serve/);
  assert.match(staticHtml, /approvals\.json/);
  assert.match(staticHtml, /held-video-recuts\/README\.md/);
  assert.equal((staticHtml.match(/REPLACEMENT REQUIRED/g) || []).length, 2);
  assert.equal(
    (staticHtml.match(/Checksum-locked QC evidence/g) || []).length,
    6,
  );
  assert.match(staticHtml, /Nine exact cuts have checksum-bound Jarrad approval/);
  assert.match(staticHtml, /Terms Glossary v10 local policy cut/);
  assert.match(staticHtml, /KPIs and Sales Telemetry v12 local policy cut/);
  assert.match(staticHtml, /Local edit decision/);
  assert.match(staticHtml, /Exact review status/);
  assert.match(staticHtml, /Terms v10, KPIs v12, and seven directly approved source cuts are exact-cut approved/);
  assert.match(staticHtml, /APPROVED EXACT CUT/);
  assert.match(staticHtml, /Orientation → Welcome and Mindset/);
  assert.match(
    staticHtml,
    /Objections and Questions → Objection Scripts Playbook/,
  );
  assert.match(
    staticHtml,
    /Cadence, Scripts, and Close → Closing and Deal Engineering/,
  );
  assert.match(staticHtml, /Performance and Career → KPIs and Sales Telemetry/);
  assert.match(staticHtml, /block-video-video-slot-16-kpis/);
  assert.doesNotMatch(staticHtml, /VERIFIED LOCAL SERVER/);
  assert.match(verifiedHtml, /VERIFIED LOCAL SERVER/);
  assert.match(verifiedHtml, /2026-07-16T12:34:56\.000Z/);
  assert.match(verifiedHtml, new RegExp("a{64}"));

  const ariaLabels = [
    ...staticHtml.matchAll(/<video [^>]*aria-label="([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(ariaLabels.length, 11);
  assert.equal(new Set(ariaLabels).size, 11);
  assert.equal(
    ariaLabels.filter((label) => label.includes("corrected review candidate"))
      .length,
    0,
  );
  assert.equal(ariaLabels.filter((label) => label.includes("approved exact cut")).length, 9);
  assert.equal(
    ariaLabels.filter((label) => label.includes("policy-defective source evidence"))
      .length,
    2,
  );
  assert.doesNotMatch(staticHtml, /held video candidate 7 of 9/);
  assert.equal(
    (staticHtml.match(/data-review-kind="pending-review-candidate"/g) || [])
      .length,
    0,
  );
  assert.equal((staticHtml.match(/data-review-kind="approved-exact-cut"/g) || []).length, 9);
  assert.equal(
    (staticHtml.match(/data-review-kind="replacement-source-evidence"/g) || [])
      .length,
    2,
  );
  assert.equal((staticHtml.match(/<track [^>]* default>/g) || []).length, 9);
  assert.equal(
    (
      staticHtml.match(
        /Captions are intentionally not finalized/g,
      ) || []
    ).length,
    0,
  );
  assert.match(staticHtml, /Learner captions are finalized and approved for this exact cut/);
  assert.match(staticHtml, /Why this correction was required:/);
  assert.doesNotMatch(staticHtml, /learner derivatives and release reconciliation remain gated/);

  const termsCard = staticHtml.match(
    /<article class="card" data-source-key="video-slot-02-terms" data-checksum="6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769"[\s\S]*?<\/article>/,
  )?.[0];
  assert.ok(termsCard);
  assert.match(termsCard, /data-review-kind="approved-exact-cut"/);
  assert.match(termsCard, /Approved learner accessibility/);
  assert.doesNotMatch(termsCard, /candidate|held|gated|being finalized|remain gated|JARRAD REVIEW REQUIRED|Why it is held/i);

  const kpiCard = staticHtml.match(
    /<article class="card" data-source-key="video-slot-16-kpis" data-checksum="3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a"[\s\S]*?<\/article>/,
  )?.[0];
  assert.ok(kpiCard);
  assert.match(kpiCard, /data-review-kind="approved-exact-cut"/);
  assert.match(kpiCard, /APPROVED EXACT CUT/);
  assert.match(kpiCard, /Approved learner accessibility/);
  assert.doesNotMatch(kpiCard, /JARRAD REVIEW REQUIRED|corrected review candidate/);
});

test("approved exact cuts reject mixed or unlocked learner derivative metadata", async () => {
  const [baseManifest, approvalLedger, localPolicyCandidates] = await Promise.all([
    manifestPromise,
    approvalLedgerPromise,
    localPolicyCandidatesPromise,
  ]);
  const mixed = structuredClone(baseManifest);
  mixed.assets.find((asset) => asset.source_key === "caption-video-slot-02-terms").approval_status = "missing";
  assert.throws(
    () => renderHeldVideoReview(mixed, { approvalLedger, localPolicyCandidates }),
    /learner caption is not approved/,
  );

  const unlocked = structuredClone(baseManifest);
  unlocked.assets.find((asset) => asset.source_key === "caption-video-slot-02-terms").checksum_sha256 = null;
  assert.throws(
    () => renderHeldVideoReview(unlocked, { approvalLedger, localPolicyCandidates }),
    /not checksum-locked/,
  );
});

test("the review surface keeps all originals as evidence with both corrected cuts approved", async () => {
  const [manifest, approvalLedger, localPolicyCandidates] = await Promise.all([
    manifestPromise,
    approvalLedgerPromise,
    localPolicyCandidatesPromise,
  ]);
  const html = renderHeldVideoReview(manifest, {
    approvalLedger,
    localPolicyCandidates,
  });
  assert.equal((html.match(/REPLACEMENT REQUIRED/g) || []).length, 2);
  assert.equal((html.match(/JARRAD REVIEW REQUIRED/g) || []).length, 0);
  assert.equal((html.match(/APPROVED EXACT CUT/g) || []).length, 9);
  assert.equal((html.match(/data-review-kind="pending-review-candidate"/g) || []).length, 0);
  assert.equal((html.match(/data-review-kind="approved-exact-cut"/g) || []).length, 9);
  assert.equal((html.match(/data-review-kind="replacement-source-evidence"/g) || []).length, 2);
  assert.doesNotMatch(html, /data-review-kind="corrected-review-candidate"/);
  for (const reason of REPLACEMENT_REQUIRED_CUTS.values()) {
    assert.ok(html.includes(reason), `missing exact policy-defect reason: ${reason}`);
  }
  assert.equal(
    (
      html.match(
        /This cut is source evidence only and cannot be approved\. Learner captions wait for the replacement cut\./g,
      ) || []
    ).length,
    2,
  );
  assert.equal(
    (
      html.match(
        /Captions are intentionally not finalized for this candidate while exact-file approval is pending\./g,
      ) || []
    ).length,
    0,
  );
});

test("candidate edit language is HTML-escaped on the local review surface", async () => {
  const [manifest, approvalLedger, baseCandidates] = await Promise.all([
    manifestPromise,
    approvalLedgerPromise,
    localPolicyCandidatesPromise,
  ]);
  const localPolicyCandidates = structuredClone(baseCandidates);
  localPolicyCandidates.candidates[0].edit_decision_list[0].removed_language =
    '<img src=x onerror="alert(1)">';
  const html = renderHeldVideoReview(manifest, {
    approvalLedger,
    localPolicyCandidates,
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
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
    assert.equal(
      rangeResponse.headers.get("content-range"),
      `bytes 0-15/${video.snapshot.size}`,
    );
    assert.match(rangeResponse.headers.get("cache-control"), /no-store/);
    assert.equal((await rangeResponse.arrayBuffer()).byteLength, 16);

    const evidence = verification.files.find((file) => file.kind === "vtt");
    const evidenceResponse = await fetch(new URL(evidence.route, url), {
      method: "HEAD",
    });
    assert.equal(evidenceResponse.status, 200);
    assert.match(evidenceResponse.headers.get("content-type"), /text\/vtt/);

    const qcReports = verification.files.filter(
      (file) => file.kind === "qc-report",
    );
    assert.equal(qcReports.length, 6);
    for (const qcReport of qcReports) {
      const qcResponse = await fetch(new URL(qcReport.route, url));
      assert.equal(qcResponse.status, 200);
      assert.match(qcResponse.headers.get("content-type"), /text\/markdown/);
      assert.match(qcResponse.headers.get("cache-control"), /no-store/);
      assert.match(await qcResponse.text(), /Synthetic QC report/);
    }

    const approvalLedger = verification.files.find(
      (file) => file.kind === "approval-ledger",
    );
    const ledgerResponse = await fetch(new URL(approvalLedger.route, url));
    assert.equal(ledgerResponse.status, 200);
    assert.match(ledgerResponse.headers.get("cache-control"), /no-store/);
    const ledger = await ledgerResponse.json();
    assert.equal(ledger.records.length, 11);
    assert.equal(
      ledger.records.filter((record) => record.decision === "pending").length,
      0,
    );
    assert.equal(
      ledger.records.filter((record) => record.decision === "changes_requested")
        .length,
      2,
    );

    const unknownResponse = await fetch(new URL("/media/not-locked.mp4", url));
    assert.equal(unknownResponse.status, 404);
    assert.match(unknownResponse.headers.get("cache-control"), /no-store/);
  } finally {
    await runtime.close();
    await fixture.cleanup();
  }
});

test("concurrent aborted media ranges do not prevent a second desktop or mobile-style page load", async () => {
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
    const videoRoutes = verification.files
      .filter((file) => file.kind === "video")
      .map((file) => file.route);
    assert.equal(videoRoutes.length, 11);

    await Promise.all(
      videoRoutes.map((route) => abortRangeRequest(url, route)),
    );

    const desktopResponse = await fetch(url, {
      headers: { "User-Agent": "Desktop Chrome held-video review" },
    });
    assert.equal(desktopResponse.status, 200);
    assert.match(await desktopResponse.text(), /VERIFIED LOCAL SERVER/);

    const mobileResponse = await fetch(url, {
      headers: { "User-Agent": "Mobile Safari held-video review" },
    });
    assert.equal(mobileResponse.status, 200);
    assert.match(await mobileResponse.text(), /VERIFIED LOCAL SERVER/);
    assert.equal(runtime.integrityError, null);
  } finally {
    await runtime.close();
    await fixture.cleanup();
  }
});

test("runtime close terminates a paused media client and waits for its file handle", async () => {
  const manifest = await manifestPromise;
  const fixture = await createSyntheticVerification(manifest);
  const { verification } = fixture;
  const video = verification.files.find((file) => file.kind === "video");
  await writeFile(video.absolutePath, Buffer.alloc(32 * 1024 * 1024, 7));
  video.snapshot = await captureFileSnapshot(video.absolutePath);

  const runtime = createHeldVideoReviewServer({
    manifest,
    verification,
    watchIntervalMs: 60_000,
  });
  const url = await runtime.listen();
  let request;
  let pausedResponse;
  try {
    pausedResponse = await new Promise((resolveResponse, rejectResponse) => {
      request = get(new URL(video.route, url));
      request.once("error", rejectResponse);
      request.once("response", (response) => {
        response.pause();
        resolveResponse(response);
      });
    });
    request.removeAllListeners("error");
    request.on("error", () => {});

    let timeout;
    await Promise.race([
      runtime.close(),
      new Promise((_, rejectTimeout) => {
        timeout = setTimeout(
          () =>
            rejectTimeout(
              new Error("runtime.close() hung on a paused media response"),
            ),
          2_000,
        );
      }),
    ]).finally(() => clearTimeout(timeout));

    assert.equal(runtime.server.listening, false);
    assert.equal(pausedResponse.complete, false);
    assert.deepEqual(runtime.activeResourceCounts, {
      requests: 0,
      responses: 0,
      streams: 0,
      fileHandles: 0,
      pendingFileHandleCloses: 0,
    });
    await assert.doesNotReject(
      runtime.close(),
      "runtime close remains idempotent",
    );
  } finally {
    pausedResponse?.destroy();
    request?.destroy();
    await runtime.close();
    await fixture.cleanup();
  }
});

test("the review runtime is one-shot when closed before listening", async () => {
  const manifest = await manifestPromise;
  const fixture = await createSyntheticVerification(manifest);
  const runtime = createHeldVideoReviewServer({
    manifest,
    verification: fixture.verification,
    watchIntervalMs: 60_000,
  });
  try {
    await runtime.close();
    assert.equal(runtime.server.listening, false);
    await assert.rejects(
      runtime.listen(),
      /cannot listen after shutdown has started/,
    );
    await assert.doesNotReject(
      runtime.close(),
      "a pre-listen close remains idempotent",
    );
    assert.equal(runtime.server.listening, false);
  } finally {
    await runtime.close();
    await fixture.cleanup();
  }
});

test("concurrent startup and shutdown never leave a listening review server", async () => {
  const manifest = await manifestPromise;
  const fixture = await createSyntheticVerification(manifest);
  try {
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const runtime = createHeldVideoReviewServer({
        manifest,
        verification: fixture.verification,
        watchIntervalMs: 60_000,
      });
      const listen = runtime.listen();
      const close = runtime.close();
      const [listenResult, closeResult] = await Promise.allSettled([
        listen,
        close,
      ]);
      assert.equal(
        closeResult.status,
        "fulfilled",
        `close failed in iteration ${iteration}`,
      );
      assert.equal(
        runtime.server.listening,
        false,
        `server leaked in iteration ${iteration}`,
      );
      if (listenResult.status === "fulfilled") {
        assert.match(
          listenResult.value,
          /^http:\/\/(?:127\.0\.0\.1|\[::1\]):\d+\/$/,
        );
      } else {
        assert.match(listenResult.reason.message, /shut down while starting/);
      }
      await assert.doesNotReject(runtime.close());
    }
  } finally {
    await fixture.cleanup();
  }
});

test("integrity-watch shutdown during startup never leaves a listening server", async () => {
  const manifest = await manifestPromise;
  const fixture = await createSyntheticVerification(manifest);
  const watchedFile = fixture.verification.files[0];
  try {
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const runtime = createHeldVideoReviewServer({
        manifest,
        verification: fixture.verification,
        host: "localhost",
        watchIntervalMs: 1,
      });
      const listenResult = Promise.allSettled([runtime.listen()]);
      await writeFile(
        watchedFile.absolutePath,
        `integrity-startup-${iteration}\n`,
        "utf8",
      );

      const integrityDeadline = Date.now() + 500;
      while (!runtime.integrityError && Date.now() < integrityDeadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 1));
      }
      assert.ok(
        runtime.integrityError,
        `watcher did not observe mutation in iteration ${iteration}`,
      );
      await listenResult;
      await runtime.close();
      assert.equal(
        runtime.server.listening,
        false,
        `server leaked in iteration ${iteration}`,
      );

      watchedFile.snapshot = await captureFileSnapshot(
        watchedFile.absolutePath,
      );
    }
  } finally {
    await fixture.cleanup();
  }
});

test("the verified server returns an integrity failure and stops for a stale stat lock", async () => {
  const manifest = await manifestPromise;
  const fixture = await createSyntheticVerification(manifest);
  const { verification } = fixture;
  const staleVerification = {
    ...verification,
    files: verification.files.map((file, index) =>
      index === 0
        ? {
            ...file,
            snapshot: {
              ...file.snapshot,
              mtimeNs: String(BigInt(file.snapshot.mtimeNs) + 1n),
            },
          }
        : file,
    ),
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
