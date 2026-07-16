import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "supabase/migrations/006_storage_content_bucket.sql",
  "supabase/migrations/015_course_media_and_artwork.sql",
  "supabase/migrations/018_storage_content_markdown.sql",
];
const migrations = migrationPaths.map((path) =>
  readFileSync(resolve(process.cwd(), path), "utf8"),
);
const markdownMigration = migrations.at(-1)!;

describe("content bucket MIME migrations", () => {
  it("adds text/markdown idempotently without replacing the existing allowlist", () => {
    expect(markdownMigration).toMatch(/array_append\([\s\S]*allowed_mime_types[\s\S]*'text\/markdown'/i);
    expect(markdownMigration).toMatch(
      /not \('text\/markdown' = any\(coalesce\(allowed_mime_types/i,
    );
    expect(markdownMigration).not.toMatch(/allowed_mime_types\s*=\s*array\s*\[/i);
  });

  it("allows every MIME type used by approved employee-training assets", () => {
    const allowed = new Set(
      migrations
        .join("\n")
        .match(/'[a-z0-9.+-]+\/[a-z0-9.+-]+'/gi)
        ?.map((value) => value.slice(1, -1)) ?? [],
    );
    const manifestPaths = [
      "content/course-manifests/bmh-employee-training.v1.json",
      "content/course-manifests/bmh-employee-training-canary.v1.json",
    ];
    for (const path of manifestPaths) {
      const manifest = JSON.parse(
        readFileSync(resolve(process.cwd(), path), "utf8"),
      ) as {
        assets: Array<{ approval_status: string; mime_type: string }>;
      };
      const approvedMimes = new Set(
        manifest.assets
          .filter((asset) => asset.approval_status === "approved")
          .map((asset) => asset.mime_type),
      );
      expect([...approvedMimes].filter((mime) => !allowed.has(mime))).toEqual([]);
    }
  });
});
