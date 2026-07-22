import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  commitTransaction,
  recoverPendingTransaction,
} from "./promote-thumbnail-redesign.mjs";

const checksum = (value) => createHash("sha256").update(value).digest("hex");

async function tempRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "bmh-thumbnail-transaction-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function put(root, relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

test("promotion transaction resumes after interruption without mixed canonical state", async (t) => {
  const root = await tempRoot(t);
  const writes = [
    { target: "course-assets/thumbnails/slot-01.webp", contents: Buffer.from("new-thumbnail") },
    { target: "docs/course-production/thumbnail-pilots/production-ledger.json", contents: Buffer.from("new-ledger") },
    { target: "content/course-manifests/bmh-employee-training.v1.json", contents: Buffer.from("new-manifest") },
  ];
  for (const item of writes) await put(root, item.target, Buffer.from(`old-${item.target}`));

  await assert.rejects(
    commitTransaction(writes, { root, failAfterWrites: 1 }),
    /Injected thumbnail promotion failure after 1 writes/,
  );
  assert.equal((await readFile(path.join(root, writes[0].target))).toString(), "new-thumbnail");
  assert.equal((await readFile(path.join(root, writes[1].target))).toString(), `old-${writes[1].target}`);
  assert.equal((await readFile(path.join(root, "course-assets/thumbnails/.redesign-promotion-transaction/journal.json"))).length > 0, true);

  assert.equal(await recoverPendingTransaction({ root }), true);
  for (const item of writes) assert.deepEqual(await readFile(path.join(root, item.target)), item.contents);
  await assert.rejects(
    readFile(path.join(root, "course-assets/thumbnails/.redesign-promotion-transaction/journal.json")),
    { code: "ENOENT" },
  );
});

test("promotion recovery rejects a journal target outside the strict allowlist", async (t) => {
  const root = await tempRoot(t);
  const staged = Buffer.from("hostile");
  const transactionRoot = "course-assets/thumbnails/.redesign-promotion-transaction";
  await put(root, `${transactionRoot}/staged-01.bin`, staged);
  await put(root, `${transactionRoot}/journal.json`, Buffer.from(`${JSON.stringify({
    schema_version: "bmh-thumbnail-redesign-transaction/v1",
    writes: [{
      target: "../outside.webp",
      before_sha256: checksum(Buffer.from("old")),
      after_sha256: checksum(staged),
    }],
  })}\n`));

  await assert.rejects(
    recoverPendingTransaction({ root }),
    /transaction target is not allowed/,
  );
});

test("promotion transaction resumes poster and canary writes together", async (t) => {
  const root = await tempRoot(t);
  const writes = [
    { target: "course-assets/posters/video-slot-03-tech-stack.webp", contents: Buffer.from("new-poster") },
    { target: "content/course-manifests/bmh-employee-training-canary.v1.json", contents: Buffer.from("new-canary") },
    { target: "docs/course-production/thumbnail-pilots/production-ledger.json", contents: Buffer.from("new-ledger") },
  ];
  for (const item of writes) await put(root, item.target, Buffer.from(`old-${item.target}`));

  await assert.rejects(
    commitTransaction(writes, { root, failAfterWrites: 2 }),
    /Injected thumbnail promotion failure after 2 writes/,
  );
  assert.equal(await recoverPendingTransaction({ root }), true);
  for (const item of writes) assert.deepEqual(await readFile(path.join(root, item.target)), item.contents);
});
