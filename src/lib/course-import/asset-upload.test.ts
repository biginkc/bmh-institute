import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createVerifiedFileSnapshot } from "./asset-staging";
import {
  COURSE_IMPORT_BUCKET,
  JsonTusUrlStorage,
  assertSafeTusRequestUrl,
  createTusResumeFingerprint,
  openPinnedVerifiedFile,
  resumableEndpoint,
  uploadApprovedAssets,
  type CourseImportUploadBucket,
} from "./asset-upload";
import type { CourseImportAsset } from "./manifest";

const tempRoots: string[] = [];
const ENDPOINT = "https://project.storage.supabase.co/storage/v1/upload/resumable";

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("course import approved asset uploads", () => {
  it("makes zero storage and TUS calls for held and missing assets", async () => {
    const root = await makeTempRoot();
    const approved = asset(Buffer.from("approved"));
    let storageCalls = 0;
    let tusCalls = 0;
    const bucket = {
      async info() {
        storageCalls += 1;
        throw new Error("unapproved assets must not reach storage");
      },
      download() {
        storageCalls += 1;
        throw new Error("unapproved assets must not reach storage");
      },
      async remove() {
        storageCalls += 1;
        return { error: null };
      },
    };

    await uploadApprovedAssets({
      endpoint: ENDPOINT,
      serviceKey: "test-only",
      importId: "import-v1",
      sourceRoot: root,
      assets: [
        { ...approved, source_key: "held", approval_status: "hold" },
        { ...approved, source_key: "missing", approval_status: "missing" },
      ],
      bucket,
      stateRoot: join(root, "state"),
      async startTusUpload() {
        tusCalls += 1;
        return "00000000-0000-4000-8000-000000000000";
      },
    });

    expect(storageCalls).toBe(0);
    expect(tusCalls).toBe(0);
  });

  it("never performs a non-atomic delete after failed exact verification", async () => {
    const root = await makeTempRoot();
    const bytes = Buffer.from("approved");
    const approved = asset(bytes);
    await mkdir(join(root, "assets"));
    await writeFile(join(root, approved.local_path), bytes);
    const remote = remoteBucket();

    await expect(
      uploadApprovedAssets({
        endpoint: ENDPOINT,
        serviceKey: "test-only",
        importId: "import-v1",
        sourceRoot: root,
        assets: [approved],
        bucket: remote.bucket,
        stateRoot: join(root, "state"),
        async startTusUpload(request) {
          remote.set({
            bytes: Buffer.from("tampered"),
            metadata: {
              sha256: request.checksum,
              course_import_upload_id: request.ownershipToken,
            },
          });
          return request.ownershipToken;
        },
      }),
    ).rejects.toThrow(/preserved because storage does not offer a conditional delete/i);

    expect(remote.removed).toEqual([]);
    expect(remote.current()).not.toBeNull();
  });

  it("preserves a failed-verification object when attempt ownership cannot be proven", async () => {
    const root = await makeTempRoot();
    const bytes = Buffer.from("approved");
    const approved = asset(bytes);
    await mkdir(join(root, "assets"));
    await writeFile(join(root, approved.local_path), bytes);
    const remote = remoteBucket();

    await expect(
      uploadApprovedAssets({
        endpoint: ENDPOINT,
        serviceKey: "test-only",
        importId: "import-v1",
        sourceRoot: root,
        assets: [approved],
        bucket: remote.bucket,
        stateRoot: join(root, "state"),
        async startTusUpload(request) {
          remote.set({
            bytes: Buffer.from("tampered"),
            metadata: {
              sha256: request.checksum,
              course_import_upload_id: "another-upload-attempt",
            },
          });
          return request.ownershipToken;
        },
      }),
    ).rejects.toThrow(/preserved because storage does not offer a conditional delete/i);

    expect(remote.removed).toEqual([]);
    expect(remote.current()).not.toBeNull();
  });

  it("requires immutable size and checksum evidence for every approved upload", async () => {
    const root = await makeTempRoot();
    let storageCalls = 0;
    const approved = {
      ...asset(Buffer.from("approved")),
      checksum_sha256: null,
      size_bytes: null,
    };

    await expect(
      uploadApprovedAssets({
        endpoint: ENDPOINT,
        serviceKey: "test-only",
        importId: "import-v1",
        sourceRoot: root,
        assets: [approved],
        bucket: {
          async info() {
            storageCalls += 1;
            return { data: { size: 8, metadata: {} }, error: null };
          },
          download() {
            storageCalls += 1;
            return Promise.resolve({ data: new Blob(["anything"]), error: null });
          },
          async remove() {
            storageCalls += 1;
            return { error: null };
          },
        },
      }),
    ).rejects.toThrow(/approved asset.*size_bytes.*checksum_sha256/i);
    expect(storageCalls).toBe(0);
  });
});

