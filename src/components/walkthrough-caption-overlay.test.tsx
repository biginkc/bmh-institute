import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalkthroughCaptionOverlay } from "./walkthrough-caption-overlay";

const searchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock(),
}));

describe("WalkthroughCaptionOverlay", () => {
  beforeEach(() => {
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it("stays hidden without a walkthrough caption", () => {
    render(<WalkthroughCaptionOverlay />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders a bounded bottom overlay for walkthrough captions", () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams({
        walkthroughCaption:
          "Step 1: This learner dashboard shows assigned onboarding content.",
      }),
    );

    render(<WalkthroughCaptionOverlay />);

    const overlay = screen.getByRole("status");
    expect(overlay).toHaveTextContent(
      "Step 1: This learner dashboard shows assigned onboarding content.",
    );
    expect(overlay).toHaveClass("fixed");
    expect(overlay).toHaveClass("bottom-4");
    expect(overlay).toHaveClass("max-h-[18vh]");
    expect(overlay).toHaveClass("bg-slate-950/80");
    expect(overlay).toHaveClass("text-white");
  });
});
