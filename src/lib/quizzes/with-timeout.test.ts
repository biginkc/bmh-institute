import { describe, expect, it, vi } from "vitest";

import { withQuizAnswerTimeout } from "./with-timeout";

describe("withQuizAnswerTimeout", () => {
  it("rejects a request that never settles", async () => {
    vi.useFakeTimers();
    try {
      const pending = withQuizAnswerTimeout(new Promise<never>(() => {}), 8_000);
      const rejection = expect(pending).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(8_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