describe("pinned verified upload bytes", () => {
  it("keeps serving verified snapshot bytes after the original source mutates", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source.bin");
    const destination = join(root, "snapshot.bin");
    const bytes = Buffer.from("first-chunk-second-chunk");
    await writeFile(source, bytes);
    const snapshot = await createVerifiedFileSnapshot({
      source,
      destination,
      expectedSize: bytes.length,
      expectedChecksum: sha256(bytes),
    });
    const pinned = await openPinnedVerifiedFile(snapshot);

    await writeFile(source, Buffer.alloc(bytes.length, "x"));
    const result = await pinned.source.slice(0, bytes.length);

    expect(Buffer.compare(result.value, bytes)).toBe(0);
    await pinned.close();
  });

  it("keeps later chunks on the pinned inode when the snapshot path is replaced", async () => {
    const root = await makeTempRoot();
    const source = join(root, "source.bin");
    const destination = join(root, "snapshot.bin");
    const bytes = Buffer.from("first-chunk-second-chunk");
    const split = "first-chunk-".length;
    await writeFile(source, bytes);
    const snapshot = await createVerifiedFileSnapshot({
      source,
      destination,
      expectedSize: bytes.length,
      expectedChecksum: sha256(bytes),
    });
    const pinned = await openPinnedVerifiedFile(snapshot);

    const first = await pinned.source.slice(0, split);
    await writeFile(destination, Buffer.alloc(bytes.length, "z"));
    const second = await pinned.source.slice(split, bytes.length);

    expect(Buffer.compare(Buffer.concat([first.value, second.value]), bytes)).toBe(0);
    await pinned.close();
  });
});

