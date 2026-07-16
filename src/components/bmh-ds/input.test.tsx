import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "./input";

describe("<Input />", () => {
  it("renders the error message and danger border", () => {
    render(<Input label="Password" error="Must be 8+ characters" />);

    const input = screen.getByLabelText("Password");
    expect(screen.getByText("Must be 8+ characters")).toBeVisible();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Must be 8+ characters");
    expect(input.parentElement?.getAttribute("style")).toContain(
      "border: 2px solid var(--danger)",
    );
  });

  it("keeps its focus state while composing consumer focus handlers", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(<Input label="Email" onFocus={onFocus} onBlur={onBlur} />);

    const input = screen.getByLabelText("Email");
    fireEvent.focus(input);
    expect(onFocus).toHaveBeenCalledOnce();
    expect(input.parentElement?.getAttribute("style")).toContain(
      "border: 2px solid var(--action)",
    );

    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledOnce();
    expect(input.parentElement?.getAttribute("style")).toContain(
      "border: 2px solid var(--ink-300)",
    );
  });
});
