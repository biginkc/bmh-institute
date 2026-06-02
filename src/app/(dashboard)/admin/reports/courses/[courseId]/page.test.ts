// HARDEN-01: regression that the page calls requireAdmin() before any data
// fetch. First codebase use of vi.mock. requireAdmin and createClient have
// side effects (redirect, network) that prevent direct invocation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return { id: "admin-1", email: "a@b.com", system_role: "admin", full_name: "Admin", status: "active" };
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
      maybeSingle: async () => ({
        data: {
          id: "c-1",
          title: "Test Course",
          description: null,
          is_published: true,
        },
        error: null,
      }),
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
import CourseReportPage from "./page";

function makeRedirectError(path: string) {
  const e = new Error("NEXT_REDIRECT");
  (e as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
  return e;
}

describe("CourseReportPage", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(requireAdmin).mockImplementation(async () => {
      calls.push("requireAdmin");
      return { id: "admin-1", email: "a@b.com", system_role: "admin", full_name: "Admin", status: "active" };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls requireAdmin before creating a Supabase client", async () => {
    await CourseReportPage({ params: Promise.resolve({ courseId: "c-1" }) });
    expect(calls[0]).toBe("requireAdmin");
    expect(calls).toContain("createClient");
    expect(calls.indexOf("requireAdmin")).toBeLessThan(calls.indexOf("createClient"));
  });

  it("redirects unauthenticated requests to /login", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/login");
    });
    await expect(
      CourseReportPage({ params: Promise.resolve({ courseId: "c-1" }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/login;307;"),
    });
  });

  it("redirects learner-role sessions to /dashboard", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw makeRedirectError("/dashboard");
    });
    await expect(
      CourseReportPage({ params: Promise.resolve({ courseId: "c-1" }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/dashboard;307;"),
    });
  });
});
