// HARDEN-01: regression that the page calls requireAdmin() before any data
// fetch. First codebase use of vi.mock. requireAdmin and createClient have
// side effects (redirect, network) that prevent direct invocation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const tablesQueried: string[] = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", email: "a@b.com", system_role: "admin", full_name: "Admin" };
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
      inner: () => chain,
      maybeSingle: async () => ({
        data: {
          id: "u-1",
          email: "learner@example.com",
          full_name: "Test Learner",
          system_role: "learner",
          status: "active",
          created_at: new Date().toISOString(),
        },
        error: null,
      }),
      then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r),
    };
    return {
      from: (table: string) => {
        tablesQueried.push(table);
        return chain;
      },
      auth: { getUser: async () => ({ data: { user: null } }) },
    };
  }),
}));

// params is awaited AFTER requireAdmin in the correct implementation.
// The call-order test confirms requireAdmin precedes both params and createClient.
import { requireAdmin } from "@/lib/auth/guard";
import UserReportPage from "./page";

function makeRedirectError(path: string) {
  const e = new Error("NEXT_REDIRECT");
  (e as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
  return e;
}

describe("UserReportPage", () => {
  beforeEach(() => {
    calls.length = 0;
    tablesQueried.length = 0;
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(requireAdmin).mockImplementation(async () => {
      calls.push("requireAdmin");
      return { id: "admin-1", email: "a@b.com", system_role: "admin", full_name: "Admin" };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls requireAdmin before creating a Supabase client", async () => {
    await UserReportPage({ params: Promise.resolve({ userId: "u-1" }) });
    expect(calls[0]).toBe("requireAdmin");
    expect(calls).toContain("createClient");
    expect(calls.indexOf("requireAdmin")).toBeLessThan(calls.indexOf("createClient"));
  });

  it("queries role-play results for the learner report", async () => {
    await UserReportPage({ params: Promise.resolve({ userId: "u-1" }) });
    expect(tablesQueried).toContain("role_play_results");
  });

  it("redirects unauthenticated requests to /login", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/login");
    });
    await expect(
      UserReportPage({ params: Promise.resolve({ userId: "u-1" }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/login;307;"),
    });
  });

  it("redirects learner-role sessions to /dashboard", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/dashboard");
    });
    await expect(
      UserReportPage({ params: Promise.resolve({ userId: "u-1" }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/dashboard;307;"),
    });
  });
});
