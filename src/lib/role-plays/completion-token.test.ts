import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyRolePlayCompletionToken } from "./completion-token";

const SECRET = "a-shared-role-play-secret-that-is-over-32-bytes";

function token(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

describe("role-play completion token", () => {
  it("accepts a signed result bound to the learner, block, scenario, and attempt", () => {
    const result = verifyRolePlayCompletionToken({
      token: token({
        iss: "closer-lab",
        aud: "bmh-institute",
        ver: 1,
        sub: "user-1",
        block_id: "block-1",
        scenario_id: "scenario-1",
        attempt_id: "attempt-1",
        score: 87,
        iat: 1_700_000_000,
        exp: 1_700_000_600,
      }),
      expected: {
        userId: "user-1",
        blockId: "block-1",
        scenarioId: "scenario-1",
        attemptId: "attempt-1",
      },
      secret: SECRET,
      now: new Date(1_700_000_000_000),
    });

    expect(result).toMatchObject({ ok: true, score: 87 });
  });

  it("rejects tampering and a token bound to another block", () => {
    const signed = token({
      iss: "closer-lab",
      aud: "bmh-institute",
      ver: 1,
      sub: "user-1",
      block_id: "block-2",
      scenario_id: "scenario-1",
      attempt_id: "attempt-1",
      score: 100,
      iat: 1_700_000_000,
      exp: 1_700_000_600,
    });

    expect(
      verifyRolePlayCompletionToken({
        token: `${signed.slice(0, -1)}x`,
        expected: {
          userId: "user-1",
          blockId: "block-1",
          scenarioId: "scenario-1",
          attemptId: "attempt-1",
        },
        secret: SECRET,
        now: new Date(1_700_000_000_000),
      }),
    ).toEqual({ ok: false, error: "Role play completion could not be verified." });
  });
});
