import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyRolePlayCompletionToken } from "./completion-token";

const SECRET = "a-shared-role-play-secret-that-is-over-32-bytes";
const NEXT_SECRET = "the-next-completion-proof-secret-over-32-bytes";
const NOW_SECONDS = 1_700_000_000;
const ATTEMPT_ID = "dea00001-0000-4000-a000-000000000001";
const BASE_URL = "https://lab.example.com";
const REVIEW_TOKEN = "A".repeat(43);

function validPayload(): Record<string, unknown> {
  return {
    iss: "closer-lab",
    aud: "bmh-institute",
    version: 1,
    sub: "user-1",
    block_id: "block-1",
    scenario_id: "scenario-1",
    attempt_id: ATTEMPT_ID,
    score: 87,
    summary_url: `${BASE_URL}/embed/review/${REVIEW_TOKEN}`,
    goals_met: { discovery: true, close: false },
    iat: NOW_SECONDS,
    exp: NOW_SECONDS + 120,
  };
}

function token(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
  secret = SECRET,
) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${body}`)
    .digest("base64url");
  return `${encodedHeader}.${body}.${signature}`;
}

function verify(payload = validPayload(), header?: Record<string, unknown>) {
  return verifyRolePlayCompletionToken({
    token: token(payload, header),
    expected: {
      userId: "user-1",
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: ATTEMPT_ID,
    },
    secret: SECRET,
    rolePlayBaseUrl: BASE_URL,
    now: new Date(NOW_SECONDS * 1000),
  });
}

describe("role-play completion token", () => {
  it("accepts the exact Closer Lab contract and returns only signed result fields", () => {
    expect(verify()).toEqual({
      ok: true,
      score: 87,
      summaryUrl: `${BASE_URL}/embed/review/${REVIEW_TOKEN}`,
      goalsMet: { discovery: true, close: false },
    });
  });

  it("accepts a proof signed by the bounded previous completion key during rotation", () => {
    const result = verifyRolePlayCompletionToken({
      token: token(validPayload()),
      expected: {
        userId: "user-1",
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: ATTEMPT_ID,
      },
      secret: NEXT_SECRET,
      previousSecret: SECRET,
      previousSecretValidUntil: new Date(
        (NOW_SECONDS + 60) * 1000,
      ).toISOString(),
      rolePlayBaseUrl: BASE_URL,
      now: new Date(NOW_SECONDS * 1000),
    });

    expect(result.ok).toBe(true);
  });

  it("accepts both old in-flight and new completion proofs during receiver-first rotation", () => {
    const expected = {
      userId: "user-1",
      blockId: "block-1",
      scenarioId: "scenario-1",
      attemptId: ATTEMPT_ID,
    };
    const options = {
      expected,
      secret: NEXT_SECRET,
      previousSecret: SECRET,
      previousSecretValidUntil: new Date(
        (NOW_SECONDS + 60) * 1000,
      ).toISOString(),
      rolePlayBaseUrl: BASE_URL,
      now: new Date(NOW_SECONDS * 1000),
    };

    expect(
      verifyRolePlayCompletionToken({
        ...options,
        token: token(validPayload(), undefined, SECRET),
      }).ok,
    ).toBe(true);
    expect(
      verifyRolePlayCompletionToken({
        ...options,
        token: token(validPayload(), undefined, NEXT_SECRET),
      }).ok,
    ).toBe(true);
  });

  it("rejects the previous completion key after its cutoff", () => {
    const result = verifyRolePlayCompletionToken({
      token: token(validPayload()),
      expected: {
        userId: "user-1",
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: ATTEMPT_ID,
      },
      secret: NEXT_SECRET,
      previousSecret: SECRET,
      previousSecretValidUntil: new Date(
        (NOW_SECONDS - 1) * 1000,
      ).toISOString(),
      rolePlayBaseUrl: BASE_URL,
      now: new Date(NOW_SECONDS * 1000),
    });

    expect(result.ok).toBe(false);
  });

  it("fails closed when a previous completion key has no valid cutoff", () => {
    const result = verifyRolePlayCompletionToken({
      token: token(validPayload()),
      expected: {
        userId: "user-1",
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: ATTEMPT_ID,
      },
      secret: NEXT_SECRET,
      previousSecret: SECRET,
      previousSecretValidUntil: "not-a-date",
      rolePlayBaseUrl: BASE_URL,
      now: new Date(NOW_SECONDS * 1000),
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a previous completion key cutoff beyond the 15-minute overlap", () => {
    const result = verifyRolePlayCompletionToken({
      token: token(validPayload()),
      expected: {
        userId: "user-1",
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: ATTEMPT_ID,
      },
      secret: NEXT_SECRET,
      previousSecret: SECRET,
      previousSecretValidUntil: new Date(
        (NOW_SECONDS + 901) * 1000,
      ).toISOString(),
      rolePlayBaseUrl: BASE_URL,
      now: new Date(NOW_SECONDS * 1000),
    });

    expect(result.ok).toBe(false);
  });

  it.each([
    ["issuer", { iss: "other" }],
    ["audience", { aud: "other" }],
    ["version", { version: 2 }],
    ["learner", { sub: "user-2" }],
    ["block", { block_id: "block-2" }],
    ["scenario", { scenario_id: "scenario-2" }],
    ["attempt", { attempt_id: "attempt-2" }],
  ])("rejects a proof with the wrong %s binding", (_name, mutation) => {
    expect(verify({ ...validPayload(), ...mutation }).ok).toBe(false);
  });

  it.each([
    ["fractional score", { score: 87.5 }],
    ["high score", { score: 101 }],
    ["fractional iat", { iat: NOW_SECONDS + 0.5 }],
    ["fractional exp", { exp: NOW_SECONDS + 119.5 }],
    ["reversed lifetime", { exp: NOW_SECONDS }],
    ["long lifetime", { exp: NOW_SECONDS + 121 }],
    ["future iat", { iat: NOW_SECONDS + 31, exp: NOW_SECONDS + 120 }],
    ["expired", { iat: NOW_SECONDS - 120, exp: NOW_SECONDS }],
  ])("rejects invalid numeric claim semantics: %s", (_name, mutation) => {
    expect(verify({ ...validPayload(), ...mutation }).ok).toBe(false);
  });

  it.each([
    ["algorithm", { alg: "none", typ: "JWT" }],
    ["type", { alg: "HS256", typ: "jwt" }],
  ])("rejects the wrong JWT header %s", (_name, header) => {
    expect(verify(validPayload(), header).ok).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const signed = token(validPayload());
    const result = verifyRolePlayCompletionToken({
      token: `${signed.slice(0, -1)}x`,
      expected: {
        userId: "user-1",
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: ATTEMPT_ID,
      },
      secret: SECRET,
      rolePlayBaseUrl: BASE_URL,
      now: new Date(NOW_SECONDS * 1000),
    });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["wrong origin", `https://evil.example/embed/review/${REVIEW_TOKEN}`],
    [
      "credentials",
      `https://user@lab.example.com/embed/review/${REVIEW_TOKEN}`,
    ],
    ["member-only recording path", `${BASE_URL}/recordings/${ATTEMPT_ID}`],
    ["short review token", `${BASE_URL}/embed/review/short`],
    ["query", `${BASE_URL}/embed/review/${REVIEW_TOKEN}?download=1`],
    ["fragment", `${BASE_URL}/embed/review/${REVIEW_TOKEN}#result`],
  ])("rejects an invalid summary URL: %s", (_name, summaryUrl) => {
    expect(verify({ ...validPayload(), summary_url: summaryUrl }).ok).toBe(
      false,
    );
  });

  it("rejects a summary URL when the trusted Closer Lab URL is unavailable", () => {
    const result = verifyRolePlayCompletionToken({
      token: token(validPayload()),
      expected: {
        userId: "user-1",
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: ATTEMPT_ID,
      },
      secret: SECRET,
      rolePlayBaseUrl: "",
      now: new Date(NOW_SECONDS * 1000),
    });
    expect(result.ok).toBe(false);
  });

  it.each([
    [
      "too many goals",
      Object.fromEntries(
        Array.from({ length: 9 }, (_, index) => [`goal-${index}`, true]),
      ),
    ],
    ["invalid goal key", { "bad key": true }],
    ["long goal key", { ["x".repeat(129)]: true }],
    ["non-boolean result", { discovery: "yes" }],
    ["array", [true]],
  ])("rejects invalid signed goal outcomes: %s", (_name, goalsMet) => {
    expect(verify({ ...validPayload(), goals_met: goalsMet }).ok).toBe(false);
  });

  it("accepts a proof without optional summary and goal claims", () => {
    const payload = validPayload();
    delete payload.summary_url;
    delete payload.goals_met;
    expect(verify(payload)).toEqual({
      ok: true,
      score: 87,
      summaryUrl: null,
      goalsMet: {},
    });
  });
});
