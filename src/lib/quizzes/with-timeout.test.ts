import { describe, expect, it, vi } from "vitest";

import {
  QUIZ_DEADLINES,
  QUIZ_SERVER_DEADLINES,
  QuizDeadlineError,
  withQuizDeadline,
  withQuizSignal,
} from "./with-timeout";

describe("quiz deadlines", () => {
  it("keeps browser deadlines outside server and database bounds", () => {
    for (const stage of ["start", "resume", "answer", "finalize"] as const) {
      expect(QUIZ_DEADLINES[stage]).toBeGreaterThan(QUIZ_SERVER_DEADLINES[stage]);
    }
    expect(QUIZ_SERVER_DEADLINES.answer).toBeGreaterThan(5_000);
  });
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

  it("aborts the underlying operation when the deadline settles", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const pending = withQuizDeadline("start", (signal) => new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(signal.reason);
        }, { once: true });
      }));
      const rejection = expect(pending).rejects.toMatchObject({
        name: "QuizDeadlineError",
        stage: "start",
      });
      await vi.advanceTimersByTimeAsync(QUIZ_DEADLINES.start);
      await rejection;
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes a typed timeout error for reconciliation", () => {
    const error = new QuizDeadlineError("finalize", QUIZ_DEADLINES.finalize);
    expect(error.stage).toBe("finalize");
    expect(error.timeoutMs).toBe(QUIZ_DEADLINES.finalize);
  });

  it("stops waiting for a non-abortable operation when the typed signal aborts", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = withQuizSignal(controller.signal, () => new Promise<never>(() => {}));
      const error = new QuizDeadlineError("finalize", QUIZ_DEADLINES.finalize);
      const rejection = expect(pending).rejects.toBe(error);

      controller.abort(error);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
