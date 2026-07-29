import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Coach } from "./coach";

describe("<Coach /> speech bubble direction", () => {
  it.each([
    ["left", "left"],
    ["right", "right"],
  ] as const)("points from a %s bubble edge toward Andrea", (side, expectedTail) => {
    const { container } = render(
      <Coach side={side} message={`Andrea is on the ${side}.`} />,
    );

    expect(
      container.querySelector("[data-speech-bubble-tail]"),
    ).toHaveAttribute("data-speech-bubble-tail", expectedTail);
  });
});
