import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729150000_bound_quiz_answer_recording.sql",
  ),
  "utf8",
);

describe("quiz answer recording timeout migration", () => {
  it("bounds lock waits and statement execution for answer checks", () => {
    expect(migration).toMatch(
      /alter function public\.fn_record_quiz_answer\(uuid, uuid, text\[\]\)\s+set lock_timeout = '5s';[\s\S]*alter function public\.fn_record_quiz_answer\(uuid, uuid, text\[\]\)\s+set statement_timeout = '8s';/i,
    );
  });
});
