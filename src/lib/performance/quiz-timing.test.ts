import { describe, expect, it, vi } from "vitest";

import { logQuizTiming, withQuizTiming } from "./quiz-timing";

describe("quiz timing", () => {
  it("logs only the stage and duration, never attempt or answer data", () => {
    const previous = process.env.BMH_QUIZ_TIMING_LOGS;
    process.env.BMH_QUIZ_TIMING_LOGS = "1";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      logQuizTiming("answer", 12.34);
      expect(info).toHaveBeenCalledWith(
        JSON.stringify({
          event: "bmh_quiz_stage_timing",
          stage: "answer",
          duration_ms: 12.3,
        }),
      );
      expect(info.mock.calls[0]?.[0]).not.toContain("attempt");
      expect(info.mock.calls[0]?.[0]).not.toContain("question");
      expect(info.mock.calls[0]?.[0]).not.toContain("selected");
    } finally {
      info.mockRestore();
      if (previous === undefined) delete process.env.BMH_QUIZ_TIMING_LOGS;
      else process.env.BMH_QUIZ_TIMING_LOGS = previous;
    }
  });

  it("returns the operation result while recording its stage", async () => {
    const previous = process.env.BMH_QUIZ_TIMING_LOGS;
    process.env.BMH_QUIZ_TIMING_LOGS = "1";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await expect(withQuizTiming("finalize", async () => "result")).resolves.toBe("result");
      expect(info).toHaveBeenCalledTimes(1);
    } finally {
      info.mockRestore();
      if (previous === undefined) delete process.env.BMH_QUIZ_TIMING_LOGS;
      else process.env.BMH_QUIZ_TIMING_LOGS = previous;
    }
  });
});
