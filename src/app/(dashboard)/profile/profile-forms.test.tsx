import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  updateProfile: vi.fn(async () => ({ ok: true })),
  changePassword: vi.fn(async () => ({ ok: true })),
}));

import { ChangePasswordForm, UpdateNameForm } from "./profile-forms";

describe("profile forms", () => {
  it("keeps the certificate-name field and save action", () => {
    render(<UpdateNameForm defaultName="Sofia Ruiz" />);

    expect(screen.getByLabelText("Full name")).toHaveValue("Sofia Ruiz");
    expect(screen.getByLabelText("Full name")).toBeRequired();
    expect(screen.getByLabelText("Full name")).toHaveAttribute(
      "maxlength",
      "200",
    );
    expect(
      screen.getByRole("button", { name: "Save name" }),
    ).toBeEnabled();
  });

  it("keeps both password fields and the eight-character minimum", () => {
    render(<ChangePasswordForm />);

    const password = screen.getByLabelText("New password");
    const confirmation = screen.getByLabelText("Confirm new password");

    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("minlength", "8");
    expect(confirmation).toHaveAttribute("type", "password");
    expect(confirmation).toHaveAttribute("minlength", "8");
    expect(
      screen.getByRole("button", { name: "Change password" }),
    ).toBeEnabled();
  });
});
