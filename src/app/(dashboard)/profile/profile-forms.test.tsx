import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  updateProfile: vi.fn(async () => ({ ok: true })),
}));

import { UpdateNameForm } from "./profile-forms";

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
});
