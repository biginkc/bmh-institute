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
export function getRolePlayBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    const isLoopback = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol === "https:") return url.origin;
    if (url.protocol === "http:" && isLoopback && env.NODE_ENV !== "production") {
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}
