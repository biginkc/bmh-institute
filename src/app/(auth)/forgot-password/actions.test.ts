import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn(async () => ({
  data: null,
  error: null as { message: string } | null,
}));
const checkAndConsume = vi.fn(async () => ({
  allowed: true,
  retryAfterSeconds: 0,
}));
const headersMock = vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.1" }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { resetPasswordForEmail },
  })),
}));

vi.mock("@/lib/rate-limit/check", () => ({
  checkAndConsume,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

import { sendPasswordReset } from "./actions";

describe("sendPasswordReset rate limit (HARDEN-06)", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockClear();
    checkAndConsume.mockClear();
    headersMock.mockClear();
    headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.1" }));
    checkAndConsume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an email-required error before rate-limit checks", async () => {
    const formData = new FormData();

    await expect(sendPasswordReset(null, formData)).resolves.toEqual({
      ok: false,
      error: "Email is required.",
    });
    expect(checkAndConsume).not.toHaveBeenCalled();
  });

  it("checks the IP gate before resetPasswordForEmail", async () => {
    const formData = new FormData();
    formData.set("email", "learner@example.com");

    await sendPasswordReset(null, formData);

    expect(checkAndConsume).toHaveBeenNthCalledWith(1, {
      keyType: "ip",
      keyValue: "203.0.113.1",
      threshold: 5,
      windowSeconds: 15 * 60,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("checks the normalized email gate before resetPasswordForEmail", async () => {
    const formData = new FormData();
    formData.set("email", "  Learner@Example.COM  ");

    await sendPasswordReset(null, formData);

    expect(checkAndConsume).toHaveBeenNthCalledWith(2, {
      keyType: "email",
      keyValue: "learner@example.com",
      threshold: 3,
      windowSeconds: 60 * 60,
    });
  });

  it("silently succeeds and skips Supabase auth when the IP gate denies", async () => {
    checkAndConsume.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 60,
    });
    const formData = new FormData();
    formData.set("email", "learner@example.com");

    await expect(sendPasswordReset(null, formData)).resolves.toEqual({
      ok: true,
    });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("silently succeeds and skips Supabase auth when the email gate denies", async () => {
    checkAndConsume
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });
    const formData = new FormData();
    formData.set("email", "learner@example.com");

    await expect(sendPasswordReset(null, formData)).resolves.toEqual({
      ok: true,
    });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("calls resetPasswordForEmail when both gates allow", async () => {
    const formData = new FormData();
    formData.set("email", "learner@example.com");

    await expect(sendPasswordReset(null, formData)).resolves.toEqual({
      ok: true,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("learner@example.com", {
      redirectTo: "https://bmh-institute.vercel.app/auth/callback",
    });
  });
});
