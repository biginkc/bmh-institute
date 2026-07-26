import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726170000_revise_released_content_blocks.sql",
  ),
  "utf8",
);

describe("released content block revision migration", () => {
  it("is service-role-only, release-bound, active-manifest-pinned, and append-only audited", () => {
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
    expect(sql).toContain("bmh-employee-training-v1");
    expect(sql).toContain("71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c");
    expect(sql).toContain("440ec4d85bc6dc0aec9d471fb0f5ecbe0ca8c17236b3012e8b036b8d045a154d");
    expect(sql).toContain("585b72c923a560d2228f6149a5b906ec02958f19d62818dc5c109c3968345a33");
    expect(sql).toMatch(/content_import_released_content_block_revision_records/i);
    expect(sql).toMatch(/fn_guard_imported_content_block_insert_v1/i);
    expect(sql).toMatch(
      /drop trigger if exists guard_imported_catalog_insert on public\.content_blocks/i,
    );
    expect(sql).toMatch(/exact apply or released content revision operation/i);
    expect(sql).toMatch(/prior_catalog_sha256/i);
    expect(sql).toMatch(/replacement_catalog_sha256/i);
    expect(sql).toMatch(/immutable and operation-bound/i);
    expect(sql).not.toMatch(/update public\.content_import_release_records/i);
    expect(sql).not.toMatch(/update public\.content_import_release_revisions/i);
  });

  it("pins the captured full live catalog and exact 44-row scope", () => {
    expect(sql).toContain("e66250effa99bda93e8dd828077811585a5369e2e142bfa9bc5381f5ccd94eb4");
    expect(sql).toMatch(/jsonb_array_length\(p_mutations\) <> 44/i);
    expect(sql).toMatch(/v_guide_update_count <> 19/i);
    expect(sql).toMatch(/v_flashcard_update_count <> 19/i);
    expect(sql).toMatch(/v_role_play_insert_count <> 6/i);
    expect(sql).toMatch(/payload checksum mismatch/i);
    expect(sql).toMatch(/confirmation mismatch/i);
    expect(sql).toMatch(/not p_evidence \?& array\[/i);
    expect(sql).toMatch(/is distinct from v_original_release_manifest_sha256/i);
    expect(sql).toMatch(
      /coalesce\(p_evidence ->> 'upload_receipt_sha256', ''\) !~/i,
    );
  });

  it("serializes an atomic compare-and-swap and refuses unrelated catalog drift", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/lock table[\s\S]*public\.content_blocks/i);
    expect(sql).toMatch(/fn_course_import_catalog_sha256\(p_import_id\)/i);
    expect(sql).toMatch(/catalog drifted from the exact production preflight/i);
    expect(sql).toMatch(
      /update public\.content_blocks block[\s\S]*block\.content = mutations\.expected_content/i,
    );
    expect(sql).toMatch(
      /insert into public\.content_blocks[\s\S]*select[\s\S]*where mutation\.value ->> 'action' = 'insert'/i,
    );
    expect(sql).not.toMatch(/delete from public\.content_blocks/i);
  });

  it("requires exact guide assets and verifies idempotent replay against audit evidence", () => {
    expect(sql).toMatch(/from storage\.objects object/i);
    expect(sql).toMatch(/application\/pdf/i);
    expect(sql).toMatch(/user_metadata'[\s\S]*sha256/i);
    expect(sql).toMatch(/replacement_size_bytes/i);
    expect(sql).toMatch(/already_revised/i);
    expect(sql).toMatch(/retry refused/i);
  });
});
