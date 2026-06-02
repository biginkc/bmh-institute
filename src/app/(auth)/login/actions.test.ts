import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProfileRow = { status: string } | null;

const mocks = vi.hoisted(() => {
  const signInWithPassword = vi.fn(async () => ({
    data: { user: { id: "user-1" } as { id: string } | null },
    error: null as { message: string } | null,
  }));
  const signOut = vi.fn(async () => ({ error: null }));
  const maybeSingle = vi.fn<() => Promise<{ data: ProfileRow }>>(async () => ({
    data: { status: "active" },
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const redirect = vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  });

  return { signInWithPassword, signOut, maybeSingle, eq, select, from, redirect };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { signIn } from "./actions";

function validFormData(next = "") {
  const formData = new FormData();
  formData.set("email", "learner@example.com");
  formData.set("password", "password123");
  if (next) formData.set("next", next);
  return formData;
}

describe("signIn", () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockReset();
    mocks.signOut.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.from.mockClear();
    mocks.select.mockClear();
    mocks.eq.mockClear();
    mocks.redirect.mockClear();

    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { status: "active" } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a validation error when email or password is missing", async () => {
    const empty = new FormData();
    await expect(signIn(null, empty)).resolves.toEqual({
      ok: false,
      error: "Email and password are required.",
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("surfaces the auth error on bad credentials", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    await expect(signIn(null, validFormData())).resolves.toEqual({
      ok: false,
      error: "Invalid login credentials",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("blocks a suspended user and signs the session back out", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { status: "suspended" } });

    await expect(signIn(null, validFormData())).resolves.toEqual({
      ok: false,
      error: "Your account has been suspended. Contact your administrator.",
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("allows an active user and redirects to the sanitized next URL", async () => {
    await expect(signIn(null, validFormData("/dashboard"))).rejects.toThrow(
      "redirect:/dashboard",
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("allows an invited user because only suspended profiles are blocked", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { status: "invited" } });
    await expect(signIn(null, validFormData())).rejects.toThrow("redirect:");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
