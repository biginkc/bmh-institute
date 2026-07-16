import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LessonCard } from "./lesson-card";

describe("<LessonCard />", () => {
  it("blocks clicks while locked", () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <LessonCard title="Locked lesson" locked onClick={onClick} />,
    );

    expect(container.firstElementChild).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClick).not.toHaveBeenCalled();

    rerender(<LessonCard title="Open lesson" onClick={onClick} />);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClick).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole("button", { name: /open lesson/i }), {
      key: "Enter",
    });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
