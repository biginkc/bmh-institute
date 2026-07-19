import { afterEach, describe, expect, it, vi } from "vitest";

import { mintRolePlayEmbedToken } from "./embed-token";

const SECRET = "0123456789abcdef0123456789abcdef";
const PARENT_ORIGIN = "https://institute.bmhgroupkc.com";

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
