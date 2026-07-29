import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PILOT_MIGRATIONS,
  assertPendingIsContiguousTail,
  scrub,
} from "../../../scripts/course-content/apply-oral-check-pilot-to-production";

// Round-7 Codex review, findings 3 and 6.
//
// Finding 6: the gate used `supabase db push --include-all`, which applies
// EVERY local migration missing from remote history, not only the three pilot
// migrations the runbook documents. A history gap or an unrelated new
// migration would have been swept into this rollout. The dry run also returned
// before ever computing a real plan, so an operator could not see what would
// actually happen.
//
// Finding 3: the full database URL was passed to that CLI through argv, so the
// production password reached the process list and any thrown execFileSync
// error message, which the catch block printed.
//
// Both are now structural: the apply set is a closed constant, and every
// string that can reach a log goes through the scrubber.

const SCRIPT_PATH = resolve(
  process.cwd(),
  "scripts/course-content/apply-oral-check-pilot-to-production.ts",
);

describe("pilot apply scope (round-7 finding 6)", () => {
  it("is a closed set of exactly the three documented migrations, in order", () => {
    expect(PILOT_MIGRATIONS.map((migration) => migration.version)).toEqual([
      "20260728020000",
      "20260728030000",
      "20260728050000",
    ]);
  });

  it("names migration files that actually exist on disk", () => {
    for (const migration of PILOT_MIGRATIONS) {
      const path = resolve(
        process.cwd(),
        "supabase/migrations",
        `${migration.version}_${migration.name}.sql`,
      );
      expect(existsSync(path), `${path} must exist`).toBe(true);
    }
  });

  it("never uses db push --include-all", () => {
    // Comments deliberately name the flag while explaining the finding, so
    // only executable lines are checked.
    const code = readFileSync(SCRIPT_PATH, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("--include-all");
    // And does not shell out to the migration CLI at all, since that is what
    // pulled in unrelated migrations and required a URL in argv.
    expect(code).not.toContain('"db", "push"');
    expect(code).not.toContain("supabase db push");
  });

  it("accepts a full pending set and any contiguous tail of it", () => {
    expect(() => assertPendingIsContiguousTail([...PILOT_MIGRATIONS])).not.toThrow();
    expect(() => assertPendingIsContiguousTail(PILOT_MIGRATIONS.slice(1))).not.toThrow();
    expect(() => assertPendingIsContiguousTail(PILOT_MIGRATIONS.slice(2))).not.toThrow();
    expect(() => assertPendingIsContiguousTail([])).not.toThrow();
  });

  it("refuses a partial remote state that would apply the pilot out of order", () => {
    // The dangerous one: the apply migration is missing remotely but so is its
    // predecessor rollback capability, and they would be applied in an order
    // that does not match the closed set. Applying 20260728050000 without
    // 20260728030000 already present is the exact incident state the 3-file
    // split exists to prevent.
    expect(() =>
      assertPendingIsContiguousTail([
        { version: "20260728020000" },
        { version: "20260728050000" },
      ]),
    ).toThrow(/unexpected partial state/);
    expect(() =>
      assertPendingIsContiguousTail([{ version: "20260728020000" }]),
    ).toThrow(/unexpected partial state/);
    expect(() =>
      assertPendingIsContiguousTail([{ version: "20260728030000" }]),
    ).toThrow(/unexpected partial state/);
    expect(() =>
      assertPendingIsContiguousTail([{ version: "20260101000000" }]),
    ).toThrow(/unexpected partial state/);
  });
});

describe("credential scrubbing (round-7 finding 3)", () => {
  it("redacts every occurrence of a secret", () => {
    const secret = "s3cret";
    const message = `psql: error: connection to postgresql://u:${secret}@host/db failed, ${secret}`;
    const scrubbed = scrub(message, [secret]);
    expect(scrubbed).not.toContain(secret);
    expect(scrubbed.match(/\[redacted\]/g)?.length).toBe(2);
  });

  it("redacts a whole connection string when that is what it is given", () => {
    const url = "postgresql://postgres.dhvfsyteqsxagokoerrx:p@ss@host:5432/postgres";
    expect(scrub(`spawn failed running ${url}`, [url])).not.toContain("p@ss");
  });

  it("leaves other text intact and tolerates empty secrets", () => {
    expect(scrub("nothing to hide", [""])).toBe("nothing to hide");
    expect(scrub("nothing to hide", [])).toBe("nothing to hide");
  });

  it("handles regex-special characters in a password literally", () => {
    const secret = "a.*b$c(d)";
    expect(scrub(`fail ${secret} end`, [secret])).toBe("fail [redacted] end");
    // A password of regex metacharacters must not accidentally redact text
    // that merely matches it as a pattern.
    expect(scrub("axxbXcYdZ", [secret])).toBe("axxbXcYdZ");
  });
});
