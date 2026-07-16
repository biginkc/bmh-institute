export type ArtworkEntityType = "program" | "course" | "lesson";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMPORT_ARTWORK_PATTERN = /^(courses\/[a-z0-9][a-z0-9._-]*\/v[0-9]+\/thumbnails\/)([^/]+\.(?:avif|jpe?g|png|webp))$/i;
const MANUAL_ARTWORK_PATTERN = /^(catalog\/(programs|courses|lessons)\/([0-9a-f-]+)\/thumbnails\/)([^/]+\.(?:avif|jpe?g|png|webp))$/i;

const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  avif: ["image/avif"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

export type ArtworkPath = {
  namespace: string;
  extension: keyof typeof MIME_BY_EXTENSION;
  ownership:
    | { kind: "import" }
    | { kind: "manual"; entityType: ArtworkEntityType; entityId: string };
};

export function parseArtworkPath(value: unknown): ArtworkPath | null {
  if (typeof value !== "string" || value.trim() !== value) return null;
  if (value.startsWith("/") || value.includes("..") || value.includes("://") || value.includes("\\")) {
    return null;
  }

  const imported = IMPORT_ARTWORK_PATTERN.exec(value);
  if (imported) {
    return {
      namespace: imported[1],
      extension: extensionOf(imported[2]),
      ownership: { kind: "import" },
    };
  }

  const manual = MANUAL_ARTWORK_PATTERN.exec(value);
  if (!manual || !UUID_PATTERN.test(manual[3])) return null;
  return {
    namespace: manual[1],
    extension: extensionOf(manual[4]),
    ownership: {
      kind: "manual",
      entityType: singularEntityType(manual[2]),
      entityId: manual[3].toLowerCase(),
    },
  };
}

export function artworkMimeMatchesPath(path: string, mimeType: unknown): boolean {
  const parsed = parseArtworkPath(path);
  return parsed !== null && typeof mimeType === "string" && MIME_BY_EXTENSION[parsed.extension].includes(mimeType);
}

export function importArtworkNamespace(importStoragePrefix: string): string {
  return `${importStoragePrefix}thumbnails/`;
}

export function importStoragePrefix(contentImportId: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(contentImportId)) return null;
  const versioned = /^(.*)-v([0-9]+)$/.exec(contentImportId);
  return versioned ? `courses/${versioned[1]}/v${versioned[2]}/` : `courses/${contentImportId}/`;
}

export function manualArtworkNamespace(entityType: ArtworkEntityType, entityId: string): string {
  return `catalog/${pluralEntityType(entityType)}/${entityId.toLowerCase()}/thumbnails/`;
}

export function isAuthorizedArtworkPath(input: {
  entityType: ArtworkEntityType;
  entityId: string;
  contentImportId: string | null;
  path: unknown;
}): boolean {
  const parsed = parseArtworkPath(input.path);
  if (!parsed || !UUID_PATTERN.test(input.entityId)) return false;
  if (parsed.ownership.kind === "import") {
    if (!input.contentImportId) return false;
    const prefix = importStoragePrefix(input.contentImportId);
    return prefix !== null && parsed.namespace === importArtworkNamespace(prefix);
  }
  return (
    input.contentImportId === null &&
    parsed.ownership.entityType === input.entityType &&
    parsed.ownership.entityId === input.entityId.toLowerCase()
  );
}

export function validateArtworkChange(input: {
  entityType: ArtworkEntityType;
  entityId: string;
  contentImportId: string | null;
  currentPath: string | null;
  nextPath: string | null;
}): string | null {
  if (input.nextPath === null) return null;
  if (input.nextPath === input.currentPath) return null;

  const next = parseArtworkPath(input.nextPath);
  if (!next) return "Use an image in an approved artwork thumbnail namespace.";
  if (next.ownership.kind === "manual") {
    return isAuthorizedArtworkPath({
      entityType: input.entityType,
      entityId: input.entityId,
      contentImportId: input.contentImportId,
      path: input.nextPath,
    })
      ? null
      : "This artwork path belongs to a different catalog record.";
  }

  return isAuthorizedArtworkPath({
    entityType: input.entityType,
    entityId: input.entityId,
    contentImportId: input.contentImportId,
    path: input.nextPath,
  })
    ? null
    : "Imported artwork must stay inside this record's authorized import namespace.";
}

function extensionOf(filename: string): keyof typeof MIME_BY_EXTENSION {
  return filename.split(".").at(-1)!.toLowerCase() as keyof typeof MIME_BY_EXTENSION;
}

function pluralEntityType(value: ArtworkEntityType) {
  return value === "program" ? "programs" : value === "course" ? "courses" : "lessons";
}

function singularEntityType(value: string): ArtworkEntityType {
  return value === "programs" ? "program" : value === "courses" ? "course" : "lesson";
}
