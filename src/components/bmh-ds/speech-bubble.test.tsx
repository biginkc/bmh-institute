import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpeechBubble } from "./speech-bubble";

describe("<SpeechBubble />", () => {
  it.each([
    ["left", "left", "M 21 1 L 1 16 L 21 31 Z", "M 18 1 L 1 16 L 18 31"],
    ["right", "right", "M 1 1 L 21 16 L 1 31 Z", "M 4 1 L 21 16 L 4 31"],
  ] as const)(
    "uses one seamless tail centered on a %s bubble",
    (tail, edge, fillPath, strokePath) => {
      render(<SpeechBubble tail={tail}>Short message</SpeechBubble>);

      expect(screen.getByText("Short message")).toBeVisible();
      const bubble = document.querySelector("[data-speech-bubble]");
      const tails = bubble?.querySelectorAll("[data-speech-bubble-tail]");
      expect(tails).toHaveLength(1);
      expect(tails?.[0]).toHaveAttribute("data-speech-bubble-tail", tail);
      expect(tails?.[0]).toHaveStyle({
        [edge]: "-18px",
        width: "22px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: "2",
      });
      expect(tails?.[0].querySelector("polygon")).not.toBeInTheDocument();
      expect(
        tails?.[0].querySelector("[data-speech-bubble-tail-fill]"),
      ).toHaveAttribute("d", fillPath);
      expect(
        tails?.[0].querySelector("[data-speech-bubble-tail-fill]"),
      ).toHaveAttribute("stroke", "none");
      expect(
        tails?.[0].querySelector("[data-speech-bubble-tail-stroke]"),
      ).toHaveAttribute("d", strokePath);
      expect(
        tails?.[0].querySelector("[data-speech-bubble-tail-stroke]"),
      ).toHaveAttribute("fill", "none");
      expect(document.querySelector("[data-speech-bubble-body]")).toHaveStyle({
        zIndex: "1",
      });
    },
  );

  it.each([
    ["bottom-left", "left", "24px"],
    ["bottom-right", "right", "24px"],
  ] as const)("keeps the %s tail attached to the matching edge", (tail, edge, offset) => {
    render(<SpeechBubble tail={tail}>Bottom message</SpeechBubble>);

    const pointer = document.querySelector(`[data-speech-bubble-tail="${tail}"]`);
    expect(pointer).toHaveStyle({
      [edge]: offset,
      top: "calc(100% - 4px)",
      zIndex: "2",
    });
    expect(pointer?.querySelector("polygon")).not.toBeInTheDocument();
    expect(pointer?.querySelector("[data-speech-bubble-tail-fill]")).toHaveAttribute(
      "d",
      "M 1 1 L 16 21 L 31 1 Z",
    );
    expect(pointer?.querySelector("[data-speech-bubble-tail-stroke]")).toHaveAttribute(
      "d",
      "M 1 4 L 16 21 L 31 4",
    );
  });
});
