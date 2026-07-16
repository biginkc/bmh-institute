import { createHmac, timingSafeEqual } from "node:crypto";

const MIN_SECRET_BYTES = 32;

type CompletionPayload = {
  iss: "closer-lab";
  aud: "bmh-institute";
  ver: 1;
  sub: string;
  block_id: string;
  scenario_id: string;
  attempt_id: string;
  score: number;
  summary_url?: string;
  iat: number;
  exp: number;
};

const MAX_TOKEN_TTL_SECONDS = 10 * 60;

export function verifyRolePlayCompletionToken(input: {
  token: string;
  expected: {
    userId: string;
    blockId: string;
    scenarioId: string;
    attemptId: string;
  };
  secret?: string;
  now?: Date;
}):
  | { ok: true; score: number; summaryUrl: string | null }
  | { ok: false; error: string } {
  const failure = {
    ok: false as const,
    error: "Role play completion could not be verified.",
  };
  const secret = input.secret ?? process.env.ROLE_PLAY_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    return failure;
  }
  const parts = input.token.split(".");
  if (parts.length !== 3) return failure;

  try {
    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as { alg?: unknown; typ?: unknown };
    if (header.alg !== "HS256" || header.typ !== "JWT") return failure;
    const expectedSignature = createHmac("sha256", secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const actualSignature = Buffer.from(parts[2], "base64url");
    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return failure;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as CompletionPayload;
    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
    if (
      payload.iss !== "closer-lab" ||
      payload.aud !== "bmh-institute" ||
      payload.ver !== 1 ||
      payload.sub !== input.expected.userId ||
      payload.block_id !== input.expected.blockId ||
      payload.scenario_id !== input.expected.scenarioId ||
      payload.attempt_id !== input.expected.attemptId ||
      !Number.isFinite(payload.score) ||
      payload.score < 0 ||
      payload.score > 100 ||
      !Number.isFinite(payload.exp) ||
      !Number.isFinite(payload.iat) ||
      payload.exp <= nowSeconds ||
      payload.iat > nowSeconds + 30 ||
      payload.exp - payload.iat > MAX_TOKEN_TTL_SECONDS
    ) {
      return failure;
    }
    return {
      ok: true,
      score: payload.score,
      summaryUrl:
        typeof payload.summary_url === "string" ? payload.summary_url : null,
    };
  } catch {
    return failure;
  }
}
