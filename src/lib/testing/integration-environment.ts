import { Buffer } from "node:buffer";

import { assertCourseImportEnvironment } from "../course-import/environment";
import { assertCourseImportProviderAcceptanceEnvironment } from "../course-import/provider-acceptance";

const TEST_PROJECT_REF = "jvaabkchkihkjllehmft";

export const INTEGRATION_TEST_ENV = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_SUPABASE_SERVICE_ROLE_KEY",
  "TEST_SUPABASE_DB_URL",
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
  assertCourseImportProviderAcceptanceEnvironment(env);
  assertProjectKey(
    env.TEST_SUPABASE_ANON_KEY!,
    "anon",
    "TEST_SUPABASE_ANON_KEY",
  );
  assertProjectKey(
    env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
    "service_role",
    "TEST_SUPABASE_SERVICE_ROLE_KEY",
  );
}

export async function verifyIntegrationTestKeys(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  assertIntegrationTestEnvironment(env);
  const settingsUrl = new URL("/auth/v1/settings", env.TEST_SUPABASE_URL!);
  await Promise.all([
    verifyKeyAtCanonicalTest(
      settingsUrl,
      env.TEST_SUPABASE_ANON_KEY!,
      "TEST_SUPABASE_ANON_KEY",
      fetchImpl,
    ),
    verifyKeyAtCanonicalTest(
      settingsUrl,
      env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
      "TEST_SUPABASE_SERVICE_ROLE_KEY",
      fetchImpl,
    ),
  ]);
}

async function verifyKeyAtCanonicalTest(
  url: URL,
  key: string,
  name: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(
      `${name} could not be verified against the canonical BMH Institute TEST project.`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `${name} is not accepted by the canonical BMH Institute TEST project.`,
    );
  }
}

function assertProjectKey(
  key: string,
  role: "anon" | "service_role",
  name: string,
): void {
  const modernPrefix = role === "anon" ? "sb_publishable_" : "sb_secret_";
  if (key.startsWith(modernPrefix) && key.length >= modernPrefix.length + 20) {
    return;
  }

  const segments = key.split(".");
  if (segments.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(segments[1]!, "base64url").toString("utf8"),
      ) as { ref?: unknown; role?: unknown };
      if (payload.ref === TEST_PROJECT_REF && payload.role === role) return;
    } catch {
      // Fall through to the same secret-free validation error.
    }
  }

  throw new Error(
    `${name} must be the ${role} key for the canonical BMH Institute TEST project.`,
  );
}
