// WR-05: regression that AdminUsersPage calls requireAdmin() before any
// data fetch. Same shape as reports/page.test.ts (HARDEN-01).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const calls: string[] = [];
let tableData: Record<string, unknown[]> = {};

vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: vi.fn(async () => {
    calls.push("requireAdmin");
    return {
      id: "admin-1",
      email: "a@b.com",
      system_role: "admin",
      full_name: "Admin",
      status: "active",
    };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    calls.push("createClient");
    return {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({ data: tableData[table] ?? [], error: null }).then(r),
        };
        return chain;
      },
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
    tableData = {};
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(requireAdmin).mockImplementation(async () => {
      calls.push("requireAdmin");
      return {
        id: "admin-1",
        email: "a@b.com",
        system_role: "admin",
        full_name: "Admin",
        status: "active",
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

  it("renders pilot setup states", async () => {
    tableData = {
      profiles: [
        {
          id: "user-ready",
          email: "ready@example.com",
          full_name: "Ready Learner",
          system_role: "learner",
          status: "active",
          created_at: "2026-05-09T10:00:00.000Z",
        },
        {
          id: "user-missing",
          email: "missing@example.com",
          full_name: "Missing Access",
          system_role: "learner",
          status: "active",
          created_at: "2026-05-09T09:00:00.000Z",
        },
      ],
      invites: [
        {
          id: "invite-expired",
          email: "expired@example.com",
          system_role: "learner",
          role_group_ids: ["group-1"],
          created_at: "2026-05-09T11:00:00.000Z",
          accepted_at: null,
          expires_at: "2020-01-01T00:00:00.000Z",
        },
      ],
      role_groups: [{ id: "group-1", name: "Pilot Learners" }],
      user_role_groups: [
        { user_id: "user-ready", role_group_id: "group-1" },
      ],
    };

    const html = renderToStaticMarkup(await AdminUsersPage());

    expect(html).toContain("Pilot setup");
    expect(html).toContain("No role group assigned");
    expect(html).toContain("Expired");
    expect(html).toContain("Role group assigned");
    expect(html).toContain("Send invite");
    expect(html).toContain("text-transform:uppercase");
  });

  it("wraps dense users tables in horizontal scroll regions", async () => {
    tableData = {
      profiles: [
        {
          id: "user-ready",
          email: "ready@example.com",
          full_name: "Ready Learner",
          system_role: "learner",
          status: "active",
          created_at: "2026-05-09T10:00:00.000Z",
        },
      ],
      invites: [
        {
          id: "invite-pending",
          email: "pending@example.com",
          system_role: "learner",
          role_group_ids: ["group-1"],
          created_at: "2026-05-09T11:00:00.000Z",
          accepted_at: null,
          expires_at: "2026-05-10T00:00:00.000Z",
        },
      ],
      role_groups: [{ id: "group-1", name: "Pilot Learners" }],
      user_role_groups: [
        { user_id: "user-ready", role_group_id: "group-1" },
      ],
    };

    const html = renderToStaticMarkup(await AdminUsersPage());

    expect(html).toMatch(
      /data-testid="pilot-setup-table-scroll" style="[^"]*overflow-x:auto/,
    );
    expect(html).toMatch(
      /data-testid="active-members-table-scroll" style="[^"]*overflow-x:auto/,
    );
    expect(html).toMatch(
      /data-testid="pending-invites-table-scroll" style="[^"]*overflow-x:auto/,
    );
  });
});
