import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpeechBubble } from "./speech-bubble";

describe("<SpeechBubble />", () => {
  it.each([
    ["short", <span key="short">Short message</span>],
    ["multiline", <span key="multiline">One line<br />Two lines</span>],
  ])("uses one seamless tail centered on a %s left bubble", (_name, message) => {
    render(<SpeechBubble tail="left">{message}</SpeechBubble>);

    expect(screen.getByText(_name === "short" ? "Short message" : /One line/)).toBeVisible();
    const bubble = document.querySelector("[data-speech-bubble]");
    const tails = bubble?.querySelectorAll("[data-speech-bubble-tail]");
    expect(tails).toHaveLength(1);
    expect(tails?.[0]).toHaveAttribute("data-speech-bubble-tail", "left");
    expect(tails?.[0]).toHaveStyle({
      top: "50%",
      transform: "translateY(-50%)",
    });
  });
});
