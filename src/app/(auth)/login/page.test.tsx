import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useSearchParams: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: mocks.useActionState };
});

vi.mock("next/navigation", () => ({
  useSearchParams: mocks.useSearchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.useActionState.mockReturnValue([null, vi.fn(), false]);
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    window.history.replaceState(null, "", "/login");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the split brand panel and accessible sign-in form", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: /Complex deals,\s*made simple\./ }),
    ).toBeVisible();
    expect(screen.getByText(/Hi! I'm Andrea/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.getByLabelText("Work email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("announces an ordinary login error without replacing the form", () => {
    mocks.useActionState.mockReturnValue([
      { ok: false, error: "Email or password is incorrect." },
      vi.fn(),
      false,
    ]);

    render(<LoginPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("renders the dedicated suspended notice for the existing suspended error", () => {
    mocks.useActionState.mockReturnValue([
      {
        ok: false,
        error: "Your account has been suspended. Contact your administrator.",
      },
      vi.fn(),
      false,
    ]);

    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: "Account paused" }),
    ).toBeVisible();
    expect(screen.getByText(/access is currently suspended/i)).toBeVisible();
    expect(screen.queryByLabelText("Work email")).not.toBeInTheDocument();
  });

  it("hides the BMH ID button while the rollout flag is unset", () => {
    render(<LoginPage />);

    expect(
      screen.queryByRole("button", { name: "Continue with BMH ID" }),
    ).not.toBeInTheDocument();
  });

  it("starts the custom:bmh OAuth flow when the flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_BMH_ID_SSO", "1");
    mocks.useSearchParams.mockReturnValue(
      new URLSearchParams({ next: "/lessons/abc" }),
    );
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockReturnValue({ auth: { signInWithOAuth } });

    render(<LoginPage />);

    // Password form stays fully intact alongside the SSO button.
    expect(screen.getByLabelText("Work email")).toBeVisible();
    expect(screen.getByLabelText("Password")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Continue with BMH ID" }),
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "custom:bmh",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?flow=sso&next=${encodeURIComponent(
          "/lessons/abc",
        )}`,
      },
    });
  });

  // Real signInWithOAuth startup failures (PKCE storage/crypto/URL setup)
  // REJECT rather than resolving { error } — this SDK path never produces a
  // resolved error — so the regression pins the rejection shape.
  it("surfaces an error and re-enables the button when the BMH ID flow rejects", async () => {
    vi.stubEnv("NEXT_PUBLIC_BMH_ID_SSO", "1");
    const signInWithOAuth = vi
      .fn()
      .mockRejectedValue(new Error("PKCE code verifier storage unavailable"));
    mocks.createClient.mockReturnValue({ auth: { signInWithOAuth } });

    render(<LoginPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Continue with BMH ID" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "BMH ID sign-in couldn't start. Try again or use your password.",
    );
    expect(
      screen.getByRole("button", { name: "Continue with BMH ID" }),
    ).toBeEnabled();
  });

  it("shows the SSO-specific message when the callback redirects with error=sso_failed", () => {
    mocks.useSearchParams.mockReturnValue(
      new URLSearchParams({ error: "sso_failed" }),
    );

    render(<LoginPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "BMH ID sign-in didn't complete. Try again or use your password.",
    );
    // Password form stays usable.
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
