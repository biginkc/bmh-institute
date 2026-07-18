type UploadFileIdentity = {
  name: string;
  size: number;
  lastModified: number;
};

type UploadGenerationInput = {
  bucket: string;
  ownerId: string;
  pathPrefix?: string;
  file: UploadFileIdentity;
};

type GenerationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const SAFE_GENERATION_ID = /^[a-zA-Z0-9_-]{1,80}$/;

export function uploadGenerationStorageKey(input: UploadGenerationInput): string {
  return [
    "bmh-upload-generation-v1",
    input.bucket,
    input.ownerId,
    input.pathPrefix ?? "",
    input.file.size,
    input.file.lastModified,
    input.file.name,
  ].map((part) => encodeURIComponent(String(part))).join(":");
}

export function getOrCreateUploadGeneration(
  input: UploadGenerationInput,
  options: {
    storage?: GenerationStorage;
    createId?: () => string;
  } = {},
) {
  const storage = options.storage ?? window.localStorage;
  const createId = options.createId ?? (() => crypto.randomUUID());
  const storageKey = uploadGenerationStorageKey(input);
  let generationId = storage.getItem(storageKey);
  if (!generationId || !SAFE_GENERATION_ID.test(generationId)) {
    generationId = createId();
    if (!SAFE_GENERATION_ID.test(generationId)) {
      throw new Error("Upload generation ID is invalid.");
    }
    storage.setItem(storageKey, generationId);
  }
  return { generationId, storageKey };
}

export function clearUploadGeneration(storageKey: string, storage?: GenerationStorage) {
  (storage ?? window.localStorage).removeItem(storageKey);
}
