import { describe, expect, it, vi } from "vitest";

import {
  QUIZ_DEADLINES,
  QuizDeadlineError,
  withQuizDeadline,
} from "./with-timeout";

describe("quiz deadlines", () => {
  it.each([
    ["start", QUIZ_DEADLINES.start],
    ["resume", QUIZ_DEADLINES.resume],
    ["answer", QUIZ_DEADLINES.answer],
    ["finalize", QUIZ_DEADLINES.finalize],
  ] as const)("has a typed %s deadline", (stage, timeoutMs) => {
    expect(timeoutMs).toBeGreaterThan(0);
    expect(stage).toMatch(/^(start|resume|answer|finalize)$/);
  });

  it("rejects a request that never settles with its stage", async () => {
    vi.useFakeTimers();
    try {
      const pending = withQuizDeadline("resume", () => new Promise<never>(() => {}));
      const rejection = expect(pending).rejects.toMatchObject({
        name: "QuizDeadlineError",
        stage: "resume",
      });
      await vi.advanceTimersByTimeAsync(QUIZ_DEADLINES.resume);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves a settled result and does not leak an unhandled timeout", async () => {
    await expect(withQuizDeadline("answer", async () => "ok")).resolves.toBe("ok");
  });

  it("exposes a typed timeout error for reconciliation", () => {
    const error = new QuizDeadlineError("finalize", QUIZ_DEADLINES.finalize);
    expect(error.stage).toBe("finalize");
    expect(error.timeoutMs).toBe(QUIZ_DEADLINES.finalize);
  });
});
