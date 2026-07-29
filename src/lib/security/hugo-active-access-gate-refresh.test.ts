import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729140000_hugo_refresh_active_access_gates.sql",
  ),
  "utf8",
);

describe("Hugo active-access gate refresh migration", () => {
  it("repairs every current public RLS table with a restrictive authenticated gate", () => {
    expect(migration).toContain("relation.relrowsecurity");
    expect(migration).toContain("relation.relkind in ('r', 'p')");
    expect(migration).toContain(
      "drop policy if exists hugo_active_authenticated_gate",
    );
    expect(migration).toContain(
      "create policy hugo_active_authenticated_gate",
    );
    expect(migration).toContain("as restrictive for all to authenticated");
    expect(migration).toContain(
      "public.fn_hugo_access_is_active(auth.uid())",
    );
    expect(migration).toContain("with check");
  });

  it("is transactional and bounded by a lock timeout", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*\nbegin;/);
    expect(migration).toContain("set local lock_timeout = '10s'");
    expect(migration.trimEnd()).toMatch(/commit;$/);
  });
});
