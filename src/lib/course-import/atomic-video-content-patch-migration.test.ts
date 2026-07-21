import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260721232728_harden_atomic_imported_video_content_patch.sql"),
  "utf8",
);

describe("atomic imported video content patch migration", () => {
  it("restricts execution to service role and preserves unpublished import boundaries", () => {
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
    expect(sql).toMatch(/content_import_release_records/i);
    expect(sql).toMatch(/program\.is_published/i);
    expect(sql).toMatch(/course\.is_published/i);
    expect(sql).toMatch(/revoke all on function public\.fn_patch_imported_video_content\(text, jsonb\)[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.fn_patch_imported_video_content\(text, jsonb\)[\s\S]*to service_role/i);
  });

  it("uses compare-and-swap validation and changes only content on existing video blocks", () => {
    expect(sql).toMatch(/block\.block_type = 'video'/i);
    expect(sql).toMatch(/update public\.content_blocks block[\s\S]*set content = patches\.replacement_content[\s\S]*where block\.id = patches\.block_id[\s\S]*and block\.content = patches\.expected_content[\s\S]*and block\.block_type = 'video'/i);
    expect(sql).toMatch(/coalesce\(lesson\.content_import_id, course\.content_import_id\) = p_import_id/i);
    expect(sql).not.toMatch(/insert into public\.content_blocks/i);
    expect(sql).not.toMatch(/delete from public\.content_blocks/i);
  });

  it("requires video and caption objects, removes transcript links, and rejects non-media drift", () => {
    expect(sql).toMatch(/replacement_content' -> 'file_path'/i);
    expect(sql).toMatch(/replacement_content' -> 'caption_path'/i);
    expect(sql).toMatch(/replacement_content' \? 'transcript_path'/i);
    expect(sql).toMatch(/\(patch\.value -> 'expected_content'\) - 'file_path' - 'caption_path' - 'transcript_path'/i);
    expect(sql).toMatch(/v_storage_prefix \|\| '\/videos\/'/i);
    expect(sql).toMatch(/v_storage_prefix \|\| '\/captions\/'/i);
    expect(sql).toMatch(/\\\.\[0-9a-f\]\{64\}\\\.mp4\$/i);
    expect(sql).toMatch(/\\\.\[0-9a-f\]\{64\}\\\.vtt\$/i);
    expect(sql).toMatch(/from storage\.objects object/i);
  });
});
