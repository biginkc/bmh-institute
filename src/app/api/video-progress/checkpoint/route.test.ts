import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    rpc,
  })),
}));

import { POST } from "./route";

describe("POST /api/video-progress/checkpoint", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
  });

  it("rejects invalid JSON before authentication or database access", async () => {
    const response = await POST(new Request("http://localhost/api/video-progress/checkpoint", {
      method: "POST",
      body: "{not-json",
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid video checkpoint." });
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(checkpointRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "You must be signed in." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the ownership or unlock failure from the guarded RPC", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Video checkpoint does not match the lesson asset." },
    });

    const response = await POST(checkpointRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Video checkpoint does not match the lesson asset.",
    });
    expect(rpc).toHaveBeenCalledWith("fn_checkpoint_video_playback", expect.objectContaining({
      p_user_id: "user-1",
      p_block_id: "block-1",
    }));
  });
});

function checkpointRequest() {
  return new Request("http://localhost/api/video-progress/checkpoint", {
    method: "POST",
    body: JSON.stringify({
      blockId: "block-1",
      positionSeconds: 42,
      durationSeconds: 100,
      clientUpdatedAt: Date.now(),
    }),
    headers: { "content-type": "application/json" },
  });
}
