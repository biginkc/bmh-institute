/**
 * Resolve the Closer Lab origin that hosts the role-play embed.
 *
 * This origin receives BOTH learner-bound bearer credentials: the admission
 * token in the iframe URL and the launch credential over postMessage. Fail
 * closed rather than hand them to a plaintext or credential-bearing origin
 * that a misconfiguration introduced.
 *
 * Shared by the lesson RSC and the re-mint server action so the two can never
 * disagree about what a valid target origin is.
 */
export const ROLE_PLAY_PRODUCTION_ORIGIN = "https://lab.bmhgroupkc.com";
const ROLE_PLAY_LOCAL_ORIGINS = new Set([
  "http://localhost:3200",
  "http://127.0.0.1:3200",
]);

export function getRolePlayBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== value.trim() ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) return null;
    if (env.NODE_ENV === "production") {
      return url.origin === ROLE_PLAY_PRODUCTION_ORIGIN
        ? ROLE_PLAY_PRODUCTION_ORIGIN
        : null;
    }
    return ROLE_PLAY_LOCAL_ORIGINS.has(url.origin) || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
