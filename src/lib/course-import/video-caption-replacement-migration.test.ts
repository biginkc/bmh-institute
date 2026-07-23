import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722235500_replace_released_imported_video_captions.sql",
  ),
  "utf8",
);

describe("released imported video caption replacement migration", () => {
  it("is service-role-only, release-bound, and append-only audited", () => {
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
    expect(sql).toMatch(/content_import_release_records/i);
    expect(sql).toMatch(/program\.is_published/i);
    expect(sql).toMatch(/course\.is_published/i);
    expect(sql).toMatch(/content_import_video_caption_replacement_records/i);
    expect(sql).toMatch(/prior_catalog_sha256/i);
    expect(sql).toMatch(/replacement_catalog_sha256/i);
    expect(sql).toMatch(
      /grant select on table public\.content_import_video_caption_replacement_records[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.fn_replace_released_imported_video_captions\(text, jsonb, text, text, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_replace_released_imported_video_captions\(text, jsonb, text, text, text\)[\s\S]*to service_role/i,
    );
  });

  it("changes only caption_path on exact existing imported video blocks", () => {
    expect(sql).toMatch(
      /update public\.content_blocks block[\s\S]*set content = jsonb_set\([\s\S]*'\{caption_path\}'[\s\S]*false[\s\S]*block\.id = replacements\.block_id/i,
    );
    expect(sql).toMatch(/block\.block_type = 'video'/i);
    expect(sql).toMatch(/block\.content = replacements\.expected_content/i);
    expect(sql).toMatch(
      /coalesce\(lesson\.content_import_id, course\.content_import_id\) = p_import_id/i,
    );
    expect(sql).not.toMatch(/insert into public\.content_blocks/i);
    expect(sql).not.toMatch(/delete from public\.content_blocks/i);
    expect(sql).not.toMatch(/'\{file_path\}'/i);
    expect(sql).not.toMatch(/'\{poster_path\}'/i);
  });

  it("requires exact checksum-addressed VTT objects and serialized compare-and-swap", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/v_storage_prefix \|\| '\/captions\/'/i);
    expect(sql).toMatch(/from storage\.objects object/i);
    expect(sql).toMatch(/user_metadata'[\s\S]*sha256/i);
    expect(sql).toMatch(/replacement_size_bytes/i);
    expect(sql).toMatch(/text\/vtt/i);
    expect(sql).toMatch(/catalog drifted after its latest caption correction/i);
    expect(sql).toMatch(/catalog drifted from the exact production preflight/i);
    expect(sql).toMatch(/current paths lack the exact audit record/i);
  });
});
