import { createHash, createHmac, randomBytes } from "node:crypto";

import {
  assertSecret,
  configuredEmbedSecret,
  normalizeParentOrigin,
} from "./embed-token";

const ISSUER = "sandra-university";
export const ROLE_PLAY_LAUNCH_AUDIENCE = "closer-lab-parent-launch";
export const ROLE_PLAY_LAUNCH_PURPOSE = "embed-attempt-launch";

const DEFAULT_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 5 * 60;
const MAX_ID_CHARS = 256;
const JTI_BYTES = 32;
const JTI_CHARS = 43;

export type RolePlayLaunchCredentialInput = {
  /** The EXACT compact admission JWT placed in the iframe URL. */
  token: string;
  userId: string;
  lessonId: string;
  blockId: string;
  scenarioId: string;
  parentOrigin: string;
  ttlSeconds?: number;
  /** Test-only override; ignored when NODE_ENV === "production". */
  jti?: string;
  now?: Date;
};

/**
 * Closer Lab byte-compares this credential against
 * `tests/fixtures/embed-parent-launch-contract.v1.json`, so the payload key
 * order below is load-bearing. Do not reorder, and do not add claims —
 * `learner_name` deliberately lives only in the admission token.
 */
export type RolePlayLaunchCredentialPayload = {
  iss: typeof ISSUER;
  aud: typeof ROLE_PLAY_LAUNCH_AUDIENCE;
  sub: string;
  lesson_id: string;
  block_id: string;
  scenario_id: string;
  parent_origin: string;
  token_sha256: string;
  jti: string;
  purpose: typeof ROLE_PLAY_LAUNCH_PURPOSE;
  iat: number;
  exp: number;
};

export function mintRolePlayLaunchCredential(
  input: RolePlayLaunchCredentialInput,
  secret?: string,
): string {
  assertLaunchInput(input);

  const isProduction = process.env.NODE_ENV === "production";
  const signingSecret = isProduction
    ? configuredEmbedSecret(process.env)
    : secret ?? configuredEmbedSecret(process.env);
  assertSecret(signingSecret);

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > MAX_TTL_SECONDS
  ) {
    throw new Error(
      "Role play launch credential lifetime must be an integer from 1 to 300 seconds.",
    );
  }

  const jti = isProduction ? mintJti() : input.jti ?? mintJti();
  if (!/^[A-Za-z0-9_-]{43}$/.test(jti)) {
    throw new Error(
      "Role play launch credential requires a 43-character base64url jti.",
    );
  }

  const payload: RolePlayLaunchCredentialPayload = {
    iss: ISSUER,
    aud: ROLE_PLAY_LAUNCH_AUDIENCE,
    sub: input.userId,
    lesson_id: input.lessonId,
    block_id: input.blockId,
    scenario_id: input.scenarioId,
    parent_origin: normalizeParentOrigin(input.parentOrigin),
    token_sha256: createHash("sha256").update(input.token).digest("hex"),
    jti,
    purpose: ROLE_PLAY_LAUNCH_PURPOSE,
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

function mintJti(): string {
  const jti = randomBytes(JTI_BYTES).toString("base64url");
  if (jti.length !== JTI_CHARS) {
    throw new Error(
      "Role play launch credential jti must be exactly 43 characters.",
    );
  }
  return jti;
}

function assertLaunchInput(input: RolePlayLaunchCredentialInput) {
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
    )
  ) {
    throw new Error(
      "Role play launch credential requires user, lesson, block, and scenario.",
    );
  }
  if (!input.token.trim()) {
    throw new Error(
      "Role play launch credential requires the admission token it binds.",
    );
  }
  normalizeParentOrigin(input.parentOrigin);
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
