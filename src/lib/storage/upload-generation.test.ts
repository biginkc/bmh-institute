import { describe, expect, it } from "vitest";

import {
  clearUploadGeneration,
  getOrCreateUploadGeneration,
  uploadGenerationStorageKey,
} from "./upload-generation";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const input = {
  bucket: "submissions",
  ownerId: "learner-1",
  pathPrefix: "learner-1/assignment-1",
  file: { name: "answer.pdf", size: 42, lastModified: 123 },
};

describe("upload generation", () => {
  it("keeps one generation stable while an interrupted upload is resumable", () => {
    const storage = memoryStorage();
    let sequence = 0;
    const createId = () => `generation-${++sequence}`;
    const first = getOrCreateUploadGeneration(input, { storage, createId });
    const resumed = getOrCreateUploadGeneration(input, { storage, createId });
    expect(resumed).toEqual(first);
    expect(sequence).toBe(1);
  });

  it("rotates the generation after success so the exact same file can be submitted again", () => {
    const storage = memoryStorage();
    let sequence = 0;
    const createId = () => `generation-${++sequence}`;
    const first = getOrCreateUploadGeneration(input, { storage, createId });
    clearUploadGeneration(first.storageKey, storage);
    const revision = getOrCreateUploadGeneration(input, { storage, createId });
    expect(revision.generationId).toBe("generation-2");
    expect(revision.generationId).not.toBe(first.generationId);
  });

  it("scopes resumable generations to owner, bucket, prefix, and file identity", () => {
    expect(uploadGenerationStorageKey(input)).not.toBe(uploadGenerationStorageKey({
      ...input,
      ownerId: "learner-2",
    }));
    expect(uploadGenerationStorageKey(input)).not.toBe(uploadGenerationStorageKey({
      ...input,
      file: { ...input.file, lastModified: 124 },
    }));
  });

  it("replaces a corrupted persisted generation before building an object path", () => {
    const storage = memoryStorage();
    const key = uploadGenerationStorageKey(input);
    storage.setItem(key, "../../escape");
    expect(getOrCreateUploadGeneration(input, {
      storage,
      createId: () => "safe-generation",
    }).generationId).toBe("safe-generation");
  });
});
