// WR-05: regression that AdminUsersPage calls requireAdmin() before any
// data fetch. Same shape as reports/page.test.ts (HARDEN-01).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return {
      id: "admin-1",
      email: "a@b.com",
      system_role: "admin",
      full_name: "Admin",
    };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    calls.push("createClient");
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r),
    };
    return {
      from: () => chain,
      auth: { getUser: async () => ({ data: { user: null } }) },
    };
  }),
}));

import { requireAdmin } from "@/lib/auth/guard";
import AdminUsersPage from "./page";

function makeRedirectError(path: string) {
  const e = new Error("NEXT_REDIRECT");
  (e as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
  return e;
}

describe("AdminUsersPage (WR-05)", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(requireAdmin).mockImplementation(async () => {
      calls.push("requireAdmin");
      return {
        id: "admin-1",
        email: "a@b.com",
        system_role: "admin",
        full_name: "Admin",
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls requireAdmin before creating a Supabase client", async () => {
    await AdminUsersPage();
    expect(calls[0]).toBe("requireAdmin");
    expect(calls).toContain("createClient");
    expect(calls.indexOf("requireAdmin")).toBeLessThan(
      calls.indexOf("createClient"),
    );
  });

  it("redirects unauthenticated requests to /login", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/login");
    });
    await expect(AdminUsersPage()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/login;307;"),
    });
  });

  it("redirects learner-role sessions to /dashboard", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/dashboard");
    });
    await expect(AdminUsersPage()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/dashboard;307;"),
    });
  });
});
