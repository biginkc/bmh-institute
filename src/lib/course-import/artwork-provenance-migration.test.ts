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
      expect(sql).toMatch(new RegExp(`${table}_content_import_id_format`));
      expect(sql).toMatch(
        new RegExp(`comment on column public\\.${table}\\.content_import_id`, "i"),
      );
      expect(sql).toMatch(new RegExp(`${table}_preserve_content_import_id`, "i"));
    },
  );

  it("does not make provenance mandatory for manually-created catalog rows", () => {
    expect(sql).not.toMatch(/content_import_id\s+text\s+not\s+null/i);
  });

  it("keeps provenance immutable even when a caller can update catalog rows", () => {
    expect(sql).toContain("new.content_import_id is distinct from old.content_import_id");
    expect(sql).toContain("before update of content_import_id");
    expect(sql).toContain(
      "revoke all on function public.fn_preserve_catalog_content_import_id() from public, anon, authenticated",
    );
  });
});
