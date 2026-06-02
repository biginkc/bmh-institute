import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const signOut = vi.fn(async () => ({ error: null }));
  const getUser = vi.fn(async () => ({
    data: { user: { id: "user-1", email: "admin@bmh.test" } },
  }));
  const profile = vi.fn(async () => ({
    data: {
      id: "user-1",
      email: "admin@bmh.test",
      full_name: "Admin One",
      system_role: "admin",
      status: "active",
    },
  }));
  return { getUser, profile, signOut };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.profile,
        }),
      }),
    }),
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

import { getAuthedProfile, requireAdmin } from "./guard";

describe("auth guard suspended sessions", () => {
  beforeEach(() => {
    mocks.getUser.mockClear();
    mocks.profile.mockClear();
    mocks.signOut.mockClear();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@bmh.test" } },
    });
    mocks.profile.mockResolvedValue({
      data: {
        id: "user-1",
        email: "admin@bmh.test",
        full_name: "Admin One",
        system_role: "admin",
        status: "active",
      },
    });
  });

  it("signs out and rejects an already-authenticated suspended profile", async () => {
    mocks.profile.mockResolvedValueOnce({
      data: {
        id: "user-1",
        email: "admin@bmh.test",
        full_name: "Admin One",
        system_role: "admin",
        status: "suspended",
      },
    });

    await expect(getAuthedProfile()).resolves.toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("redirects suspended admins away from admin-only routes", async () => {
    mocks.profile.mockResolvedValueOnce({
      data: {
        id: "user-1",
        email: "admin@bmh.test",
        full_name: "Admin One",
        system_role: "admin",
        status: "suspended",
      },
    });

    await expect(requireAdmin()).rejects.toThrow("redirect:/login");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});
