import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("checksum-guarded imported lesson artwork replacement", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/048_checksum_guarded_imported_lesson_artwork_replacement.sql"),
    "utf8",
  );

  it("keeps direct provenance mutation immutable", () => {
    expect(sql).toContain("bmh.replace_import_artwork_id");
    expect(sql).toContain("imported catalog artwork provenance is immutable");
    expect(sql).toContain("coalesce(auth.role(), '') = 'service_role'");
  });

  it("requires exact prior values, replacement storage, and serialized mutation", () => {
    expect(sql).toContain("current provenance does not match the expected rollback point");
    expect(sql).toContain("from storage.objects");
    expect(sql).toContain("replacement object is missing");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
  });

  it("exposes the replacement only to service_role", () => {
    expect(sql).toContain("revoke all on function public.fn_replace_imported_lesson_artwork");
    expect(sql).toContain("grant execute on function public.fn_replace_imported_lesson_artwork");
    expect(sql).toContain("to service_role");
  });
});