describe("TUS resume isolation", () => {
  it("partitions fingerprints by endpoint, bucket, checksum, and storage path", () => {
    const base = {
      endpoint: ENDPOINT,
      bucket: COURSE_IMPORT_BUCKET,
      checksum: "a".repeat(64),
      storagePath: "courses/import/v1/a.bin",
    };
    const fingerprints = [
      createTusResumeFingerprint(base),
      createTusResumeFingerprint({
        ...base,
        endpoint: "https://other.storage.supabase.co/storage/v1/upload/resumable",
      }),
      createTusResumeFingerprint({ ...base, bucket: "other" }),
      createTusResumeFingerprint({ ...base, checksum: "b".repeat(64) }),
      createTusResumeFingerprint({ ...base, storagePath: "courses/import/v1/b.bin" }),
    ];

    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(resumableEndpoint("https://project.supabase.co/")).toBe(ENDPOINT);
  });

  it("drops tampered resume URLs outside the exact origin or resumable route", async () => {
    const root = await makeTempRoot();
    const statePath = join(root, "tus.json");
    const fingerprint = createTusResumeFingerprint({
      endpoint: ENDPOINT,
      bucket: COURSE_IMPORT_BUCKET,
      checksum: "a".repeat(64),
      storagePath: "courses/import/v1/a.bin",
    });
    const checksum = "a".repeat(64);
    const storagePath = "courses/import/v1/a.bin";
    const stored = (uploadUrl: string, key: string) => ({
      size: 1,
      metadata: {
        bucketName: COURSE_IMPORT_BUCKET,
        objectName: storagePath,
        contentType: "application/octet-stream",
        metadata: JSON.stringify({
          sha256: checksum,
          course_import_id: "import-v1",
          course_import_upload_id: "00000000-0000-4000-8000-000000000000",
        }),
      },
      creationTime: key,
      urlStorageKey: key,
      uploadUrl,
      parallelUploadUrls: null,
      fingerprint,
    });
    await writeFile(
      statePath,
      JSON.stringify({
        safe: stored(`${ENDPOINT}/safe-id`, "safe"),
        wrongOrigin: stored(
          "https://attacker.example/storage/v1/upload/resumable/stolen",
          "wrongOrigin",
        ),
        wrongRoute: stored(
          "https://project.storage.supabase.co/storage/v1/object/stolen",
          "wrongRoute",
        ),
        bareEndpoint: stored(ENDPOINT, "bareEndpoint"),
        nestedRoute: stored(`${ENDPOINT}/upload-id/extra`, "nestedRoute"),
      }),
    );

    const storage = new JsonTusUrlStorage(statePath, {
      endpoint: ENDPOINT,
      fingerprint,
      size: 1,
      bucket: COURSE_IMPORT_BUCKET,
      storagePath,
      checksum,
      contentType: "application/octet-stream",
      importId: "import-v1",
    });
    const uploads = await storage.findUploadsByFingerprint(fingerprint);

    expect(uploads.map((upload) => upload.urlStorageKey)).toEqual(["safe"]);
    expect(await readFile(statePath, "utf8")).not.toMatch(
      /attacker|wrongRoute|bareEndpoint|nestedRoute/,
    );
  });

  it("rejects an unsafe request URL before the HTTP stack can send credentials", () => {
    expect(() => assertSafeTusRequestUrl(ENDPOINT, ENDPOINT)).not.toThrow();
    expect(() =>
      assertSafeTusRequestUrl(`${ENDPOINT}/upload-id`, ENDPOINT),
    ).not.toThrow();
    expect(() =>
      assertSafeTusRequestUrl(
        "https://attacker.example/storage/v1/upload/resumable/upload-id",
        ENDPOINT,
      ),
    ).toThrow(/unsafe TUS upload URL/i);
    expect(() =>
      assertSafeTusRequestUrl(
        "https://project.storage.supabase.co/storage/v1/upload/resumable-evil/upload-id",
        ENDPOINT,
      ),
    ).toThrow(/unsafe TUS upload URL/i);
    expect(() =>
      assertSafeTusRequestUrl(`${ENDPOINT}/%252e%252e/object/upload-id`, ENDPOINT),
    ).toThrow(/unsafe TUS upload URL/i);
    expect(() =>
      assertSafeTusRequestUrl(`${ENDPOINT}/%2f..%2fobject/upload-id`, ENDPOINT),
    ).toThrow(/unsafe TUS upload URL/i);
    expect(() =>
      assertSafeTusRequestUrl(`${ENDPOINT}/upload-id/%2e%2e/sibling`, ENDPOINT),
    ).toThrow(/unsafe TUS upload URL/i);
    expect(() =>
      assertSafeTusRequestUrl(`${ENDPOINT}/upload-id/../sibling`, ENDPOINT),
    ).toThrow(/unsafe TUS upload URL/i);
  });

  it("rejects cleartext cloud endpoints before credentials can be attached", () => {
    expect(() =>
      resumableEndpoint("http://project.supabase.co"),
    ).toThrow(/https/i);
    expect(resumableEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
  });

  it("drops a same-origin resume whose stored scope does not match the current asset", async () => {
    const root = await makeTempRoot();
    const statePath = join(root, "tus.json");
    const checksum = "a".repeat(64);
    const storagePath = "courses/import/v1/a.bin";
    const fingerprint = createTusResumeFingerprint({
      endpoint: ENDPOINT,
      bucket: COURSE_IMPORT_BUCKET,
      checksum,
      storagePath,
    });
    await writeFile(
      statePath,
      JSON.stringify({
        forged: {
          size: 1,
          metadata: {
            bucketName: COURSE_IMPORT_BUCKET,
            objectName: "courses/import/v1/different.bin",
            contentType: "application/octet-stream",
            metadata: JSON.stringify({
              sha256: checksum,
              course_import_id: "import-v1",
              course_import_upload_id: "00000000-0000-4000-8000-000000000000",
            }),
          },
          creationTime: "forged",
          urlStorageKey: "forged",
          uploadUrl: `${ENDPOINT}/unrelated-upload`,
          parallelUploadUrls: null,
          fingerprint,
        },
      }),
    );

    const storage = new JsonTusUrlStorage(statePath, {
      endpoint: ENDPOINT,
      fingerprint,
      size: 1,
      bucket: COURSE_IMPORT_BUCKET,
      storagePath,
      checksum,
      contentType: "application/octet-stream",
      importId: "import-v1",
    });

    await expect(storage.findUploadsByFingerprint(fingerprint)).resolves.toEqual([]);
    await expect(readFile(statePath, "utf8")).resolves.not.toContain("unrelated-upload");
  });

  it("serializes concurrent state updates without losing either resume URL", async () => {
    const root = await makeTempRoot();
    const statePath = join(root, "tus.json");
    const left = resumeStorage(statePath, "left", "a".repeat(64));
    const right = resumeStorage(statePath, "right", "b".repeat(64));

    await Promise.all([
      left.storage.addUpload(left.fingerprint, resumableUpload(left, "left-created")),
      right.storage.addUpload(right.fingerprint, resumableUpload(right, "right-created")),
    ]);

    const persisted = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    expect(Object.keys(persisted)).toHaveLength(2);
    expect(await left.storage.findUploadsByFingerprint(left.fingerprint)).toHaveLength(1);
    expect(await right.storage.findUploadsByFingerprint(right.fingerprint)).toHaveLength(1);
    expect((await readdir(root)).filter((entry) => entry.includes(".tmp-"))).toEqual([]);
  });

  it("recovers a stale lock left by a crashed writer and fails closed on corrupt JSON", async () => {
    const root = await makeTempRoot();
    const statePath = join(root, "tus.json");
    const scoped = resumeStorage(statePath, "stale", "c".repeat(64));
    await mkdir(`${statePath}.lock`);
    const old = new Date(Date.now() - 60_000);
    await utimes(`${statePath}.lock`, old, old);

    await expect(
      scoped.storage.addUpload(scoped.fingerprint, resumableUpload(scoped, "after-crash")),
    ).resolves.toContain(scoped.fingerprint);
    await writeFile(statePath, "{not-json", "utf8");
    await expect(scoped.storage.findAllUploads()).rejects.toThrow(/malformed/i);
    await expect(readFile(statePath, "utf8")).resolves.toBe("{not-json");
  });
});

function resumeStorage(statePath: string, name: string, checksum: string) {
  const storagePath = `courses/import/v1/${name}.bin`;
  const fingerprint = createTusResumeFingerprint({
    endpoint: ENDPOINT,
    bucket: COURSE_IMPORT_BUCKET,
    checksum,
    storagePath,
  });
  return {
    fingerprint,
    storagePath,
    checksum,
    storage: new JsonTusUrlStorage(statePath, {
      endpoint: ENDPOINT,
      fingerprint,
      size: 1,
      bucket: COURSE_IMPORT_BUCKET,
      storagePath,
      checksum,
      contentType: "application/octet-stream",
      importId: "import-v1",
    }),
  };
}

function resumableUpload(
  scoped: ReturnType<typeof resumeStorage>,
  creationTime: string,
) {
  return {
    size: 1,
    metadata: {
      bucketName: COURSE_IMPORT_BUCKET,
      objectName: scoped.storagePath,
      contentType: "application/octet-stream",
      metadata: JSON.stringify({
        sha256: scoped.checksum,
        course_import_id: "import-v1",
        course_import_upload_id: "00000000-0000-4000-8000-000000000000",
      }),
    },
    creationTime,
    urlStorageKey: creationTime,
    uploadUrl: `${ENDPOINT}/${creationTime}`,
    parallelUploadUrls: null,
  };
}

function remoteBucket() {
  let object: { bytes: Buffer; metadata: Record<string, unknown> } | null = null;
  const removed: string[][] = [];
  const bucket: CourseImportUploadBucket = {
    async info() {
      return object
        ? {
            data: { size: object.bytes.length, metadata: object.metadata },
            error: null,
          }
        : {
            data: null,
            error: { message: "not found", statusCode: "404" },
          };
    },
    async download() {
      return object
        ? { data: new Blob([Uint8Array.from(object.bytes).buffer]), error: null }
        : { data: null, error: { message: "not found", statusCode: "404" } };
    },
    async remove(paths) {
      removed.push(paths);
      object = null;
      return { error: null };
    },
  };
  return {
    bucket,
    removed,
    set(value: NonNullable<typeof object>) {
      object = value;
    },
    current() {
      return object;
    },
  };
}

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "bmh-course-upload-"));
  tempRoots.push(root);
  return root;
}

function asset(bytes: Buffer): CourseImportAsset {
  const checksum = sha256(bytes);
  return {
    source_key: "approved",
    kind: "download",
    local_path: "assets/file.bin",
    storage_path: `courses/import/v1/${checksum}.bin`,
    mime_type: "application/octet-stream",
    checksum_sha256: checksum,
    size_bytes: bytes.length,
    approval_status: "approved",
  };
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
