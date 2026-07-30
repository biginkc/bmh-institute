import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const additiveMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729220000_quiz_answer_recording_session_timeout.sql",
  ),
  "utf8",
);

describe("quiz answer recording timeout migration", () => {
  it("preserves the original identity and avoids PR137's migration id", () => {
    const migrationNames = readdirSync(migrationDirectory).filter((name) =>
      name.endsWith(".sql"),
    );
    expect(migrationNames.filter((name) => /^2026.*quiz_answer_recording/.test(name))).toEqual([
      "20260729220000_quiz_answer_recording_session_timeout.sql",
    ]);
    expect(existsSync(resolve(migrationDirectory, "20260729150000_bound_quiz_answer_recording.sql"))).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "supabase/migrations/20260729210000_bound_quiz_answer_recording.sql")),
    ).toBe(false);
    const instituteMigration = migrationNames.find((name) =>
      name.startsWith("20260729205000_institute_app_owned_role_access"),
    );
    const timeoutMigration = migrationNames.find((name) =>
      name.startsWith("20260729220000_quiz_answer_recording_session_timeout"),
    );
    expect(instituteMigration).toBeDefined();
    expect(timeoutMigration).toBeDefined();
    expect(timeoutMigration!.localeCompare(instituteMigration!)).toBeGreaterThan(0);
  });

  it("bounds lock waits and removes the ineffective function statement timeout", () => {
    expect(additiveMigration).toMatch(/set lock_timeout = '5s'/i);
    expect(additiveMigration).toMatch(/reset statement_timeout/i);
    expect(additiveMigration).not.toMatch(/^\s*set statement_timeout/im);
  });
});
