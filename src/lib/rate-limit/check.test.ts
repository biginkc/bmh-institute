import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RpcResponse = {
  data: { allowed: boolean; retry_after_seconds: number }[] | null;
  error: { message: string } | null;
};

let rpcResponse: RpcResponse = {
  data: [{ allowed: true, retry_after_seconds: 0 }],
  error: null,
};
const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
  void name;
  void params;
  return rpcResponse;
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc })),
}));

import { checkAndConsume } from "./check";

describe("checkAndConsume", () => {
  beforeEach(() => {
    rpcResponse = {
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    };
    rpc.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls the rate-limit RPC with the key, threshold, and window", async () => {
    await checkAndConsume({
      keyType: "ip",
      keyValue: "203.0.113.1",
      threshold: 5,
      windowSeconds: 900,
    });

    expect(rpc).toHaveBeenCalledWith("fn_check_and_consume_rate_limit", {
      p_key_type: "ip",
      p_key_value: "203.0.113.1",
      p_threshold: 5,
      p_window_seconds: 900,
    });
  });

  it("normalizes the RPC row into camelCase", async () => {
    rpcResponse = {
      data: [{ allowed: false, retry_after_seconds: 120 }],
      error: null,
    };

    await expect(
      checkAndConsume({
        keyType: "email",
        keyValue: "learner@example.com",
        threshold: 3,
        windowSeconds: 3600,
      }),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 120 });
  });

  it("fails closed when the RPC returns an error", async () => {
    rpcResponse = {
      data: null,
      error: { message: "rpc failed" },
    };

    await expect(
      checkAndConsume({
        keyType: "ip",
        keyValue: "203.0.113.1",
        threshold: 5,
        windowSeconds: 900,
      }),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 900 });
  });

  it("fails closed when the RPC returns no row", async () => {
    rpcResponse = { data: [], error: null };

    await expect(
      checkAndConsume({
        keyType: "email",
        keyValue: "learner@example.com",
        threshold: 3,
        windowSeconds: 3600,
      }),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 3600 });
  });
});
