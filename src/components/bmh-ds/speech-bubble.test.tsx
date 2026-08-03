import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpeechBubble } from "./speech-bubble";

describe("<SpeechBubble />", () => {
  it.each([
    ["left", "left", "M 27 1 L 1 16 L 27 31"],
    ["right", "right", "M 1 1 L 27 16 L 1 31"],
  ] as const)("uses one seamless tail centered on a %s bubble", (tail, edge, path) => {
    render(<SpeechBubble tail={tail}>Short message</SpeechBubble>);

    expect(screen.getByText("Short message")).toBeVisible();
    const bubble = document.querySelector("[data-speech-bubble]");
    const tails = bubble?.querySelectorAll("[data-speech-bubble-tail]");
    expect(tails).toHaveLength(1);
    expect(tails?.[0]).toHaveAttribute("data-speech-bubble-tail", tail);
    expect(tails?.[0]).toHaveStyle({
      [edge]: "-18px",
      width: "28px",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: "2",
    });
    expect(tails?.[0].querySelector("polygon")).not.toBeInTheDocument();
    expect(tails?.[0].querySelector("path")).toHaveAttribute("d", path);
    expect(document.querySelector("[data-speech-bubble-body]")).toHaveStyle({
      zIndex: "1",
    });
  });

  it.each([
    ["bottom-left", "left", "24px", "M 1 1 L 16 21 L 31 1"],
    ["bottom-right", "right", "24px", "M 1 1 L 16 21 L 31 1"],
  ] as const)("keeps the %s tail attached to the matching edge", (tail, edge, offset, path) => {
    render(<SpeechBubble tail={tail}>Bottom message</SpeechBubble>);

    const pointer = document.querySelector(`[data-speech-bubble-tail="${tail}"]`);
    expect(pointer).toHaveStyle({
      [edge]: offset,
      top: "calc(100% - 4px)",
      zIndex: "2",
    });
    expect(pointer?.querySelector("polygon")).not.toBeInTheDocument();
    expect(pointer?.querySelector("path")).toHaveAttribute("d", path);
  });
});
