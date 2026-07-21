import { randomUUID, timingSafeEqual } from "node:crypto";

export const HUGO_LAUNCH_COOKIE = "bmh_institute_hugo_launch";
export const HUGO_LAUNCH_MAX_AGE_SECONDS = 10 * 60;

export function createHugoLaunchNonce() {
  return randomUUID();
}

export function matchesHugoLaunchNonce(
  cookieNonce: string | undefined,
  queryNonce: string | null,
) {
  if (!cookieNonce || !queryNonce) return false;

  const cookieBuffer = Buffer.from(cookieNonce);
  const queryBuffer = Buffer.from(queryNonce);
  return (
    cookieBuffer.length === queryBuffer.length &&
    timingSafeEqual(cookieBuffer, queryBuffer)
  );
}
