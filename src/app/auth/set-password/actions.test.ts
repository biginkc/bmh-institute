import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const updateUser = vi.fn(async () => ({
    data: null,
    error: null as { message: string } | null,
  }));
  const getUser = vi.fn<() => Promise<{ data: { user: { email: string } | null } }>>(async () => ({
    data: { user: { email: "Learner@Example.COM" } },
  }));
  const checkAndConsume = vi.fn(async () => ({
    allowed: true,
    retryAfterSeconds: 0,
  }));
  const headersMock = vi.fn(
    async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
  );
  const redirect = vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  });

  return { updateUser, getUser, checkAndConsume, headersMock, redirect };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  })),
}));

vi.mock("@/lib/rate-limit/check", () => ({
  checkAndConsume: mocks.checkAndConsume,
}));

vi.mock("next/headers", () => ({
  headers: mocks.headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { setPassword } from "./actions";

function validFormData() {
  const formData = new FormData();
  formData.set("password", "password123");
  formData.set("confirm", "password123");
  return formData;
}

describe("setPassword rate limit (HARDEN-06)", () => {
  beforeEach(() => {
    mocks.updateUser.mockClear();
    mocks.getUser.mockClear();
    mocks.checkAndConsume.mockClear();
    mocks.headersMock.mockClear();
    mocks.redirect.mockClear();
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "Learner@Example.COM" } },
    });
    mocks.updateUser.mockResolvedValue({ data: null, error: null });
    mocks.headersMock.mockResolvedValue(
      new Headers({ "x-forwarded-for": "203.0.113.1" }),
    );
    mocks.checkAndConsume.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns password validation errors before rate-limit checks", async () => {
    const short = new FormData();
    short.set("password", "short");
    short.set("confirm", "short");

    await expect(setPassword(null, short)).resolves.toEqual({
      ok: false,
      error: "Password must be at least 8 characters.",
    });
    expect(mocks.checkAndConsume).not.toHaveBeenCalled();

    const mismatch = new FormData();
    mismatch.set("password", "password123");
    mismatch.set("confirm", "different123");
    await expect(setPassword(null, mismatch)).resolves.toEqual({
      ok: false,
      error: "Passwords don't match.",
    });
    expect(mocks.checkAndConsume).not.toHaveBeenCalled();
  });

  it("returns the existing session-expired error before rate-limit checks when no user exists", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });

    await expect(setPassword(null, validFormData())).resolves.toEqual({
      ok: false,
      error: "Your session expired. Open the invite link again.",
    });
    expect(mocks.checkAndConsume).not.toHaveBeenCalled();
  });

  it("checks the IP gate before updateUser", async () => {
    await expect(setPassword(null, validFormData())).rejects.toThrow(
      "redirect:/dashboard",
    );

    expect(mocks.checkAndConsume).toHaveBeenNthCalledWith(1, {
      keyType: "ip",
      keyValue: "203.0.113.1",
      threshold: 5,
      windowSeconds: 15 * 60,
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "password123" });
  });

  it("checks the normalized authenticated user email before updateUser", async () => {
    await expect(setPassword(null, validFormData())).rejects.toThrow(
      "redirect:/dashboard",
    );

    expect(mocks.checkAndConsume).toHaveBeenNthCalledWith(2, {
      keyType: "email",
      keyValue: "learner@example.com",
      threshold: 3,
      windowSeconds: 60 * 60,
    });
  });

  it("returns an explicit retry error and skips updateUser when the IP gate denies", async () => {
    mocks.checkAndConsume.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 61,
    });

    await expect(setPassword(null, validFormData())).resolves.toEqual({
      ok: false,
      error: "Too many attempts. Try again in 2 minutes.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("returns an explicit retry error and skips updateUser when the email gate denies", async () => {
    mocks.checkAndConsume
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });

    await expect(setPassword(null, validFormData())).resolves.toEqual({
      ok: false,
      error: "Too many attempts. Try again in 1 minutes.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("calls updateUser and redirects when both gates allow", async () => {
    await expect(setPassword(null, validFormData())).rejects.toThrow(
      "redirect:/dashboard",
    );

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });
});
