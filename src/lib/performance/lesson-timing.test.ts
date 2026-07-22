import { describe, expect, it, vi } from "vitest";

import { serverTimingValue, withLessonTiming } from "./lesson-timing";

describe("lesson timing telemetry", () => {
  it("emits only a fixed stage and duration in Server-Timing", () => {
    expect(serverTimingValue("middleware-auth", 12.345)).toBe("middleware-auth;dur=12.3");
  });

  it("does not serialize operation values or private context into structured logs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const privateValue = "learner@example.test signed-token-secret";
    await expect(
      withLessonTiming("current-blocks", async () => ({ privateValue })),
    ).resolves.toEqual({ privateValue });
    const output = info.mock.calls.flat().join(" ");
    expect(output).toContain("bmh_lesson_stage_timing");
    expect(output).toContain("current-blocks");
    expect(output).not.toContain(privateValue);
    info.mockRestore();
  });
});
