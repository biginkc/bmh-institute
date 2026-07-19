import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/017_revoke_quiz_explanations.sql"),
  "utf8",
);

describe("quiz disclosure security migration", () => {
  it("prevents learners from reading quiz explanations before disclosure is allowed", () => {
    expect(sql).toMatch(
      /revoke select on (?:table )?public\.questions from anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant select \([^)]+\)\s+on (?:table )?public\.questions\s+to authenticated/i,
    );
    const learnerGrant = sql.match(
      /grant select \(([^)]+)\)\s+on (?:table )?public\.questions\s+to authenticated/i,
    )?.[1];
    expect(learnerGrant).toBeDefined();
    expect(learnerGrant).not.toMatch(/explanation/i);
  });
});
