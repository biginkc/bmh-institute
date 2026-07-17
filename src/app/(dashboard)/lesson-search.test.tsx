import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { LessonSearch } from "./lesson-search";

const lessons = [
  { id: "lesson-opening", title: "Opening the Call" },
  { id: "lesson-objections", title: "Objection Architecture" },
  { id: "lesson-tech", title: "Tech Stack" },
];

describe("<LessonSearch />", () => {
  beforeEach(() => push.mockReset());

  it("filters authorized lesson results and exposes combobox semantics", async () => {
    const user = userEvent.setup();
    render(<LessonSearch lessons={lessons} />);

    const search = screen.getByRole("combobox", { name: "Search lessons" });
    await user.type(search, "objection");

    expect(search).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Objection Architecture" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Opening the Call" })).not.toBeInTheDocument();
  });

  it("supports arrow-key selection, Enter navigation, and Escape dismissal", async () => {
    const user = userEvent.setup();
    render(<LessonSearch lessons={lessons} />);
    const search = screen.getByRole("combobox", { name: "Search lessons" });

    await user.type(search, "o");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/lessons/lesson-objections");

    await user.keyboard("{Escape}");
    expect(search).toHaveAttribute("aria-expanded", "false");
  });
});
