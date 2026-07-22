import { describe, expect, it, vi } from "vitest";

const { updateSession } = vi.hoisted(() => ({
  updateSession: vi.fn(async () => new Response(null, { status: 204 })),
}));

vi.mock("@/lib/supabase/middleware", () => ({ updateSession }));

import { config, proxy } from "./proxy";

describe("Next.js request proxy", () => {
  it("delegates session refresh and keeps static assets outside the matcher", async () => {
    const request = new Request("https://institute.bmhgroupkc.com/dashboard");
    const response = await proxy(request as never);

    expect(updateSession).toHaveBeenCalledWith(request);
    expect(response.status).toBe(204);
    expect(config.matcher[0]).toContain("_next/static");
    expect(config.matcher[0]).toContain("webp");
  });
});
