import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: mocks.useSearchParams,
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("exposes Hugo as the only authentication action", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: "Sign in to BMH Institute" }),
    ).toBeVisible();
    expect(screen.getByText(/Hugo is the secure BMH account/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue with Hugo" }),
    ).toBeEnabled();
    expect(screen.queryByLabelText("Work email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByText(/Forgot password/i)).not.toBeInTheDocument();
  });

  it("preserves a safe return path in the Hugo launch form", () => {
    mocks.useSearchParams.mockReturnValue(
      new URLSearchParams({ next: "/lessons/abc" }),
    );

    const { container } = render(<LoginPage />);

    const form = container.querySelector('form[action="/auth/hugo"]');
    expect(form).toHaveAttribute("method", "get");
    expect(form?.querySelector('input[name="next"]')).toHaveValue(
      "/lessons/abc",
    );
  });

  it("keeps the recovery surface usable after an OAuth callback failure", () => {
    mocks.useSearchParams.mockReturnValue(
      new URLSearchParams({ error: "sso_failed" }),
    );

    render(<LoginPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Hugo sign-in didn't complete. Try again or contact your administrator.",
    );
    expect(
      screen.getByRole("button", { name: "Continue with Hugo" }),
    ).toBeEnabled();
  });

  it("explains that an unprovisioned Hugo identity has no Institute access", () => {
    mocks.useSearchParams.mockReturnValue(
      new URLSearchParams({ error: "access_denied" }),
    );

    render(<LoginPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This Hugo account has not been granted access to BMH Institute.",
    );
  });
});
