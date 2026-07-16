import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentBlock } from "@/components/content-blocks";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

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
): Promise<ContentBlock[]> {
  const pathFields = [
    ["file_path", "signed_url"],
    ["poster_path", "poster_signed_url"],
    ["caption_path", "caption_signed_url"],
    ["transcript_path", "transcript_signed_url"],
  ] as const;
  const paths = blocks.flatMap((block) =>
    pathFields
      .map(([pathField]) => block.content?.[pathField])
      .filter((path): path is string => typeof path === "string" && path.length > 0),
  );

  if (paths.length === 0) return blocks;

  const signedByPath = await signContentPaths(paths);

  return blocks.map((block) => {
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
