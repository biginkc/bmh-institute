import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729150000_bound_quiz_answer_recording.sql",
  ),
  "utf8",
);
const additiveMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729220000_quiz_answer_recording_session_timeout.sql",
  ),
  "utf8",
);

describe("quiz answer recording timeout migration", () => {
  it("preserves the original identity and avoids PR137's migration id", () => {
    expect(
      existsSync(resolve(process.cwd(), "supabase/migrations/20260729150000_bound_quiz_answer_recording.sql")),
    ).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), "supabase/migrations/20260729210000_bound_quiz_answer_recording.sql")),
    ).toBe(false);
    expect(
      "20260729220000_quiz_answer_recording_session_timeout.sql" >
        "20260729205000_institute_app_owned_role_access.sql",
    ).toBe(true);
  });

  it("bounds lock waits and statement execution for answer checks", () => {
    const timeoutSettings = /alter function public\.fn_record_quiz_answer\(uuid, uuid, text\[\]\)\s+set lock_timeout = '5s';[\s\S]*alter function public\.fn_record_quiz_answer\(uuid, uuid, text\[\]\)\s+set statement_timeout = '8s';/i;
    expect(migration).toMatch(timeoutSettings);
    expect(additiveMigration).toMatch(
      timeoutSettings,
    );
  });
});
