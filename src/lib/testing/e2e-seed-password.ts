const MINIMUM_E2E_PASSWORD_LENGTH = 24;

export function requireE2eSeedPassword(
  env: Record<string, string | undefined> = process.env,
): string {
  const rawPassword = env.E2E_SEED_PASSWORD;
  const password = rawPassword?.trim();
  if (!password) {
    throw new Error(
      "E2E_SEED_PASSWORD is required. Durable test accounts never use a repository fallback.",
    );
  }
  if (
    password !== rawPassword ||
    password.length < MINIMUM_E2E_PASSWORD_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(password) ||
    new Set(password).size < 8
  ) {
    throw new Error(
      "E2E_SEED_PASSWORD must be at least 24 characters, contain no control characters, and use at least 8 distinct characters.",
    );
  }
  return password;
}
