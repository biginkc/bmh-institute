// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { learnerOutlineFixture } from "@/lib/courses/learner-outline.test-helpers";

import { LearnerCourseBrowser } from "./learner-course-browser";

afterEach(cleanup);

describe("LearnerCourseBrowser", () => {
  it("paginates module groups while keeping all 25 lessons in the progress rail", () => {
    render(React.createElement(LearnerCourseBrowser, {
      outline: learnerOutlineFixture(),
      page: 1,
      pageHref: "/dashboard",
    }));
    const rail = screen.getByRole("navigation", { name: "All course lessons" });
    expect(within(rail).getAllByRole("listitem")).toHaveLength(25);
    expect(screen.getByText("Page 1 of 3")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/dashboard?page=2",
    );
  });

  it("does not make locked grid tiles or rail rows clickable", () => {
    render(React.createElement(LearnerCourseBrowser, {
      outline: learnerOutlineFixture(),
      page: 1,
      pageHref: "/dashboard",
    }));
    const lockedLabels = screen.getAllByText("Topic 5");
    expect(lockedLabels).toHaveLength(2);
    for (const label of lockedLabels) {
      expect(label.closest("a")).toBeNull();
    }
  });

  it("renders an explicitly synthetic module as an unlabeled lesson group", () => {
    const outline = learnerOutlineFixture(3);
    outline.modules[0].title = "";
    for (const tile of outline.tiles) tile.moduleTitle = "";

    render(React.createElement(LearnerCourseBrowser, {
      outline,
      page: 1,
      pageHref: "/dashboard",
    }));

    expect(screen.queryByText("Module 1")).toBeNull();
    expect(screen.getAllByText("Topic 1")).toHaveLength(2);
  });

  it("keeps a meaningful label on a one-module hand-authored outline", () => {
    const outline = learnerOutlineFixture(3);

    render(React.createElement(LearnerCourseBrowser, {
      outline,
      page: 1,
      pageHref: "/dashboard",
    }));

    expect(screen.getAllByText("Module 1")).toHaveLength(2);
  });

  it("shows approved artwork as a full thumbnail panel for content lessons only", () => {
    const outline = learnerOutlineFixture(4);
    outline.tiles[0].thumbnailUrl = "https://assets.example/welcome.webp";
    outline.tiles[3].thumbnailUrl = "https://assets.example/assignment.webp";

    render(React.createElement(LearnerCourseBrowser, {
      outline,
      page: 1,
      pageHref: "/dashboard",
    }));

    const thumbnail = screen.getByRole("img", { name: "Topic 1 thumbnail" });
    expect(thumbnail.getAttribute("src")).toBe("https://assets.example/welcome.webp");
    expect(thumbnail.parentElement?.className).toContain("aspect-[16/10]");
    expect(screen.queryByRole("img", { name: "Assignment 4 thumbnail" })).toBeNull();
  });
});
