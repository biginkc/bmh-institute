import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { LessonChapters } from "./lesson-chapters";

describe("<LessonChapters />", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("renders every chapter state and the real completed count", () => {
    render(
      <LessonChapters
        completedCount={1}
        chapters={[
          { id: "one", index: 1, title: "Orientation", status: "done" },
          { id: "two", index: 2, title: "Opening the call", active: true },
          { id: "three", index: 3, title: "Objections" },
          { id: "four", index: 4, title: "Role play", status: "locked" },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Chapters" })).toBeVisible();
    expect(screen.getByText("1 / 4 done")).toBeVisible();
    expect(screen.getByRole("button", { name: /orientation/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /opening the call/i })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: /objections/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /role play/i })).toBeDisabled();
  });

  it("navigates through the real lesson route for an unlocked chapter", () => {
    render(
      <LessonChapters
        completedCount={0}
        chapters={[
          { id: "lesson-2", index: 2, title: "Opening the call", active: true },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /opening the call/i }));

    expect(push).toHaveBeenCalledWith("/lessons/lesson-2");
  });
});
