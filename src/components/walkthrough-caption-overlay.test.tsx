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
    window.sessionStorage.clear();
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

  it("renders persistent wizard controls when step links are provided", () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams({
        walkthroughCaption: "Step 2: Review the dashboard.",
        walkthroughBack: "/login?walkthrough=demo&step=1",
        walkthroughNext: "/courses/demo?walkthrough=demo&step=3",
      }),
    );

    render(<WalkthroughCaptionOverlay />);

    const overlay = screen.getByRole("status");
    expect(overlay).toHaveClass("pointer-events-auto");
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/login?walkthrough=demo&step=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/courses/demo?walkthrough=demo&step=3",
    );
  });

  it("keeps disabled wizard controls visible at the beginning and end", () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams({
        walkthroughCaption: "Step 1: Start here.",
        walkthroughNext: "/dashboard?walkthrough=demo&step=2",
      }),
    );

    render(<WalkthroughCaptionOverlay />);

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Next" })).toBeTruthy();
  });

  it("saves active walkthrough state from URL params", () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams({
        walkthroughCaption: "Step 2: Review the dashboard.",
        walkthroughBack: "/login?walkthrough=demo&step=1",
        walkthroughNext: "/courses/demo?walkthrough=demo&step=3",
      }),
    );

    render(<WalkthroughCaptionOverlay />);

    expect(
      JSON.parse(
        window.sessionStorage.getItem("bmh-institute.walkthrough") ?? "{}",
      ),
    ).toEqual({
      caption: "Step 2: Review the dashboard.",
      backHref: "/login?walkthrough=demo&step=1",
      nextHref: "/courses/demo?walkthrough=demo&step=3",
    });
  });

  it("restores active walkthrough state when refreshed without params", () => {
    window.sessionStorage.setItem(
      "bmh-institute.walkthrough",
      JSON.stringify({
        caption: "Step 2: Review the dashboard.",
        backHref: "/login?walkthrough=demo&step=1",
        nextHref: "/courses/demo?walkthrough=demo&step=3",
      }),
    );

    render(<WalkthroughCaptionOverlay />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Step 2: Review the dashboard.",
    );
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/login?walkthrough=demo&step=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/courses/demo?walkthrough=demo&step=3",
    );
  });
});
