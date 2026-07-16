import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoursesTable } from "./courses-table";

describe("<CoursesTable />", () => {
  it("keeps course counts, status, and edit navigation reachable", () => {
    render(
      <CoursesTable
        courses={[
          {
            id: "course-1",
            title: "Opening the call",
            is_published: true,
            moduleCount: 2,
            lessonCount: 7,
          },
        ]}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit opening the call/i })).toHaveAttribute(
      "href",
      "/admin/courses/course-1/edit",
    );
  });
});
