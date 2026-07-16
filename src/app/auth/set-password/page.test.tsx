import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useActionState: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: mocks.useActionState };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { SetPasswordScreen } from "./page";

describe("SetPasswordScreen", () => {
  it("renders the invited-user setup fields without weakening constraints", () => {
    mocks.useActionState.mockReturnValue([null, vi.fn(), false]);

    render(<SetPasswordScreen email="learner@example.com" />);

    expect(
      screen.getByRole("heading", { name: "Set your password" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("learner@example.com");
    expect(screen.getByLabelText("New password")).toHaveAttribute("minlength", "8");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "minlength",
      "8",
    );
    expect(screen.getByText("At least 8 characters")).toBeVisible();
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeEnabled();
  });
});
