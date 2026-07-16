import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("<Button />", () => {
  it("renders every visual variant as a button", () => {
    const variants = ["primary", "secondary", "ghost", "dark", "warm"] as const;

    render(
      <>
        {variants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    );

    for (const variant of variants) {
      expect(screen.getByRole("button", { name: variant })).toBeVisible();
    }
  });
});
