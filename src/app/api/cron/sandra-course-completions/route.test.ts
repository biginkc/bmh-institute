import { beforeEach, describe, expect, it, vi } from "vitest";

const sweepSpy = vi.fn();

vi.mock("@/lib/integrations/sandra/course-completed", () => ({
  reconcilePendingSandraCourseCompletions: () => sweepSpy(),
}));

import { GET } from "./route";
import { maxDuration } from "./route";
import {
  SANDRA_DELIVERY_CRON_HEADROOM_SECONDS,
  SANDRA_DELIVERY_CRON_MAX_DURATION_SECONDS,
  SANDRA_DELIVERY_MAX_ATTEMPTS,
  SANDRA_DELIVERY_REQUEST_TIMEOUT_MS,
  SANDRA_DELIVERY_SWEEP_BATCH_SIZE,
} from "@/lib/integrations/sandra/delivery-policy";

describe("Sandra completion reconciliation cron", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    sweepSpy.mockReset();
    sweepSpy.mockResolvedValue({
      ok: true,
      selected: 0,
      acknowledged: 0,
      stillPending: 0,
      failures: [],
    });
  });

  it("fails closed without the cron bearer secret", async () => {
    const response = await GET(new Request("https://institute.test/api/cron/sandra-course-completions"));
    expect(response.status).toBe(401);
    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it("runs the bounded sweep for an authenticated cron request", async () => {
    const response = await GET(new Request(
      "https://institute.test/api/cron/sandra-course-completions",
      { headers: { authorization: "Bearer test-cron-secret" } },
    ));
    expect(response.status).toBe(200);
    expect(sweepSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces a disabled or unavailable sweep for cron observability", async () => {
    sweepSpy.mockResolvedValue({ ok: false, reason: "not_configured" });
    const response = await GET(new Request(
      "https://institute.test/api/cron/sandra-course-completions",
      { headers: { authorization: "Bearer test-cron-secret" } },
    ));
    expect(response.status).toBe(503);
  });

  it("keeps worst-case sequential provider time below the cron ceiling", () => {
    expect(maxDuration).toBe(SANDRA_DELIVERY_CRON_MAX_DURATION_SECONDS);
    const worstCaseProviderMs =
      SANDRA_DELIVERY_SWEEP_BATCH_SIZE *
      SANDRA_DELIVERY_MAX_ATTEMPTS *
      SANDRA_DELIVERY_REQUEST_TIMEOUT_MS;
    expect(worstCaseProviderMs).toBeLessThanOrEqual(
      (maxDuration - SANDRA_DELIVERY_CRON_HEADROOM_SECONDS) * 1_000,
    );
  });
});
