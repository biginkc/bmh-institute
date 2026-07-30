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

  it("rejects cross-site or non-JSON mutation requests before authentication", async () => {
    const response = await POST(new Request("http://localhost/api/video-progress/checkpoint", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "text/plain", origin: "https://evil.example" },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid checkpoint request origin.",
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects JSON requests from a foreign origin", async () => {
    const response = await POST(new Request("http://localhost/api/video-progress/checkpoint", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json", origin: "https://evil.example" },
    }));

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects JSON requests marked cross-site", async () => {
    const response = await POST(new Request("http://localhost/api/video-progress/checkpoint", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
    }));

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts JSON from the request origin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({
      data: { saved: true, stale: false, checkpointSequence: 3, ignored: "not exposed" },
      error: null,
    });

    const response = await POST(new Request("http://localhost/api/video-progress/checkpoint", {
      method: "POST",
      body: JSON.stringify({
        blockId: "06306306-3063-4063-8063-463063063063",
        positionSeconds: 42,
        durationSeconds: 100,
        checkpointSequence: 0,
      }),
      headers: { "content-type": "application/json", origin: "http://localhost" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      saved: true,
      stale: false,
      checkpointSequence: 3,
    });
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
      error: "Video checkpoint could not be saved.",
    });
    expect(rpc).toHaveBeenCalledWith("fn_checkpoint_video_playback", expect.objectContaining({
      p_user_id: "user-1",
      p_block_id: "06306306-3063-4063-8063-463063063063",
      p_checkpoint_sequence: 0,
    }));
  });

  it("returns the server-issued sequence for the next checkpoint cursor", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({
      data: { saved: true, stale: false, checkpointSequence: 3 },
      error: null,
    });

    const response = await POST(checkpointRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      saved: true,
      stale: false,
      checkpointSequence: 3,
    });
  });

  it("rejects an invalid guarded RPC result shape", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: { saved: true, stale: false }, error: null });

    const response = await POST(checkpointRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Video checkpoint could not be saved.",
    });
  });
});

function checkpointRequest() {
  return new Request("http://localhost/api/video-progress/checkpoint", {
    method: "POST",
    body: JSON.stringify({
      blockId: "06306306-3063-4063-8063-463063063063",
      positionSeconds: 42,
      durationSeconds: 100,
      checkpointSequence: 0,
    }),
    headers: { "content-type": "application/json" },
  });
}
