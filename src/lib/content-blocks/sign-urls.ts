import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentBlock } from "@/components/content-blocks";
import { isGuideBlock } from "@/lib/content-blocks/learner-parts";
import {
  artworkRequestKey,
  artworkMimeMatchesPath,
  isAuthorizedArtworkPath,
  type ArtworkProvenance,
  type ArtworkEntityType,
} from "@/lib/artwork/paths";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const ARTWORK_METADATA_CONCURRENCY = 6;

/**
 * For any block whose content references a `file_path` in the `content`
 * Supabase Storage bucket, generate a time-limited signed URL and merge it
 * back into the content as `signed_url`. Renderers prefer `signed_url`.
 *
 * Call only after a learner-scoped RLS query has returned the block rows. The
 * content bucket has no learner SELECT policy, so a server-only admin client
 * mints URLs only for the already-authorized paths passed here.
 */
export async function enrichBlocksWithSignedUrls(
  blocks: ContentBlock[],
  options: { includeGuides?: boolean } = {},
): Promise<ContentBlock[]> {
  // Filter before collecting paths. This prevents a pre-pass request from ever
  // reaching the privileged storage signer with a learner-guide path.
  const authorizedBlocks =
    options.includeGuides === false
      ? blocks.filter((block) => !isGuideBlock(block))
      : blocks;
  const pathFields = [
    ["file_path", "signed_url"],
    ["poster_path", "poster_signed_url"],
    ["caption_path", "caption_signed_url"],
    ["transcript_path", "transcript_signed_url"],
  ] as const;
  const paths = authorizedBlocks.flatMap((block) =>
    pathFields
      .map(([pathField]) => block.content?.[pathField])
      .filter((path): path is string => typeof path === "string" && path.length > 0),
  );

  if (paths.length === 0) return authorizedBlocks;

  const signedByPath = await signContentPaths(paths);

  return authorizedBlocks.map((block) => {
    const content = { ...block.content };
    let changed = false;
    for (const [pathField, signedField] of pathFields) {
      const path = content[pathField];
      if (typeof path !== "string") continue;
      const signed = signedByPath.get(path);
      if (!signed) continue;
      content[signedField] = signed;
      changed = true;
    }
    return changed ? { ...block, content } : block;
  });
}

export async function signContentPaths(paths: string[]): Promise<Map<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (uniquePaths.length === 0) return new Map();
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("content")
    .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS);
  const signedByPath = new Map<string, string>();
  if (error || !data) return signedByPath;
  for (const row of data) {
    if (row.path && row.signedUrl) signedByPath.set(row.path, row.signedUrl);
  }
  return signedByPath;
}

export type ArtworkSignRequest = {
  entityType: ArtworkEntityType;
  entityId: string;
  path: string | null;
} & ArtworkProvenance;

/** Signs catalog artwork only when its ownership and stored MIME both match. */
export async function signAuthorizedArtworkPaths(
  requests: ArtworkSignRequest[],
): Promise<Map<string, string>> {
  const authorized = requests.filter(
    (request): request is ArtworkSignRequest & { path: string } =>
      typeof request.path === "string" &&
      isAuthorizedArtworkPath({
        entityType: request.entityType,
        entityId: request.entityId,
        contentImportId: request.contentImportId,
        thumbnailAssetKey: request.thumbnailAssetKey,
        thumbnailApprovedPath: request.thumbnailApprovedPath,
        thumbnailApprovedSha256: request.thumbnailApprovedSha256,
        path: request.path,
      }),
  );
  if (authorized.length === 0) return new Map();

  const bucket = createAdminClient().storage.from("content");
  const checks = await mapWithConcurrency(
    authorized,
    ARTWORK_METADATA_CONCURRENCY,
    async (request) => {
      try {
        const { data, error } = await bucket.info(request.path);
        const metadata = data?.metadata as Record<string, unknown> | undefined;
        const mime =
          (typeof metadata?.mimetype === "string" && metadata.mimetype) ||
          (typeof metadata?.contentType === "string" && metadata.contentType) ||
          null;
        return !error && mime && artworkMimeMatchesPath(request.path, mime)
          ? request
          : null;
      } catch {
        return null;
      }
    },
  );
  const verifiedRequests = checks.filter(
    (request): request is ArtworkSignRequest & { path: string } => request !== null,
  );
  if (verifiedRequests.length === 0) return new Map();

  const { data, error } = await bucket.createSignedUrls(
    Array.from(new Set(verifiedRequests.map((request) => request.path))),
    SIGNED_URL_TTL_SECONDS,
  );
  const signedUrlByPath = new Map<string, string>();
  if (error || !data) return signedUrlByPath;
  for (const row of data) {
    if (row.path && row.signedUrl) signedUrlByPath.set(row.path, row.signedUrl);
  }
  return new Map(
    verifiedRequests.flatMap((request) => {
      const signedUrl = signedUrlByPath.get(request.path);
      return signedUrl
        ? [[artworkRequestKey(request.entityType, request.entityId), signedUrl] as const]
        : [];
    }),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await map(items[index]);
      }
    }),
  );
  return results;
}
