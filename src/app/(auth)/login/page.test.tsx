import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: mocks.useActionState };
});

vi.mock("next/navigation", () => ({
  useSearchParams: mocks.useSearchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.useActionState.mockReturnValue([null, vi.fn(), false]);
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    window.history.replaceState(null, "", "/login");
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
});
