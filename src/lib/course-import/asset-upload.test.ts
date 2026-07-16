import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("removes a failed exact-verification upload only when this attempt owns it", async () => {
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
    ).rejects.toThrow(/owned new object was removed/i);

    expect(remote.removed).toEqual([[approved.storage_path]]);
    expect(remote.current()).toBeNull();
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
    ).rejects.toThrow(/preserved because this import could not prove ownership/i);

    expect(remote.removed).toEqual([]);
    expect(remote.current()).not.toBeNull();
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
    const stored = (uploadUrl: string, key: string) => ({
      size: 1,
      metadata: {
        metadata: JSON.stringify({
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
      }),
    );

    const storage = new JsonTusUrlStorage(statePath, ENDPOINT);
    const uploads = await storage.findUploadsByFingerprint(fingerprint);

    expect(uploads.map((upload) => upload.urlStorageKey)).toEqual(["safe"]);
    expect(await readFile(statePath, "utf8")).not.toMatch(/attacker|wrongRoute/);
  });

  it("rejects an unsafe request URL before the HTTP stack can send credentials", () => {
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
  });
});

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
