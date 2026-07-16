import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "./progress-bar";

function fillWidth(container: HTMLElement) {
  const fill = container.firstElementChild?.firstElementChild?.firstElementChild;
  return fill?.getAttribute("style") ?? "";
}

describe("<ProgressBar />", () => {
  it("clamps progress below 0 and above 100", () => {
    const { container, rerender } = render(
      <ProgressBar value={150} max={100} showLabel />,
    );

    expect(fillWidth(container)).toContain("width: 100%");
    expect(screen.getByText("100%")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    rerender(<ProgressBar value={-20} max={100} showLabel />);
    expect(fillWidth(container)).toContain("width: 0%");
    expect(screen.getByText("0%")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("treats a non-positive maximum as zero progress", () => {
    const { container } = render(<ProgressBar value={10} max={0} showLabel />);

    expect(fillWidth(container)).toContain("width: 0%");
    expect(screen.getByText("0%")).toBeVisible();
  });
});
