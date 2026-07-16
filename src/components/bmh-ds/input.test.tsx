import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("<Input />", () => {
  it("renders the error message and danger border", () => {
    render(<Input label="Password" error="Must be 8+ characters" />);

    const input = screen.getByLabelText("Password");
    expect(screen.getByText("Must be 8+ characters")).toBeVisible();
    expect(input.parentElement?.getAttribute("style")).toContain(
      "border: 2px solid var(--danger)",
    );
  });
});
