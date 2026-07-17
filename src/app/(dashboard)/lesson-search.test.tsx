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

  it("opens a compact mobile search control", async () => {
    const user = userEvent.setup();
    render(<LessonSearch lessons={lessons} instanceId="mobile" compact />);

    const trigger = screen.getByRole("button", { name: "Search lessons" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Search lessons" })).toBeVisible();
  });

  it("uses unique combobox and listbox IDs for multiple header placements", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <LessonSearch lessons={lessons} instanceId="desktop" />
        <LessonSearch lessons={lessons} instanceId="mobile-open" />
      </>,
    );
    const searches = screen.getAllByRole("combobox", { name: "Search lessons" });
    await user.type(searches[0], "open");
    await user.type(searches[1], "tech");

    const ids = Array.from(container.querySelectorAll("[id]"), (node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(searches[0].getAttribute("aria-controls")).not.toBe(
      searches[1].getAttribute("aria-controls"),
    );
  });
});
