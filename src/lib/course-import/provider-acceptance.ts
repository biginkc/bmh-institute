import { assertCourseImportEnvironment } from "./environment";

export const COURSE_IMPORT_PROVIDER_ENV = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_SUPABASE_SERVICE_ROLE_KEY",
  "TEST_SUPABASE_DB_URL",
] as const;

export function assertCourseImportProviderAcceptanceEnvironment(
  env: Readonly<Record<string, string | undefined>>,
) {
  const missing = COURSE_IMPORT_PROVIDER_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Course import provider acceptance requires: ${missing.join(", ")}. No provider tests were started.`,
    );
  }
  assertCourseImportEnvironment(env.TEST_SUPABASE_URL!, false);
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.TEST_SUPABASE_DB_URL!);
  } catch {
    throw new Error(
      "Course import provider acceptance requires a valid non-production Postgres connection.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !databaseUrl.username.endsWith(".jvaabkchkihkjllehmft") ||
    databaseUrl.hostname !== "aws-1-us-west-1.pooler.supabase.com"
  ) {
    throw new Error(
      "Course import provider acceptance requires the canonical non-production Postgres connection.",
    );
  }
}

export function assertCourseImportProviderAcceptanceResult(
  value: unknown,
  expectedFileCount: number,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Course import provider acceptance did not produce a Vitest JSON report.");
  }
  const report = value as Record<string, unknown>;
  const total = report.numTotalTests;
  const passed = report.numPassedTests;
  const failed = report.numFailedTests;
  const pending = report.numPendingTests;
  const todo = report.numTodoTests;
  const testResults = report.testResults;
  const everyFileExecuted = Array.isArray(testResults) && testResults.every((file) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) return false;
    const assertions = (file as Record<string, unknown>).assertionResults;
    return (
      (file as Record<string, unknown>).status === "passed" &&
      Array.isArray(assertions) &&
      assertions.length > 0 &&
      assertions.every((assertion) =>
        Boolean(
          assertion &&
          typeof assertion === "object" &&
          !Array.isArray(assertion) &&
          (assertion as Record<string, unknown>).status === "passed",
        )
      )
    );
  });
  if (
    !Number.isInteger(total) ||
    !Number.isInteger(passed) ||
    !Number.isInteger(failed) ||
    !Number.isInteger(pending) ||
    !Number.isInteger(todo) ||
    !Array.isArray(testResults) ||
    total === 0 ||
    passed !== total ||
    failed !== 0 ||
    pending !== 0 ||
    todo !== 0 ||
    testResults.length !== expectedFileCount ||
    !everyFileExecuted
  ) {
    throw new Error(
      `Course import provider acceptance requires ${expectedFileCount} files with nonzero, fully executed tests and no failures or skips.`,
    );
  }
  return { files: testResults.length, tests: total };
}
