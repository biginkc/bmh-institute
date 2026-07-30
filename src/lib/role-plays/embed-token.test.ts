import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ROLE_PLAY_EMBED_LAUNCH_AUDIENCE,
  mintRolePlayEmbedBundle,
  mintRolePlayEmbedToken,
} from "./embed-token";

const SECRET = "0123456789abcdef0123456789abcdef";
const PARENT_ORIGIN = "https://institute.bmhgroupkc.com";
const CONTRACT_VECTOR = JSON.parse(
  readFileSync(
    new URL("./embed-parent-launch-contract.v1.json", import.meta.url),
    "utf8",
  ),
) as {
  input: {
    userId: string;
    lessonId: string;
    blockId: string;
    learnerName: string;
    scenarioId: string;
    parentOrigin: string;
    now: string;
  };
  secret: string;
  launch_jti: string;
  token: string;
  launchCredential: string;
};

describe("mintRolePlayEmbedToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mints a short-lived BMH Institute identity token for Closer Lab", () => {
    const token = mintRolePlayEmbedToken(
      {
        userId: "user-1",
        lessonId: "lesson-1",
        blockId: "block-1",
        learnerName: "Test Learner",
        scenarioId: "scenario-1",
        parentOrigin: PARENT_ORIGIN,
        now: new Date("2026-05-08T18:00:00.000Z"),
      },
      SECRET,
    );

    const [, body] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );

    expect(token.split(".")).toHaveLength(3);
    expect(payload).toMatchObject({
      iss: "sandra-university",
      aud: "closer-lab",
      sub: "user-1",
      lesson_id: "lesson-1",
      block_id: "block-1",
      learner_name: "Test Learner",
      scenario_id: "scenario-1",
      parent_origin: PARENT_ORIGIN,
      iat: 1778263200,
      exp: 1778263500,
    });
  });

  it("mints a parent-held launch credential bound to the exact iframe token", () => {
    const bundle = mintRolePlayEmbedBundle(
      {
        userId: "user-1",
        lessonId: "lesson-1",
        blockId: "block-1",
        learnerName: "Test Learner",
        scenarioId: "scenario-1",
        parentOrigin: PARENT_ORIGIN,
        now: new Date("2026-05-08T18:00:00.000Z"),
      },
      SECRET,
    );

    const [, launchBody] = bundle.launchCredential.split(".");
    const launch = JSON.parse(
      Buffer.from(launchBody, "base64url").toString("utf8"),
    );

    expect(bundle.token.split(".")).toHaveLength(3);
    expect(bundle.launchCredential.split(".")).toHaveLength(3);
    expect(bundle.launchCredential).not.toContain(bundle.token);
    expect(launch).toMatchObject({
      iss: "sandra-university",
      aud: ROLE_PLAY_EMBED_LAUNCH_AUDIENCE,
      sub: "user-1",
      lesson_id: "lesson-1",
      block_id: "block-1",
      scenario_id: "scenario-1",
      parent_origin: PARENT_ORIGIN,
      token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      jti: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      iat: 1778263200,
      exp: 1778263500,
    });
  });

  it("matches the cross-repo deterministic producer contract vector byte for byte", () => {
    const bundle = mintRolePlayEmbedBundle(
      {
        ...CONTRACT_VECTOR.input,
        now: new Date(CONTRACT_VECTOR.input.now),
      },
      CONTRACT_VECTOR.secret,
      { launchJti: CONTRACT_VECTOR.launch_jti },
    );

    expect(bundle).toEqual({
      token: CONTRACT_VECTOR.token,
      launchCredential: CONTRACT_VECTOR.launchCredential,
    });
  });

  it("rejects secrets that are too short to share across apps", () => {
    expect(() =>
      mintRolePlayEmbedToken(
        {
          userId: "user-1",
          lessonId: "lesson-1",
          blockId: "block-1",
          learnerName: "Test Learner",
          scenarioId: "scenario-1",
          parentOrigin: PARENT_ORIGIN,
        },
        "short",
      ),
    ).toThrow(/32 bytes/);
  });

  it("refuses the legacy shared secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ROLE_PLAY_EMBED_SIGNING_SECRET", "");
    vi.stubEnv("ROLE_PLAY_JWT_SECRET", SECRET);

    expect(() =>
      mintRolePlayEmbedToken({
        userId: "user-1",
        lessonId: "lesson-1",
        blockId: "block-1",
        learnerName: "Test Learner",
        scenarioId: "scenario-1",
        parentOrigin: PARENT_ORIGIN,
      }),
    ).toThrow(/ROLE_PLAY_EMBED_SIGNING_SECRET/);
  });

  it("uses the directional embed key in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ROLE_PLAY_EMBED_SIGNING_SECRET", SECRET);
    vi.stubEnv(
      "ROLE_PLAY_COMPLETION_VERIFY_SECRET",
      "completion-verification-secret-over-32-bytes",
    );
    vi.stubEnv("ROLE_PLAY_JWT_SECRET", "legacy-secret-that-is-long-enough-to-use");

    expect(
      mintRolePlayEmbedToken({
        userId: "user-1",
        lessonId: "lesson-1",
        blockId: "block-1",
        learnerName: "Test Learner",
        scenarioId: "scenario-1",
        parentOrigin: PARENT_ORIGIN,
      }).split("."),
    ).toHaveLength(3);
  });

  it("refuses production minting when the completion secret is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ROLE_PLAY_EMBED_SIGNING_SECRET", SECRET);
    vi.stubEnv("ROLE_PLAY_COMPLETION_VERIFY_SECRET", "");

    expect(() =>
      mintRolePlayEmbedToken(
        {
          userId: "user-1",
          lessonId: "lesson-1",
          blockId: "block-1",
          learnerName: "Test Learner",
          scenarioId: "scenario-1",
          parentOrigin: PARENT_ORIGIN,
        },
        SECRET,
      ),
    ).toThrow(/ROLE_PLAY_EMBED_SIGNING_SECRET/);
  });

  it("refuses production minting when directional secrets are identical", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ROLE_PLAY_EMBED_SIGNING_SECRET", SECRET);
    vi.stubEnv("ROLE_PLAY_COMPLETION_VERIFY_SECRET", SECRET);

    expect(() =>
      mintRolePlayEmbedToken({
        userId: "user-1",
        lessonId: "lesson-1",
        blockId: "block-1",
        learnerName: "Test Learner",
        scenarioId: "scenario-1",
        parentOrigin: PARENT_ORIGIN,
      }),
    ).toThrow(/ROLE_PLAY_EMBED_SIGNING_SECRET/);
  });

  it.each([0, -1, 301, 1.5, Number.NaN])(
    "rejects an invalid embed token lifetime: %s",
    (ttlSeconds) => {
      expect(() =>
        mintRolePlayEmbedToken(
          {
            userId: "user-1",
            lessonId: "lesson-1",
            blockId: "block-1",
            learnerName: "Test Learner",
            scenarioId: "scenario-1",
            parentOrigin: PARENT_ORIGIN,
            ttlSeconds,
          },
          SECRET,
        ),
      ).toThrow(/lifetime/i);
    },
  );

  it.each([
    ["oversized learner id", { userId: "x".repeat(257) }],
    ["oversized learner name", { learnerName: "x".repeat(257) }],
    ["control character in learner name", { learnerName: "Learner\nInjected" }],
    ["control character in block id", { blockId: "block\u0000id" }],
  ])("rejects %s", (_name, mutation) => {
    expect(() =>
      mintRolePlayEmbedToken(
        {
          userId: "user-1",
          lessonId: "lesson-1",
          blockId: "block-1",
          learnerName: "Test Learner",
          scenarioId: "scenario-1",
          parentOrigin: PARENT_ORIGIN,
          ...mutation,
        },
        SECRET,
      ),
    ).toThrow(/requires user/i);
  });
});
