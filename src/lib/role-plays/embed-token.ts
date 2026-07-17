import { createHmac } from "node:crypto";

const ISSUER = "sandra-university";
export const ROLE_PLAY_EMBED_AUDIENCE = "closer-lab";
const DEFAULT_TTL_SECONDS = 5 * 60;
const MIN_SECRET_BYTES = 32;

export type RolePlayEmbedTokenInput = {
  userId: string;
  lessonId: string;
  blockId: string;
  learnerName: string;
  scenarioId: string;
  ttlSeconds?: number;
  now?: Date;
};

export type RolePlayEmbedTokenPayload = {
  iss: typeof ISSUER;
  aud: typeof ROLE_PLAY_EMBED_AUDIENCE;
  sub: string;
  lesson_id: string;
  block_id: string;
  learner_name: string;
  scenario_id: string;
  iat: number;
  exp: number;
};

export function mintRolePlayEmbedToken(
  input: RolePlayEmbedTokenInput,
  secret = process.env.ROLE_PLAY_JWT_SECRET,
): string {
  assertTokenInput(input);
  assertSecret(secret);

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const payload: RolePlayEmbedTokenPayload = {
    iss: ISSUER,
    aud: ROLE_PLAY_EMBED_AUDIENCE,
    sub: input.userId,
    lesson_id: input.lessonId,
    block_id: input.blockId,
    learner_name: input.learnerName,
    scenario_id: input.scenarioId,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };

  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(payload);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

function assertTokenInput(input: RolePlayEmbedTokenInput) {
  const required = [
    input.userId,
    input.lessonId,
    input.blockId,
    input.learnerName,
    input.scenarioId,
  ];
  if (required.some((value) => !value.trim())) {
    throw new Error("Role play embed token requires user, lesson, block, learner, and scenario.");
  }
}

function assertSecret(secret: string | undefined): asserts secret is string {
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("ROLE_PLAY_JWT_SECRET must be at least 32 bytes.");
  }
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
