import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpeechBubble } from "./speech-bubble";

describe("<SpeechBubble />", () => {
  it.each([
    ["left", "left", "21,1 1,16 21,31"],
    ["right", "right", "1,1 21,16 1,31"],
  ] as const)("uses one seamless tail centered on a %s bubble", (tail, edge, points) => {
    render(<SpeechBubble tail={tail}>Short message</SpeechBubble>);

    expect(screen.getByText("Short message")).toBeVisible();
    const bubble = document.querySelector("[data-speech-bubble]");
    const tails = bubble?.querySelectorAll("[data-speech-bubble-tail]");
    expect(tails).toHaveLength(1);
    expect(tails?.[0]).toHaveAttribute("data-speech-bubble-tail", tail);
    expect(tails?.[0]).toHaveStyle({
      [edge]: "-18px",
      top: "50%",
      transform: "translateY(-50%)",
    });
    expect(tails?.[0].querySelector("polygon")).toHaveAttribute(
      "points",
      points,
    );
  });

  it.each([
    ["bottom-left", "left", "24px"],
    ["bottom-right", "right", "24px"],
  ] as const)("keeps the %s tail attached to the matching edge", (tail, edge, offset) => {
    render(<SpeechBubble tail={tail}>Bottom message</SpeechBubble>);

    const pointer = document.querySelector(`[data-speech-bubble-tail="${tail}"]`);
    expect(pointer).toHaveStyle({
      [edge]: offset,
      top: "calc(100% - 4px)",
    });
  });
});
