import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("catalog artwork provenance migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/020_catalog_artwork_provenance.sql"),
    "utf8",
  );

  it.each(["programs", "courses", "lessons"])(
    "adds nullable, format-constrained provenance to %s",
    (table) => {
      expect(sql).toContain(`alter table public.${table}`);
      expect(sql).toContain("table_name || '_content_import_id_format'");
      expect(sql).toMatch(
        new RegExp(`comment on column public\\.${table}\\.content_import_id`, "i"),
      );
      expect(sql).toMatch(new RegExp(`${table}_guard_artwork_provenance`, "i"));
      for (const column of [
        "thumbnail_asset_key",
        "thumbnail_approved_path",
        "thumbnail_approved_sha256",
      ]) {
        expect(sql).toContain(`add column if not exists ${column} text`);
      }
    },
  );

  it("does not make provenance mandatory for manually-created catalog rows", () => {
    expect(sql).not.toMatch(/content_import_id\s+text\s+not\s+null/i);
  });

  it("allows one service-role claim and keeps later provenance immutable", () => {
    expect(sql).toContain("old.content_import_id is null and new.content_import_id is not null");
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain("new.content_import_id is distinct from old.content_import_id");
    expect(sql).toContain("new.thumbnail_approved_path is distinct from old.thumbnail_approved_path");
    expect(sql).toContain("new.thumbnail_path is distinct from old.thumbnail_path");
    expect(sql).toContain("before insert or update of content_import_id");
    expect(sql).toContain(
      "revoke all on function public.fn_guard_catalog_artwork_provenance() from public, anon, authenticated",
    );
    expect(sql).toContain("set search_path = ''");
  });

  it("updates an assignment and proves lesson ownership in one statement", () => {
    expect(sql).toContain("create or replace function public.fn_update_assignment_for_lesson");
    expect(sql).toMatch(/update public\.assignments[\s\S]+and exists \([\s\S]+from public\.lessons/);
    expect(sql).toContain("return affected = 1");
    expect(sql).toContain("grant execute on function public.fn_update_assignment_for_lesson");
  });
});
