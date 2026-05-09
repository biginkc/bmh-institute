import { describe, expect, it } from "vitest";

import { mintRolePlayEmbedToken } from "./embed-token";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("mintRolePlayEmbedToken", () => {
  it("mints a short-lived BMH Institute identity token for Closer Lab", () => {
    const token = mintRolePlayEmbedToken(
      {
        userId: "user-1",
        lessonId: "lesson-1",
        blockId: "block-1",
        learnerName: "Test Learner",
        scenarioId: "scenario-1",
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
      sub: "user-1",
      lesson_id: "lesson-1",
      block_id: "block-1",
      learner_name: "Test Learner",
      scenario_id: "scenario-1",
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
        },
        "short",
      ),
    ).toThrow(/32 bytes/);
  });
});
