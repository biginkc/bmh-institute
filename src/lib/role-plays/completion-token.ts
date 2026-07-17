import { createHmac, timingSafeEqual } from "node:crypto";

const COMPLETION_TOKEN_ISSUER = "closer-lab";
const COMPLETION_TOKEN_AUDIENCE = "bmh-institute";
const COMPLETION_TOKEN_VERSION = 1;
const COMPLETION_TOKEN_TTL_SECONDS = 120;
const MAX_CLOCK_SKEW_SECONDS = 30;
const MIN_SECRET_BYTES = 32;
const MAX_ID_CHARS = 256;
const MAX_GOALS = 8;
const MAX_GOAL_ID_CHARS = 128;
const MAX_PREVIOUS_KEY_OVERLAP_SECONDS = 15 * 60;
const MAX_TOKEN_CHARS = 16_384;

type CompletionPayload = {
  iss: typeof COMPLETION_TOKEN_ISSUER;
  aud: typeof COMPLETION_TOKEN_AUDIENCE;
  version: typeof COMPLETION_TOKEN_VERSION;
  sub: string;
  block_id: string;
  scenario_id: string;
  attempt_id: string;
  score: number;
  summary_url?: string;
  goals_met?: Record<string, boolean>;
  iat: number;
  exp: number;
};

type VerificationSuccess = {
  ok: true;
  score: number;
  summaryUrl: string | null;
  goalsMet: Record<string, boolean>;
};

const FAILURE = {
  ok: false as const,
  error: "Role play completion could not be verified.",
};

function decodeJson(value: string): unknown {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_CHARS &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function parseGoals(value: unknown): Record<string, boolean> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_GOALS) return null;
  if (
    entries.some(
      ([goalId, met]) =>
        goalId.length === 0 ||
        goalId.length > MAX_GOAL_ID_CHARS ||
        !/^[A-Za-z0-9_-]+$/.test(goalId) ||
        typeof met !== "boolean",
    )
  ) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, boolean>;
}

function parseSummaryUrl(
  value: unknown,
  rolePlayBaseUrl: string | undefined,
): string | null | false {
  if (value === undefined) return null;
  if (typeof value !== "string" || !rolePlayBaseUrl) return false;
  try {
    const configured = new URL(rolePlayBaseUrl);
    const candidate = new URL(value);
    if (
      !["http:", "https:"].includes(configured.protocol) ||
      !["http:", "https:"].includes(candidate.protocol) ||
      configured.username ||
      configured.password ||
      candidate.origin !== configured.origin ||
      candidate.username ||
      candidate.password ||
      !/^\/embed\/review\/[A-Za-z0-9_-]{43}$/.test(candidate.pathname) ||
      candidate.search ||
      candidate.hash
    ) {
      return false;
    }
    return candidate.toString();
  } catch {
    return false;
  }
}

function parseClaims(value: unknown): CompletionPayload | null {
  if (!isRecord(value)) return null;
  const goalsMet =
    value.goals_met === undefined ? {} : parseGoals(value.goals_met);
  if (
    value.iss !== COMPLETION_TOKEN_ISSUER ||
    value.aud !== COMPLETION_TOKEN_AUDIENCE ||
    value.version !== COMPLETION_TOKEN_VERSION ||
    !isBoundedId(value.sub) ||
    !isBoundedId(value.block_id) ||
    !isBoundedId(value.scenario_id) ||
    !isBoundedId(value.attempt_id) ||
    !Number.isInteger(value.score) ||
    Number(value.score) < 0 ||
    Number(value.score) > 100 ||
    !Number.isInteger(value.iat) ||
    !Number.isInteger(value.exp) ||
    Number(value.exp) <= Number(value.iat) ||
    Number(value.exp) - Number(value.iat) > COMPLETION_TOKEN_TTL_SECONDS ||
    goalsMet === null
  ) {
    return null;
  }
  return {
    ...(value as CompletionPayload),
    ...(value.goals_met === undefined ? {} : { goals_met: goalsMet }),
  };
}

export function verifyRolePlayCompletionToken(input: {
  token: string;
  expected: {
    userId: string;
    blockId: string;
    scenarioId: string;
    attemptId: string;
  };
  secret?: string;
  previousSecret?: string;
  previousSecretValidUntil?: string;
  rolePlayBaseUrl?: string;
  now?: Date;
}): VerificationSuccess | { ok: false; error: string } {
  const secret =
    input.secret ??
    (process.env.ROLE_PLAY_COMPLETION_VERIFY_SECRET?.trim() ||
      process.env.ROLE_PLAY_JWT_SECRET);
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    return FAILURE;
  }
  if (input.token.length > MAX_TOKEN_CHARS) return FAILURE;
  const parts = input.token.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    return FAILURE;
  }

  const header = decodeJson(parts[0]);
  const payload = parseClaims(decodeJson(parts[1]));
  if (
    !isRecord(header) ||
    header.alg !== "HS256" ||
    header.typ !== "JWT" ||
    !payload
  ) {
    return FAILURE;
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const previousSecret =
    input.previousSecret ?? process.env.ROLE_PLAY_COMPLETION_PREVIOUS_SECRET;
  const previousSecretValidUntil =
    input.previousSecretValidUntil ??
    process.env.ROLE_PLAY_COMPLETION_PREVIOUS_SECRET_VALID_UNTIL;
  const verificationSecrets = [secret];
  if (previousSecret) {
    const cutoffMs = Date.parse(previousSecretValidUntil ?? "");
    if (
      Buffer.byteLength(previousSecret, "utf8") < MIN_SECRET_BYTES ||
      !Number.isFinite(cutoffMs) ||
      Math.floor(cutoffMs / 1000) >
        nowSeconds + MAX_PREVIOUS_KEY_OVERLAP_SECONDS
    ) {
      return FAILURE;
    }
    if (nowSeconds <= Math.floor(cutoffMs / 1000)) {
      verificationSecrets.push(previousSecret);
    }
  }
  const actualBytes = Buffer.from(parts[2]);
  const signatureMatches = verificationSecrets.some((verificationSecret) => {
    const expectedSignature = createHmac("sha256", verificationSecret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest("base64url");
    const expectedBytes = Buffer.from(expectedSignature);
    return (
      expectedBytes.length === actualBytes.length &&
      timingSafeEqual(expectedBytes, actualBytes)
    );
  });
  if (!signatureMatches) {
    return FAILURE;
  }

  if (
    payload.sub !== input.expected.userId ||
    payload.block_id !== input.expected.blockId ||
    payload.scenario_id !== input.expected.scenarioId ||
    payload.attempt_id !== input.expected.attemptId ||
    payload.iat > nowSeconds + MAX_CLOCK_SKEW_SECONDS ||
    payload.exp <= nowSeconds
  ) {
    return FAILURE;
  }

  const summaryUrl = parseSummaryUrl(
    payload.summary_url,
    input.rolePlayBaseUrl ?? process.env.NEXT_PUBLIC_ROLE_PLAY_BASE_URL,
  );
  if (summaryUrl === false) return FAILURE;

  return {
    ok: true,
    score: payload.score,
    summaryUrl,
    goalsMet: payload.goals_met ?? {},
  };
}
