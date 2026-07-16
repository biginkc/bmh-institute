import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it } from "vitest";

import { Mascot } from "./mascot";

describe("<Mascot />", () => {
  it("preserves the source implementation's runtime style and attribute forwarding", () => {
    const RuntimeMascot = Mascot as React.ComponentType<
      React.ComponentProps<typeof Mascot> & React.ImgHTMLAttributes<HTMLImageElement>
    >;

    render(
      <RuntimeMascot
        pose="wave"
        style={{ flexShrink: 0 }}
        data-testid="andrea"
      />,
    );

    expect(screen.getByTestId("andrea")).toHaveStyle({ flexShrink: 0 });
  });
});
