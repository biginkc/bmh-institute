import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useActionState: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: mocks.useActionState };
});

import ForgotPasswordPage from "./page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    mocks.useActionState.mockReturnValue([null, vi.fn(), false]);
  });

  it("renders the reset request with the design-system copy", () => {
    render(<ForgotPasswordPage />);

    expect(
      screen.getByRole("heading", { name: "Reset password" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Work email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeEnabled();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("announces the existing privacy-safe success state", () => {
    mocks.useActionState.mockReturnValue([{ ok: true }, vi.fn(), false]);

    render(<ForgotPasswordPage />);

    expect(
      screen.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      /If the address is on file/i,
    );
  });
});
