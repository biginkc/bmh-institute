import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { LessonSearch } from "./lesson-search";

const lessons = [
  { id: "lesson-opening", title: "Opening the Call", href: "/lessons/lesson-opening" },
  { id: "lesson-objections", title: "Objection Architecture", href: "/lessons/lesson-objections" },
  { id: "lesson-tech", title: "Tech Stack", href: "/lessons/lesson-tech" },
  { id: "quiz-tech", title: "Tech quiz", href: "/lessons/lesson-tech?part=quiz" },
];

describe("<LessonSearch />", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "https://institute.test");
      const query = (url.searchParams.get("q") ?? "").toLocaleLowerCase();
      return new Response(JSON.stringify({
        results: lessons.filter((lesson) => lesson.title.toLocaleLowerCase().includes(query)).slice(0, 8),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  it("filters authorized lesson results and exposes combobox semantics", async () => {
    const user = userEvent.setup();
    render(<LessonSearch />);

    const search = screen.getByRole("combobox", { name: "Search lessons" });
    await user.type(search, "objection");

    expect(search).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("option", { name: "Objection Architecture" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Opening the Call" })).not.toBeInTheDocument();
  });

  it("supports arrow-key selection, Enter navigation, and Escape dismissal", async () => {
    const user = userEvent.setup();
    render(<LessonSearch />);
    const search = screen.getByRole("combobox", { name: "Search lessons" });

    await user.type(search, "tech");
    await screen.findByRole("option", { name: "Tech Stack" });
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/lessons/lesson-tech?part=quiz");

    await user.keyboard("{Escape}");
    expect(search).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a compact mobile search control", async () => {
    const user = userEvent.setup();
    render(<LessonSearch instanceId="mobile" compact />);

    const trigger = screen.getByRole("button", { name: "Search lessons" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Search lessons" })).toBeVisible();
  });

  it("uses the prevalidated composite destination for quiz search results", async () => {
    const user = userEvent.setup();
    render(<LessonSearch />);
    await user.type(screen.getByRole("combobox", { name: "Search lessons" }), "tech quiz");
    await screen.findByRole("option", { name: "Tech quiz" });
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/lessons/lesson-tech?part=quiz");
  });

  it("shows progress instead of a false empty result while a request is pending", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    })));
    const user = userEvent.setup();
    render(<LessonSearch />);

    await user.type(screen.getByRole("combobox", { name: "Search lessons" }), "opening");
    expect(await screen.findByText("Searching…")).toBeVisible();
    expect(screen.queryByText("No lessons found.")).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    resolveRequest?.(new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    expect(await screen.findByText("No lessons found.")).toBeVisible();
  });

  it("distinguishes a failed search from a valid empty result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const user = userEvent.setup();
    render(<LessonSearch />);

    await user.type(screen.getByRole("combobox", { name: "Search lessons" }), "opening");
    expect(await screen.findByText("Search unavailable. Try again.")).toBeVisible();
    expect(screen.queryByText("No lessons found.")).not.toBeInTheDocument();
  });

  it("uses unique combobox and listbox IDs for multiple header placements", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <LessonSearch instanceId="desktop" />
        <LessonSearch instanceId="mobile-open" />
      </>,
    );
    const searches = screen.getAllByRole("combobox", { name: "Search lessons" });
    await user.type(searches[0], "open");
    await user.type(searches[1], "tech");
    await screen.findByRole("option", { name: "Tech Stack" });

    const ids = Array.from(container.querySelectorAll("[id]"), (node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(searches[0].getAttribute("aria-controls")).not.toBe(
      searches[1].getAttribute("aria-controls"),
    );
  });
});
