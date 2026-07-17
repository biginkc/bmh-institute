/**
 * Production browser checks enter real credentials and carry authenticated
 * cookies. Playwright traces record action parameters, DOM snapshots, and
 * network details, so credential-bearing runs must not create recordings that
 * can be attached to CI reports or uploaded as workflow artifacts.
 */
export const CREDENTIAL_SAFE_PLAYWRIGHT_USE = {
  trace: "off",
  screenshot: "off",
  video: "off",
} as const;
