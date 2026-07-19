import { describe, expect, it, vi } from "vitest";

import {
  remoteObjectMatchesUpload,
  uploadSmallBrowserObject,
  type BrowserUploadBucket,
} from "./browser-upload";

const checksum = "a".repeat(64);
const file = new Blob(["exact browser upload"]);

function bucket(options: {
  uploadError?: unknown;
  uploadRejects?: boolean;
  remoteSize?: number;
  remoteChecksum?: string;
  infoError?: unknown;
}) {
  return {
    upload: vi.fn(async () => {
      if (options.uploadRejects) throw options.uploadError;
      return { error: options.uploadError ?? null };
    }),
    info: vi.fn(async () => ({
      data: options.infoError
        ? null
        : {
            size: options.remoteSize ?? file.size,
            metadata: { sha256: options.remoteChecksum ?? checksum },
          },
      error: options.infoError ?? null,
    })),
  } satisfies BrowserUploadBucket;
}

describe("small browser uploads", () => {
  it("stores the SHA-256 metadata and does not inspect storage after a normal success", async () => {
    const storage = bucket({});

    await uploadSmallBrowserObject({
      bucket: storage,
      path: "learner/answer.pdf",
      file,
      contentType: "application/pdf",
      checksum,
    });

    expect(storage.upload).toHaveBeenCalledWith("learner/answer.pdf", file, {
      contentType: "application/pdf",
      metadata: { sha256: checksum },
      upsert: false,
    });
    expect(storage.info).not.toHaveBeenCalled();
  });

  it("accepts a lost response or retry conflict only when the committed object is exact", async () => {
    const storage = bucket({ uploadError: new Error("409 object already exists") });

    await expect(uploadSmallBrowserObject({
      bucket: storage,
      path: "learner/answer.pdf",
      file,
      contentType: "application/pdf",
      checksum,
    })).resolves.toBeUndefined();

    expect(storage.info).toHaveBeenCalledWith("learner/answer.pdf");
  });

  it("also verifies an exact committed object when the upload promise rejects", async () => {
    const storage = bucket({
      uploadError: new TypeError("network response was lost"),
      uploadRejects: true,
    });

    await expect(uploadSmallBrowserObject({
      bucket: storage,
      path: "learner/answer.pdf",
      file,
      contentType: "application/pdf",
      checksum,
    })).resolves.toBeUndefined();
  });

  it.each([
    ["size differs", { remoteSize: file.size + 1 }],
    ["checksum differs", { remoteChecksum: "b".repeat(64) }],
    ["the info request fails", { infoError: new Error("info unavailable") }],
  ])("preserves the original upload failure when %s", async (_label, mismatch) => {
    const uploadError = new Error("original upload failure");
    const storage = bucket({ uploadError, ...mismatch });

    await expect(uploadSmallBrowserObject({
      bucket: storage,
      path: "learner/answer.pdf",
      file,
      contentType: "application/pdf",
      checksum,
    })).rejects.toBe(uploadError);
  });

  it("requires both exact size and exact checksum", () => {
    expect(remoteObjectMatchesUpload(
      { size: file.size, metadata: { sha256: checksum } },
      { size: file.size, checksum },
    )).toBe(true);
    expect(remoteObjectMatchesUpload(
      { size: file.size, metadata: null },
      { size: file.size, checksum },
    )).toBe(false);
  });
});
