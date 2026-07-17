import { createHmac } from "node:crypto";

const ISSUER = "sandra-university";
export const ROLE_PLAY_EMBED_AUDIENCE = "closer-lab";
const DEFAULT_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 5 * 60;
const MIN_SECRET_BYTES = 32;
const MAX_ID_CHARS = 256;
const MAX_LEARNER_NAME_CHARS = 256;

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
  secret?: string,
): string {
  assertTokenInput(input);
  const signingSecret =
    process.env.NODE_ENV === "production"
      ? configuredEmbedSecret(process.env)
      : secret ?? configuredEmbedSecret(process.env);
  assertSecret(signingSecret);

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error("Role play embed token lifetime must be an integer from 1 to 300 seconds.");
  }
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
  const signature = createHmac("sha256", signingSecret)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

function assertTokenInput(input: RolePlayEmbedTokenInput) {
  const ids = [
    input.userId,
    input.lessonId,
    input.blockId,
    input.scenarioId,
  ];
  if (
    ids.some(
      (value) =>
        !value.trim() ||
        value.length > MAX_ID_CHARS ||
        /[\u0000-\u001f\u007f]/.test(value),
    ) ||
    !input.learnerName.trim() ||
    input.learnerName.length > MAX_LEARNER_NAME_CHARS ||
    /[\u0000-\u001f\u007f]/.test(input.learnerName)
  ) {
    throw new Error("Role play embed token requires user, lesson, block, learner, and scenario.");
  }
}

function assertSecret(secret: string | undefined): asserts secret is string {
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error(
      "ROLE_PLAY_EMBED_SIGNING_SECRET must be at least 32 bytes.",
    );
  }
}

function configuredEmbedSecret(env: NodeJS.ProcessEnv): string | undefined {
  const embedSecret = env.ROLE_PLAY_EMBED_SIGNING_SECRET?.trim();
  if (env.NODE_ENV === "production") {
    const completionSecret = env.ROLE_PLAY_COMPLETION_VERIFY_SECRET?.trim();
    return embedSecret &&
      completionSecret &&
      Buffer.byteLength(embedSecret, "utf8") >= MIN_SECRET_BYTES &&
      Buffer.byteLength(completionSecret, "utf8") >= MIN_SECRET_BYTES &&
      embedSecret !== completionSecret
      ? embedSecret
      : undefined;
  }
  return embedSecret || env.ROLE_PLAY_JWT_SECRET?.trim();
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
