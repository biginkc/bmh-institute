import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260730010000_replace_released_imported_welcome_video.sql",
  ),
  "utf8",
);

describe("released imported welcome video replacement migration", () => {
  it("is service-role-only, release-bound, and append-only audited", () => {
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
    expect(sql).toMatch(/p_import_id <> 'bmh-employee-training-v1'/i);
    expect(sql).toMatch(/content_import_release_records/i);
    expect(sql).toMatch(/program\.is_published/i);
    expect(sql).toMatch(/course\.is_published/i);
    expect(sql).toMatch(/content_import_welcome_video_replacement_records/i);
    expect(sql).toMatch(
      /before insert or update or delete[\s\S]*fn_guard_import_welcome_video_replacement_record/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.fn_replace_released_imported_welcome_video\(text, jsonb, text, text, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_replace_released_imported_welcome_video\(text, jsonb, text, text, text\)[\s\S]*to service_role/i,
    );
  });

  it("accepts exactly one fixed welcome video and caption replacement", () => {
    expect(sql).toMatch(/jsonb_array_length\(p_replacements\) <> 1/i);
    expect(sql).toMatch(/'video_asset_key', 'video-slot-01-welcome'/i);
    expect(sql).toMatch(
      /'caption_asset_key', 'caption-video-slot-01-welcome'/i,
    );
    expect(sql).toContain(
      "courses/bmh-employee-training/v1/videos/video-slot-01-welcome.06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b.mp4",
    );
    expect(sql).toContain(
      "courses/bmh-employee-training/v1/captions/video-slot-01-welcome.bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939.vtt",
    );
    for (const exactIdentity of [
      "493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72",
      "06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b",
      "54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11",
      "bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939",
      "35190296",
      "74404741",
      "5636",
      "7629",
    ]) {
      expect(sql).toContain(exactIdentity);
    }
  });

  it("uses serialized exact-content compare-and-swap and atomically changes paths plus duration", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/v_expected_payload := jsonb_build_array/i);
    expect(sql).toMatch(/p_replacements is distinct from v_expected_payload/i);
    expect(sql).toMatch(
      /v_payload_sha256 is distinct from encode\([\s\S]*v_expected_payload::text/i,
    );
    expect(sql).toMatch(
      /v_replaced_content := jsonb_set\([\s\S]*'\{file_path\}'[\s\S]*'\{caption_path\}'[\s\S]*'\{duration_seconds\}'/i,
    );
    expect(sql).toContain("'expected_duration_seconds'");
    expect(sql).toContain("'replacement_duration_seconds'");
    expect(sql).toContain("'expected_duration_seconds', 246.186");
    expect(sql).toContain("'replacement_duration_seconds', 318.351");
    expect(sql).toMatch(
      /update public\.content_blocks block[\s\S]*set content = v_replaced_content[\s\S]*block\.content = v_expected_content/i,
    );
    expect(sql).toMatch(/block\.block_type = 'video'/i);
    expect(sql).toMatch(
      /coalesce\(lesson\.content_import_id, course\.content_import_id\) = p_import_id/i,
    );
    expect(sql).not.toMatch(/insert into public\.content_blocks/i);
    expect(sql).not.toMatch(/delete from public\.content_blocks/i);
  });

  it("verifies exact old and new objects and supports only audited replay", () => {
    expect(sql).toMatch(/from \(values[\s\S]*expected_video_path/i);
    expect(sql).toMatch(/replacement_video_path/i);
    expect(sql).toMatch(/expected_caption_path/i);
    expect(sql).toMatch(/replacement_caption_path/i);
    expect(sql).toMatch(/from storage\.objects object/i);
    expect(sql).toMatch(/user_metadata'[\s\S]*sha256/i);
    expect(sql).toMatch(/courseImportId/i);
    expect(sql).toMatch(/video\/mp4/i);
    expect(sql).toMatch(/text\/vtt/i);
    expect(sql).toMatch(/current paths lack the exact audit record/i);
    expect(sql).toMatch(/status', 'already_replaced'/i);
    expect(sql).toMatch(/catalog drifted from the exact production preflight/i);
    expect(sql).toMatch(/retained_rollback_video_path/i);
    expect(sql).toMatch(/retained_rollback_caption_path/i);
  });

  it("provides an exact service-role-only rollback with immutable audited replay", () => {
    expect(sql).toMatch(
      /create or replace function public\.fn_rollback_released_imported_welcome_video/i,
    );
    expect(sql).toMatch(
      /Released welcome video rollback requires service_role/i,
    );
    expect(sql).toMatch(/content_import_welcome_video_rollback_records/i);
    expect(sql).toMatch(
      /before insert or update or delete[\s\S]*fn_guard_import_welcome_video_rollback_record/i,
    );
    expect(sql).toMatch(
      /set content = v_expected_content[\s\S]*block\.content = v_replaced_content/i,
    );
    expect(sql).toMatch(
      /Released welcome video rollback failed to restore the exact prior catalog/i,
    );
    expect(sql).toMatch(/status', 'already_rolled_back'/i);
    expect(sql).toMatch(/status', 'rolled_back'/i);
    expect(sql).toMatch(
      /revoke all on function public\.fn_rollback_released_imported_welcome_video\(text, text, text, text, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.fn_rollback_released_imported_welcome_video\(text, text, text, text, text\)[\s\S]*to service_role/i,
    );
  });

  it("treats an audited rollback as terminal before a replacement update", () => {
    expect(sql).toMatch(
      /from public\.content_import_welcome_video_rollback_records rollback[\s\S]*join public\.content_import_welcome_video_replacement_records replacement/i,
    );
    expect(sql).toMatch(
      /replacement was previously rolled back and is terminal/i,
    );
  });
});
