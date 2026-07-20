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
});
