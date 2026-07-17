import { assertCourseImportEnvironment } from "../course-import/environment";

export const INTEGRATION_TEST_ENV = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * The integration command is acceptance evidence, so it must execute against
 * the one durable test project rather than return green with skipped tests.
 * This guard runs before Vitest receives the service-role key under the
 * application's normal env names.
 */
export function assertIntegrationTestEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): void {
  const missing = INTEGRATION_TEST_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Integration tests require ${missing.join(", ")} and refuse to report a skipped suite as passing.`,
    );
  }
  assertCourseImportEnvironment(env.TEST_SUPABASE_URL!, false);
}
