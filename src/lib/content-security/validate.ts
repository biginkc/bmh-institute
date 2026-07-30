export const MAX_CONTENT_BLOCK_BYTES = 100 * 1024;
export const MAX_FLASHCARDS = 100;
export const MAX_FLASHCARD_SIDE_LENGTH = 2_000;

type Content = Record<string, unknown>;
type BlockType =
  | "video" | "text" | "pdf" | "image" | "audio" | "download"
  | "external_link" | "embed" | "role_play" | "divider" | "callout" | "flashcard";

export type Flashcard = { front: string; back: string };
export type FlashcardParseResult =
  | { ok: true; cards: Flashcard[] }
  | { ok: false; errors: string[] };

export type ContentValidationResult =
  | { ok: true; value: Content; errors: [] }
  | { ok: false; value: Content; errors: string[] };

const PROVIDER_HOSTS: Record<string, ReadonlySet<string>> = {
  youtube: new Set(["youtube.com", "www.youtube.com", "youtu.be"]),
  vimeo: new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]),
  loom: new Set(["loom.com", "www.loom.com"]),
};
const EMBED_HOSTS = new Set([
  "loom.com", "www.loom.com", "youtube.com", "www.youtube.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be",
  "vimeo.com", "www.vimeo.com", "player.vimeo.com", "fast.wistia.net",
]);
const STORAGE_FIELDS = new Set([
  "file_path", "poster_path", "caption_path", "transcript_path",
]);

export function safeRuntimeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}

export function safeStoragePath(value: unknown): string | null {
  return isSafeStoragePath(value) ? value.trim() : null;
}

export function safeAuthoredUrl(
  value: unknown,
  policy: "external_link" | "audio" | "embed" | "generic" | string,
): string | null {
  if (typeof value !== "string") return null;
  const copy: Content = { url: value };
  const errors: string[] = [];
  validateUrlField(copy, policy, "url", errors);
  return errors.length === 0 ? String(copy.url) : null;
}

export function parseFlashcardText(value: string): FlashcardParseResult {
  const errors: string[] = [];
  const cards: Flashcard[] = [];
  for (const [index, rawLine] of value.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const separators = (line.match(/\|/gu) ?? []).length;
    if (separators !== 1) {
      errors.push(`Line ${index + 1}: expected \`front | back\` with exactly one separator.`);
      continue;
    }
    const [front, back] = line.split("|").map((part) => part.trim());
    if (!front) errors.push(`Line ${index + 1}: front is required.`);
    if (!back) errors.push(`Line ${index + 1}: back is required.`);
    if (!front || !back) continue;
    if (front.length > MAX_FLASHCARD_SIDE_LENGTH) {
      errors.push(`Line ${index + 1}: front must be at most ${MAX_FLASHCARD_SIDE_LENGTH} characters.`);
    }
    if (back.length > MAX_FLASHCARD_SIDE_LENGTH) {
      errors.push(`Line ${index + 1}: back must be at most ${MAX_FLASHCARD_SIDE_LENGTH} characters.`);
    }
    cards.push({ front, back });
  }
  if (errors.length === 0 && (cards.length < 1 || cards.length > MAX_FLASHCARDS)) {
    errors.push(`Flashcards must contain between 1 and ${MAX_FLASHCARDS} cards.`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, cards };
}

export function validateAuthoredContent(
  blockType: BlockType | string,
  input: unknown,
): ContentValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, value: {}, errors: ["Content must be an object."] };
  const value = { ...input };

  for (const key of Object.keys(value)) {
    if (key === "signed_url" || key.endsWith("_signed_url")) {
      errors.push(`${key} is runtime-only and cannot be authored.`);
    }
    if (STORAGE_FIELDS.has(key)) {
      const raw = value[key];
      if (raw !== null && raw !== undefined && raw !== "" && !isSafeStoragePath(raw)) {
        errors.push(`${key} must be a relative storage path.`);
      } else if (typeof raw === "string") {
        value[key] = raw.trim();
      }
    }
  }

  validateUrlField(value, "external_link", "url", errors);
  validateUrlField(value, "audio", "url", errors);
  if (blockType === "embed") validateUrlField(value, "embed", "iframe_src", errors);
  if (blockType === "role_play") validateUrlField(value, "generic", "iframe_src", errors);
  if (blockType === "video" && typeof value.url === "string" && value.url.trim()) {
    validateUrlField(value, String(value.source ?? ""), "url", errors);
  }

  if (blockType === "text" && typeof value.html !== "undefined" && typeof value.html !== "string") {
    errors.push("html must be a string.");
  }
  if (blockType === "flashcard") validateCards(value.cards, errors);

  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_CONTENT_BLOCK_BYTES) {
    errors.push("Content block payload must be at most 100KB.");
  }
  return errors.length > 0 ? { ok: false, value, errors } : { ok: true, value, errors: [] };
}

function validateCards(raw: unknown, errors: string[]) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_FLASHCARDS) {
    errors.push(`Flashcards must contain between 1 and ${MAX_FLASHCARDS} cards.`);
    return;
  }
  raw.forEach((card, index) => {
    if (!isRecord(card)) {
      errors.push(`Flashcard ${index + 1} must be an object.`);
      return;
    }
    for (const side of ["front", "back"] as const) {
      const value = card[side];
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`Flashcard ${index + 1} ${side} is required.`);
      } else if (value.length > MAX_FLASHCARD_SIDE_LENGTH) {
        errors.push(`Flashcard ${index + 1} ${side} must be at most ${MAX_FLASHCARD_SIDE_LENGTH} characters.`);
      }
    }
  });
}

function validateUrlField(
  value: Content,
  policy: "external_link" | "audio" | "embed" | "generic" | string,
  field: string,
  errors: string[],
) {
  if (value[field] === undefined || value[field] === null || value[field] === "") return;
  if (typeof value[field] !== "string") {
    errors.push(`${field} must be an absolute HTTPS URL.`);
    return;
  }
  const raw = value[field].trim();
  let parsed: URL;
  try { parsed = new URL(raw); } catch { errors.push(`${field} must be an absolute HTTPS URL.`); return; }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    errors.push(`${field} must be an absolute HTTPS URL.`);
    return;
  }
  const hosts = policy === "embed" ? EMBED_HOSTS : PROVIDER_HOSTS[policy];
  if (hosts && !hosts.has(parsed.hostname.toLowerCase())) {
    errors.push(`${field} must use an approved provider host.`);
    return;
  }
  value[field] = raw;
}

function isSafeStoragePath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const path = value.trim();
  return Boolean(path) && path.length <= 1024 && !path.startsWith("/") &&
    !path.includes("\\") && !path.includes("?") && !path.includes("#") &&
    !path.split("/").some((part) => part === ".." || part === ".") &&
    !/^[a-z][a-z0-9+.-]*:/iu.test(path);
}

function isRecord(value: unknown): value is Content {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
